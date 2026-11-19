# RepoStack MCP Server

> **Repository Intelligence Layer** — An MCP (Model Context Protocol) server that exposes safe, read-only repository exploration tools to AI agents.

## Overview

The RepoStack MCP Server provides AI coding agents with structured, secure access to a local repository workspace. It exposes three core tools over an HTTP/JSON-RPC endpoint compliant with the [Model Context Protocol](https://modelcontextprotocol.io/) specification.

```
┌─────────────────────┐     HTTP/JSON-RPC      ┌──────────────────────┐
│   AI Agent / IDE    │ ◄──────────────────────► │  RepoStack MCP Server│
│  (MCP Client)       │   http://127.0.0.1:3001  │   (this package)     │
└─────────────────────┘                          └──────────┬───────────┘
                                                            │ read-only
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │   Your Repository    │
                                                 │  (REPOSTACK_WORKSPACE)│
                                                 └──────────────────────┘
```

## Key Capabilities & Features

- 🔍 **`list_files`** — Recursively browse workspace tree with configurable depth and path filtering
- 📖 **`read_file`** — Read any UTF-8 source or config file safely with size validation (up to 1 MB)
- 🔎 **`search_workspace`** — Full-text regex and substring search across files with glob filtering
- 🛡️ **Security-first** — Path traversal prevention, symlink escape detection, sensitive file blocking
- 🚫 **Smart exclusions** — Automatically skips `node_modules`, `.git`, `dist`, `build`, and binary files
- ⚡ **Stateless HTTP** — Each request is independent; compliant with JSON-RPC 2.0 and MCP specs

## Prerequisites

- [Node.js](https://nodejs.org/) v22 or later (required for built-in `fetch`)
- npm v8+

## Installation

```bash
cd mcp-server
npm install
```

## Configuration

The server requires one environment variable:

| Variable | Required | Description |
|---|---|---|
| `REPOSTACK_WORKSPACE` | ✅ Yes | Absolute path to the repository directory to expose |
| `PORT` | No | Server HTTP listening port (default: `3001`) |

### Setting the workspace

**PowerShell:**
```powershell
$env:REPOSTACK_WORKSPACE = "C:\path\to\your\repo"
```

**bash / zsh:**
```bash
export REPOSTACK_WORKSPACE=/path/to/your/repo
```

## Running the Server

### Development (with hot reload)

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

The server starts at `http://127.0.0.1:3001` by default.

## MCP Endpoint

| Endpoint | Method | Description |
|---|---|---|
| `/mcp` | POST | MCP JSON-RPC endpoint |
| `/health` | GET | Health check (returns JSON) |

### Health Check

```bash
curl http://127.0.0.1:3001/health
```

```json
{
  "status": "ok",
  "service": "repostack-mcp-server",
  "version": "1.0.0",
  "workspace": "C:\\path\\to\\repo",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

## Available Tools

### `list_files`

List files and directories within the workspace.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `path` | string | `"."` | Relative directory path |
| `recursive` | boolean | `false` | Recurse into subdirectories |
| `max_depth` | number | `3` | Max recursion depth (1–10) |
| `include_hidden` | boolean | `false` | Include dot-files/directories |

**Example request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_files",
    "arguments": { "path": "src", "recursive": true }
  }
}
```

---

### `read_file`

Read the contents of a source or config file.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | ✅ | Relative path to the file |

**Limits:** UTF-8 text only, max 1 MB.

**Example request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": { "path": "src/index.ts" }
  }
}
```

---

### `search_workspace`

Search for text across all source files.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | string | — | Text to search for |
| `path` | string | `"."` | Directory to search within |
| `file_pattern` | string | `"*"` | Glob filter (e.g., `"*.ts"`) |
| `case_sensitive` | boolean | `false` | Case-sensitive search |
| `max_results` | number | `50` | Max matches (1–200) |

**Example request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "search_workspace",
    "arguments": {
      "query": "TODO",
      "file_pattern": "*.ts",
      "max_results": 20
    }
  }
}
```

## Security

The server enforces multiple layers of protection:

### Path Validation
- **Absolute paths rejected** — All inputs must be relative paths
- **Traversal blocked** — `../` segments are detected and rejected before resolution
- **Prefix attack prevention** — Resolved paths are checked with trailing separator to prevent `/workspace-extra` style escapes
- **Symlink escape detection** — `fs.realpathSync` is used to detect symlinks pointing outside the workspace

### Sensitive File Blocking

The following file patterns are never returned:

| Pattern | Examples |
|---|---|
| `.env` files | `.env`, `.env.local`, `.env.production` |
| Private keys | `*.pem`, `*.key`, `*.p12`, `*.pfx` |
| SSH keys | `id_rsa`, `id_ed25519`, `id_ecdsa` |
| Credential files | `credentials.json`, `secrets.json` |
| Tool configs | `.npmrc`, `.netrc` |

### Excluded Directories

The following directories are always skipped:

`node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.venv`, `venv`, `__pycache__`, `.nyc_output`, `.cache`, `out`, `.turbo`, `.parcel-cache`

### Binary File Filtering

Binary files (images, archives, executables, fonts, databases, etc.) are excluded from reading and search.

## Development

### Project Structure

```
mcp-server/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Express + MCP server setup
│   ├── config/
│   │   └── workspace.ts      # Workspace config loader
│   ├── security/
│   │   ├── path-validator.ts # Path traversal / escape prevention
│   │   └── file-filter.ts    # Sensitive/binary/excluded file filters
│   ├── tools/
│   │   ├── index.ts          # Tool registration barrel
│   │   ├── list-files.ts     # list_files tool
│   │   ├── read-file.ts      # read_file tool
│   │   └── search-workspace.ts # search_workspace tool
│   └── utils/
│       └── errors.ts         # Error utilities
├── tests/
│   └── server.test.ts        # Test suite (Node.js built-in runner)
├── dist/                     # Compiled output (after build)
├── package.json
└── tsconfig.json
```

### Running Tests

```bash
$env:REPOSTACK_WORKSPACE = "C:\path\to\repo"
node --import tsx/esm tests/server.test.ts
```

### Type Checking

```bash
npm run typecheck
```

### Building

```bash
npm run build
```

## Configuring in an MCP Client

Add the following to your MCP client configuration (e.g., Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "repostack": {
      "command": "node",
      "args": ["C:\\path\\to\\repostack\\mcp-server\\dist\\index.js"],
      "env": {
        "REPOSTACK_WORKSPACE": "C:\\path\\to\\your\\repo"
      }
    }
  }
}
```

Or for the HTTP transport (when the server is already running):

```json
{
  "mcpServers": {
    "repostack": {
      "url": "http://127.0.0.1:3001/mcp"
    }
  }
}
```

## License

ISC

