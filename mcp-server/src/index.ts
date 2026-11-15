import { startServer } from './server.js';

startServer().catch((err) => {
  console.error('[RepoStack MCP] Fatal error:', err.message);
  process.exit(1);
});

