# TrueForge Verification Spike — Baseline Environment

> Date: 2026-10-30  
> Target: TrueForge Agent Harness v0.182.0  
> Host: Windows 11 Enterprise (Build 26100), Node.js v22.18.0, npm 10.9.3  

---

## 1. Host Environment & Runtime Specs

| Property | Value | Notes |
|---|---|---|
| **Operating System** | Windows 11 (64-bit) | Localhost resolution subject to IPv4/IPv6 dual stack |
| **Node.js Version** | `v22.18.0` | Built-in `fetch`, ESM support enabled |
| **npm Version** | `10.9.3` | Global cache at `AppData/Local/npm-cache` |
| **Python Version** | `3.13.3` | Primary test runner runtime |
| **pytest Version** | `9.1.1` | Baseline testing suite |
| **Git Version** | `2.49.0.windows.1` | Git for Windows |
| **Project Root** | `C:\Users\user\OneDrive\Desktop\repostack` | Host repository |

---

## 2. TrueForge Server & SDK Details

| Component | Path / Details |
|---|---|
| **TrueForge Package** | `@truefoundry/trueforge` version `0.182.0` |
| **TrueForge Install Location** | `C:\Users\user\AppData\Local\npm-cache\_npx\18da9bb0c07c9a14\node_modules\@truefoundry\trueforge` |
| **TrueForge SDK Package** | `@truefoundry/trueforge-sdk` version `0.182.0` |
| **SDK Type Definitions** | `.../node_modules/@truefoundry/trueforge-sdk/dist/esm/index.d.mts` |
| **SDK Implementation** | `.../node_modules/@truefoundry/trueforge-sdk/dist/esm/index.mjs` |
| **Server Startup Command** | `$env:OUTBOUND_URL_ALLOWED_HOSTS = '["127.0.0.1","localhost"]'; npx @truefoundry/trueforge@latest` |
| **Active Port** | `8790` (Listening on IPv6 `[::1]`) |

---

## 3. Existing Agents & MCP Connectors (Preserved Intact)

### Existing Agents
1. **`repostackv1`** (ID: `01m66922t7hv9ta0v0a5f434rw`):
   - Model: `google-gemini/gemini-3-1-flash-lite` (Reasoning: `high`)
   - Description: Comprehensive system instructions; 0 MCP tools attached.
2. **`v2`** (ID: `01m66p45zv5x7hg15y9r4m6y61`):
   - Model: `google-gemini/gemini-3-1-flash-lite` (Reasoning: `high`)
   - Connectors: `repostack-mcp` (Tools: `list_files`, `read_file`, `search_workspace`).
   - Instructions: Empty.

### Existing Connectors
- **`repostack-mcp`**:
  - URL: `http://127.0.0.1:3001/mcp`
  - Auth Status: OK / Connected
  - Tools Exposed: `list_files`, `read_file`, `search_workspace`

---

## 4. Known Windows Constraints
- **Sandbox**: TrueForge `LocalSandboxProvider` requires Linux/macOS container primitives; `sandbox: { enabled: false }` is enforced on Windows.
- **Port Binding**: By default, Node.js HTTP server without an explicit host string binds to `::1` or `0.0.0.0` depending on Windows dual-stack socket options.

