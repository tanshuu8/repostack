/**
 * @fileoverview Re-export of MCP tool definitions and handlers for registration.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListFilesTool } from './list-files.js';
import { registerReadFileTool } from './read-file.js';
import { registerSearchWorkspaceTool } from './search-workspace.js';

export function registerAllTools(mcp: McpServer, workspaceRoot: string): void {
  registerListFilesTool(mcp, workspaceRoot);
  registerReadFileTool(mcp, workspaceRoot);
  registerSearchWorkspaceTool(mcp, workspaceRoot);
}

