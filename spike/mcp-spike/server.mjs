// spike/mcp-spike/server.mjs
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/user/OneDrive/Desktop/repostack/mcp-server/package.json');

const express = req('express');
const { z } = req('zod');
const { McpServer } = req('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = req('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpExpressApp } = req('@modelcontextprotocol/sdk/server/express.js');

const PORT = 3002;
const HOST = '127.0.0.1';

const app = createMcpExpressApp({ host: HOST });
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'spike-mcp-server' });
});

app.all('/mcp', async (req, res) => {
  const mcp = new McpServer({
    name: 'spike-mcp',
    version: '1.0.0',
  });

  // Tool 1: list_files (read-only, harmless)
  mcp.registerTool(
    'list_files',
    {
      description: 'List mock files in repository',
      inputSchema: { path: z.string().optional().default('.') },
    },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(['src/index.ts', 'README.md', 'example.txt']) }],
    })
  );

  // Tool 2: read_file (read-only, harmless)
  mcp.registerTool(
    'read_file',
    {
      description: 'Read mock file content',
      inputSchema: { path: z.string() },
    },
    async ({ path }) => ({
      content: [{ type: 'text', text: `Mock content of ${path}:\nHello old world` }],
    })
  );

  // Tool 3: echo_edit (modification tool requiring approval)
  mcp.registerTool(
    'echo_edit',
    {
      description: 'Propose replacing old_string with new_string in a file. Requires user approval.',
      inputSchema: {
        path: z.string().describe('File path to modify'),
        old_string: z.string().describe('Text to replace'),
        new_string: z.string().describe('Replacement text'),
      },
    },
    async ({ path, old_string, new_string }) => {
      console.log(`[spike-mcp] echo_edit executed for ${path}: "${old_string}" -> "${new_string}"`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'staged',
              file: path,
              hunk: {
                deleted: old_string,
                added: new_string,
              },
              message: 'Preview only. No file modified.',
            }),
          },
        ],
      };
    }
  );

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } finally {
    await transport.close().catch(() => {});
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Spike MCP server listening on http://${HOST}:${PORT}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
