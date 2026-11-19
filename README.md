# RepoStack ⚡

> **Editor-native, repository-aware autonomous AI coding agent for Visual Studio Code, powered by TrueForge.**  
> *Developed for the TrueFoundry Forge-a-thon @ IIT Bombay Techfest 2026–27.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-v22+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![MCP Spec](https://img.shields.io/badge/MCP-Compliant-orange.svg)](https://modelcontextprotocol.io/)
[![TrueForge](https://img.shields.io/badge/Agent%20Runtime-TrueForge%20v0.182-purple.svg)](https://github.com/truefoundry/trueforge)
[![Tests Passing](https://img.shields.io/badge/Tests-47%20passed%20%7C%200%20failed-brightgreen.svg)](mcp-server/tests/server.test.ts)

---

## 🚀 Overview

**RepoStack** transforms Visual Studio Code into an autonomous engineering workbench. Instead of pasting code snippets back and forth into an isolated chat sidebar, RepoStack empowers an autonomous agent running inside **TrueForge** to understand your entire repository, search for relevant implementations, stage surgical multi-file edits, and present every single hunk for your granular review before any change touches disk.

### What RepoStack Is:
- **Editor-Native**: Deeply integrated into Visual Studio Code with native diff decorations, hunk-by-hunk acceptance, and inline context selection.
- **Repository-Aware**: Navigates multi-folder projects, parses file relationships, and tracks definitions across languages.
- **Human-in-the-Loop by Design**: The AI *proposes* changes into a secure staging sandbox; you retain 100% control to accept, reject, or undo edits on a per-hunk basis.
- **Powered by TrueForge**: Driven natively by TrueForge's session management, model orchestration, context compaction, and tool approval loop.

### What RepoStack Is NOT:
- ❌ Not a generic chatbot wrapper around Gemini or OpenAI.
- ❌ Not a standalone IDE fork that forces you to abandon your VS Code setup.
- ❌ Not a destructive auto-coder that silently overwrites files on your disk.

---

## 🏗️ System Architecture

RepoStack is engineered as a clean, decoupled three-tier system:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                VISUAL STUDIO CODE                               │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                         RepoStack Extension Tier                        │   │
│   │                                                                         │   │
│   │  ┌───────────────────────┐ ┌──────────────────────┐ ┌────────────────┐  │   │
│   │  │  Sidebar / Webview UI │ │ Inline Diff View   │ │ Context Parser │  │   │
│   │  │  (Chat, Stream, Tools)│ │ (Hunk Decorations) │ │ (@file/@symbol)│  │   │
│   │  └───────────┬───────────┘ └──────────┬───────────┘ └───────┬────────┘  │   │
│   │              │                        │                     │           │   │
│   │  ┌───────────▼────────────────────────▼─────────────────────▼────────┐  │   │
│   │  │                       Extension Controller                        │  │   │
│   │  │  - Proposal Staging Manager            - Undo History Stack       │  │   │
│   │  │  - Hunk Review & Application Service   - Workspace Lock Manager   │  │   │
│   │  └────────────────────────────────────┬──────────────────────────────┘  │   │
│   │                                       │                                 │   │
│   │                        ┌──────────────▼─────────────┐                   │   │
│   │                        │    TrueForge SDK Client    │                   │   │
│   │                        │  (createTurnStream, cancel)│                   │   │
│   │                        └──────────────┬─────────────┘                   │   │
│   └───────────────────────────────────────┼─────────────────────────────────┘   │
└───────────────────────────────────────────┼─────────────────────────────────────┘
                                            │ HTTP / Server-Sent Events (SSE)
                                            │ http://[::1]:8790
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TRUEFORGE AGENT RUNTIME                               │
│                           (v0.182.0 on Port 8790)                               │
│                                                                                 │
│    - Session & Turn Lifecycle Management                                        │
│    - Model Execution & Reasoning Stream (Gemini 3.1 Flash Lite / Pro)           │
│    - Context Window Compaction & Truncation Handling                            │
│    - Tool Calling Orchestration & Event Gating (`tool.approval_required`)       │
└───────────────────────────────────────────┬─────────────────────────────────────┘
                                            │ Model Context Protocol (MCP)
                                            │ http://127.0.0.1:3001/mcp
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           REPOSTACK MCP SERVER                                  │
│                           (Port 3001 / JSON-RPC)                                │
│                                                                                 │
│   ┌──────────────────────────┐  ┌─────────────────────────┐                     │
│   │  Repository Exploration  │  │  Staging & Validation   │                     │
│   │  - list_files            │  │  - propose_file_edit    │                     │
│   │  - read_file             │  │  - get_proposal         │                     │
│   │  - search_workspace      │  │  - execute_validation   │                     │
│   └─────────────┬────────────┘  └─────────────┬───────────┘                     │
│                 │                             │                                 │
│   ┌─────────────▼─────────────────────────────▼───────────┐                     │
│   │                    Security Boundary                  │                     │
│   │  - Path Traversal Validation (Strict Workspace Root)  │                     │
│   │  - Symlink Escape Detection & Binary Filtering        │                     │
│   │  - Sensitive File Masking (.env, id_rsa, secrets)     │                     │
│   └───────────────────────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Features & Technical Highlights

### 1. 🛡️ Safe Staged Editing & Granular Diff Review
Autonomous agents often fail by making blind destructive edits. RepoStack guarantees that **the LLM never writes directly to your working tree**.
- Changes are staged into structured proposals containing unified diffs and individual hunks.
- The VS Code extension renders custom diff decorations with interactive inline **Accept** / **Reject** buttons.
- Supports partial acceptance: accept Hunk 1 and reject Hunk 2 without corrupting the file.
- Built-in multi-level undo stack allows one-click rollback of applied proposals.

### 2. ⚡ TrueForge Native Tool-Approval Integration
Verified through empirical spikes on TrueForge v0.182.0:
- TrueForge pauses execution and emits `tool.approval_required` events for critical actions.
- The extension intercepts the approval event, surfaces the diff to the developer, and resolves it via `client.sessions.createTurnEvent()` with `allow`, `deny`, or custom injected responses.
- Allows human-in-the-loop validation without breaking the autonomous agent loop.

### 3. 🔍 High-Performance MCP Repository Server
Exposes clean repository intelligence tools built on the official Model Context Protocol (MCP) specification:
- **`list_files`**: Hierarchical directory traversal with configurable depth, ignore rules, and size accounting.
- **`read_file`**: Safe file retrieval with encoding validation, 1MB size caps, and range-based slicing.
- **`search_workspace`**: Fast regex and substring searches across source files with glob filtering.
- **47/47 passing tests** covering edge cases, symlink exploits, path escapes, and HTTP SSE transports.

### 4. 🧠 Budget-Aware Context Engineering
Token context is a finite resource. RepoStack enforces a deterministic context budget:
- Model-aware budget calculator (accounting for system prompts, turn history, and tool overhead).
- Greedy priority packaging: active editors and `@`-referenced symbols receive highest priority.
- Integration with TrueForge's native context compaction mechanism.

---

## 📁 Repository Structure

```
repostack/
├── docs/                                # Technical Architecture & Engineering Specifications
│   ├── ARCHITECTURE.md                  # Complete 3-tier architectural specification
│   ├── CONTEXT_ENGINEERING.md           # Token budget, context retrieval & compaction strategies
│   ├── DATA_CONTRACTS.md                # TypeScript data contracts & schemas
│   ├── IMPLEMENTATION_ROADMAP.md        # Prompt-by-prompt milestone execution plan
│   ├── SECURITY_DESIGN.md               # Security model, sandbox boundary & validation policies
│   └── DECISIONS/
│       └── ADRS.md                      # Architecture Decision Records (ADRs 001 - 006)
│
├── mcp-server/                          # Production RepoStack Model Context Protocol Server
│   ├── src/
│   │   ├── config/workspace.ts          # Workspace root resolution & configuration
│   │   ├── security/                    # Path traversal & sensitive file sanitization
│   │   ├── tools/                       # MCP tool implementations (list, read, search)
│   │   ├── utils/errors.ts              # Normalized error taxonomy
│   │   ├── server.ts                    # Express + MCP SDK transport setup
│   │   └── index.ts                     # CLI entrypoint
│   ├── tests/                           # Comprehensive test suite (47 passed, 0 failed)
│   │   └── server.test.ts               # Unit & integration tests
│   ├── package.json                     # Dependencies & scripts
│   └── tsconfig.json                    # Strict TypeScript configuration
│
├── spike/                               # TrueForge Verification Spike Suite
│   ├── experiments/                     # Empirical test scripts (E1 through E9)
│   │   ├── e1/test-connectivity.mjs     # IPv6 vs IPv4 loopback binding verification
│   │   ├── e2/test-streaming.mjs        # SSE event taxonomy & delta latency analysis
│   │   ├── e3/test-cancellation.mjs     # Mid-generation abort & session reuse tests
│   │   ├── e4/run-approval-spike.mjs    # Tool approval gating verification
│   │   ├── e4b/test-user-tool-response.mjs # Custom tool response injection
│   │   ├── e5/test-agent-config.mjs     # Agent manifest & instructions integration
│   │   ├── e6/test-context.mjs          # Context compaction & memory verification
│   │   ├── e7/test-failover.mjs         # Model failover & error handling
│   │   ├── e8/test-tool-robustness.mjs  # Multi-step tool chaining across models
│   │   └── e9/test-workspace.mjs        # Dynamic workspace pointing strategies
│   ├── logs/                            # Sanitized verification logs and telemetry
│   ├── mcp-spike/                       # Isolated lightweight spike MCP server
│   ├── BASELINE.md                      # Hardware, OS & TrueForge environment baseline
│   └── agent-definition.json            # Verified TrueForge agent manifest
│
├── package.json                         # Root workspace scripts
├── .gitignore                           # Git ignore rules
└── README.md                            # You are here
```

---

## ⚡ Quick Start

### Prerequisites
- **Node.js**: v22.18.0 or later
- **npm**: v10.9.0 or later
- **TrueForge**: v0.182.0 (`npx @truefoundry/trueforge@latest`)

### 1. Clone & Setup
```bash
git clone https://github.com/tanshuu8/repostack.git
cd repostack
```

### 2. Install & Build MCP Server
```bash
cd mcp-server
npm install
npm run build
```

### 3. Run the Test Suite
Ensure the security sandbox and MCP tools are 100% verified:
```bash
npm test
```
*Expected output: `Results: 47 passed, 0 failed. All tests passed!`*

### 4. Start the MCP Server
Set your target workspace and launch:
```bash
# On Windows PowerShell:
$env:REPOSTACK_WORKSPACE = "C:\path\to\your\target\project"
npm start

# On Linux / macOS:
export REPOSTACK_WORKSPACE="/path/to/your/target/project"
npm start
```
The server will start listening at `http://127.0.0.1:3001` with standard health checks available at `http://127.0.0.1:3001/health`.

---

## 🔬 TrueForge Verification Spike Findings

During technical spike testing (Prompt 02.5), we empirically validated critical TrueForge v0.182.0 behaviors:

| Capability | Status | Spike Finding |
|---|---|---|
| **IPv6 Binding** | ✅ **VERIFIED** | TrueForge listens exclusively on `::1` (IPv6 loopback). Connecting via `127.0.0.1` fails on Windows; clients must target `http://localhost:8790` or IPv6 `http://[::1]:8790`. |
| **Token Streaming** | ✅ **VERIFIED** | TrueForge delivers incremental `model.message.delta` chunks (avg interval ~52ms). Delta content is accessed via `event.content`. |
| **Session Cancellation** | ✅ **VERIFIED** | `client.sessions.cancel()` cleanly transitions active turns to `status: "cancelled"` within ~60ms; sessions remain reusable. |
| **Tool Approval Gating** | ✅ **VERIFIED** | `tool.approval_required` halts model execution cleanly. Resolutions (`allow` / `deny`) succeed via `createTurnEvent`. Preceding arguments are reconstructed from `model.message.delta`. |
| **Session Liveness** | ✅ **VERIFIED** | Tool approvals held pending for 5+ minutes do not time out or drop session state. |

Full technical results and reproduction scripts are documented in [`spike/BASELINE.md`](spike/BASELINE.md) and [`spike/experiments/`](spike/experiments/).

---

## 🛡️ Security Architecture

RepoStack adheres to strict security constraints:
1. **Workspace Boundary**: Path normalization and `path.relative` containment prevent directory traversal attacks (`../../`).
2. **Symlink Guarding**: Detects and rejects symbolic links that resolve outside the permitted workspace tree.
3. **Sensitive File Masking**: Automatic blocklist for `.env`, private keys (`id_rsa`), AWS credentials, and database secrets.
4. **Command Execution Isolation**: Command execution is restricted to allowlisted profiles (e.g. test runners) with execution timeouts and output caps.

---

## 👥 Authors & Acknowledgments

- **Developed by**: [Tanush Chandhra Vyogi](https://github.com/tanshuu8)
- **Competition**: TrueFoundry Forge-a-thon, IIT Bombay Techfest 2026–27
- **Powered by**: TrueFoundry TrueForge & Visual Studio Code

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
