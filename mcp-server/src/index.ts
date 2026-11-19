/**
 * @fileoverview CLI entry point for the RepoStack MCP server.
 * Initializes workspace configuration and launches the HTTP listener.
 */
import { startServer } from './server.js';

startServer().catch((err) => {
  console.error('[RepoStack MCP] Fatal error:', err.message);
  process.exit(1);
});

