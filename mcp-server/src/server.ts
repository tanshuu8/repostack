/**
 * @fileoverview Express application factory and MCP SSE transport endpoint.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import express from 'express';
import { loadWorkspaceConfig } from './config/workspace.js';
import { registerAllTools } from './tools/index.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = '127.0.0.1';

export async function startServer(): Promise<void> {
  // Validate workspace configuration before starting
  const workspaceConfig = loadWorkspaceConfig();
  console.log(`[RepoStack MCP] Workspace root: ${workspaceConfig.root}`);

  // Create the Express app pre-configured for MCP (includes DNS rebinding protection)
  const app = createMcpExpressApp({ host: HOST });

  // Parse JSON bodies
  app.use(express.json({ limit: '4mb' }));

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'repostack-mcp-server',
      version: '1.0.0',
      workspace: workspaceConfig.root,
      timestamp: new Date().toISOString(),
    });
  });

  // MCP endpoint — stateless: fresh McpServer + transport per request
  // This is required because McpServer.connect() can only be called once per instance
  // (protocol.ts throws "Already connected" if connect() is called again without close()).
  app.all('/mcp', async (req, res) => {
    const mcp = new McpServer({
      name: 'repostack-mcp-server',
      version: '1.0.0',
    });

    registerAllTools(mcp, workspaceConfig.root);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });

    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
      console.error('[RepoStack MCP] Request error:', err);
    } finally {
      // Clean up transport resources after each stateless request
      await transport.close().catch(() => { /* ignore close errors */ });
    }
  });

  return new Promise((resolve, reject) => {
    const httpServer = app.listen(PORT, HOST, () => {
      console.log(`[RepoStack MCP] Server listening on http://${HOST}:${PORT}`);
      console.log(`[RepoStack MCP] MCP endpoint: http://${HOST}:${PORT}/mcp`);
      console.log(`[RepoStack MCP] Health check: http://${HOST}:${PORT}/health`);
      resolve();
    });

    httpServer.on('error', (err) => {
      reject(err);
    });
  });
}
