# RepoStack System Architecture

> **Product Definition**: An editor-native, repository-aware autonomous AI coding agent for Visual Studio Code, powered by the TrueForge Agent Runtime and RepoStack Model Context Protocol (MCP) server.

---

## 1. Executive Architecture Summary

RepoStack is engineered to give developers an autonomous, repository-aware coding partner that understands an entire codebase, discovers files independently, proposes surgical multi-file edits, and allows per-hunk review before touching disk.

The system is split into three decoupled tiers:

1. **VS Code Extension Tier (`vscode-extension`)**: The presentation, editor decoration, diff review, and context extraction engine. It owns the developer interaction loop, inline-edit UI, per-hunk diff view, undo stack, and consumes SSE events from TrueForge.
2. **TrueForge Agent Runtime Tier (`[::1]:8790`)**: The self-hosted agent harness (`@truefoundry/trueforge` v0.182.0) that manages LLM interactions, sessions, turns, tool-calling loops, context compaction, and subagent orchestration. TrueForge controls model reasoning and decides tool invocations.
3. **RepoStack MCP Server Tier (`127.0.0.1:3001`)**: The repository intelligence and staging boundary (`@repostack/mcp-server`). Exposes safe read-only repository inspection tools (`list_files`, `read_file`, `read_file_range`, `search_workspace`), staged editing (`propose_file_edit`, `get_proposal`), and allowlisted validation (`execute_validation`). It strictly enforces workspace path isolation, symlink escaping checks, sensitive file filtering, and guarantees that no file is modified silently on disk without human acceptance (see DATA_CONTRACTS.md).

---

## 2. Complete System Architecture Diagram

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
│   │  │  - Proposal Stash & Staging Manager    - Undo History Stack       │  │   │
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
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Agent: 'repostack-agent'                                               │   │
│   │  - System Prompt: Identity, Repo Workflows, Review-First Policy         │   │
│   │  - Model: google-gemini/gemini-3-1-flash-lite (Reasoning: High)         │   │
│   │  - Context Management: Compaction=true, LargeToolResponse=true          │   │
│   │  - Subagents: DynamicSubAgents=true                                     │   │
│   │  - Tool Approvals: requireApprovalForTools=["@destructive"]             │   │
│   └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                       │ Tool Calls / Execution                  │
│                                       ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  MCP Connector: 'repostack-mcp'                                         │   │
│   │  URL: http://127.0.0.1:3001/mcp                                         │   │
│   └───────────────────────────────────┬─────────────────────────────────────┘   │
└───────────────────────────────────────┼─────────────────────────────────────────┘
                                        │ HTTP / JSON-RPC (StreamableHTTPTransport)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            REPOSTACK MCP SERVER                                 │
│                           (Node.js on Port 3001)                                │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Express HTTP Wrapper (DNS Rebinding Check, Localhost 127.0.0.1)        │   │
│   └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                       ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  MCP Tool Registry:                                                     │   │
│   │  - list_files (depth, hidden, exclusions)                               │   │
│   │  - read_file (size check, utf-8, binary rejection)                      │   │
│   │  - read_file_range (line start/end for token economy)                   │   │
│   │  - search_workspace (text, regex, glob pattern)                         │   │
│   │  - propose_file_edit (stages diff proposal, DOES NOT write to disk)     │   │
│   │  - get_proposal / list_proposals (inspect staged proposals)             │   │
│   │  - execute_validation (strictly allowlisted test runners: pytest, npm)  │   │
│   └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                       ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Security Subsystem:                                                    │   │
│   │  - path-validator.ts: Path traversal & realpathSync symlink check       │   │
│   │  - file-filter.ts: Sensitive files (.env, keys) & binary exclusions     │   │
│   └───────────────────────────────────┬─────────────────────────────────────┘   │
└───────────────────────────────────────┼─────────────────────────────────────────┘
                                        │ Local Disk Access (Sandboxed)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         WORKSPACE REPOSITORY DISK                               │
│                         ($env:REPOSTACK_WORKSPACE)                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Proposal Communication & Staging Architecture

### Proposal Return via Streaming Tool Results
To avoid brittle side-channel HTTP polling between the extension and the MCP server, **proposals are communicated directly through TrueForge's verified tool-result streaming**:
1. When the agent decides to modify code, it calls `propose_file_edit({ path, proposed_content, explanation })`.
2. The MCP Server:
   - Validates the path within the workspace.
   - Computes original file hash (`SHA-256`) and proposed file hash.
   - Computes diff hunks using the Myers diff algorithm.
   - Assigns a unique `proposal_id` (e.g. `prop_01m67...`).
   - Stashes the proposal in `.repostack/proposals/{proposal_id}.json` (within the extension's workspace storage directory) for crash recovery.
   - Returns the complete structured proposal object in the MCP tool response.
3. TrueForge yields a `ToolResponseEvent` over SSE to the extension.
4. The extension's `StreamEventHandler` parses the tool result, loads the `FileProposal`, and triggers the diff review UI.

### Review Decision Synchronization
- The VS Code Extension is the sole source of truth for **Review Decisions** (`accepted`, `rejected`, `partially_accepted`).
- When hunks are accepted or rejected in the UI, the extension updates the proposal state and applies approved hunks directly to the editor buffer.
- The MCP server's staging directory acts as an immutable record of what the agent proposed, while the extension tracks the live application lifecycle.

---

## 4. Multi-File Application & Recovery Architecture

> [!IMPORTANT]
> VS Code's `vscode.workspace.applyEdit` does **NOT** guarantee filesystem-level atomicity across multiple files. On the Windows filesystem, edits to multiple files are processed sequentially. If a failure occurs (file lock, read-only permissions, disk error) midway through a multi-file batch, previous files may already have been modified.

### Transactional Pre-Flight, Application, and Recovery Protocol:
1. **Phase 1: Pre-Flight Hash Verification**:
   - For every file in the proposal batch, the extension verifies:
     - The file exists and is writable.
     - The live on-disk hash exactly matches `proposal.originalHash`.
   - If **any** file fails verification, the entire batch is aborted immediately with zero disk modifications.
2. **Phase 2: Pre-Modification Snapshotting**:
   - Complete in-memory snapshots of all targeted files are recorded in an `UndoSnapshotBatch`.
3. **Phase 3: Coordinated Application**:
   - Construct a unified `vscode.WorkspaceEdit`.
   - Execute `await vscode.workspace.applyEdit(workspaceEdit)`.
4. **Phase 4: Recovery on Partial Failure**:
   - If `applyEdit` returns `false` or throws an error:
     - The extension immediately walks the `UndoSnapshotBatch` and writes back the original content of any file that was touched.
     - The proposal batch is marked `failed`.
     - The developer is alerted with an exact error report.
5. **Phase 5: Undo Stack**:
   - Successful applications push the `UndoSnapshotBatch` onto the `UndoManager` stack.
   - Single-click "Undo Agent Changes" restores all files in the batch simultaneously.

---

## 5. Independent Per-Hunk Acceptance & Stale-File Handling

1. **Independent Hunk Application**:
   - Developers can accept Hunk 1 while leaving Hunk 2 pending or rejected.
   - **Reverse Line-Order Application**: Accepted hunks are applied from the bottom of the file to the top (descending line order). This guarantees that additions or deletions in lower hunks do not shift the line offsets of hunks located higher in the file.
2. **Stale-File Detection on Manual Edits**:
   - If the developer manually edits a file while hunks are pending:
     - The extension listens to `vscode.workspace.onDidChangeTextDocument`.
     - It checks if the manual edit intersects with any pending hunk's line range.
     - Intersecting hunks are immediately flagged as `conflicted` and cannot be applied automatically.
     - Non-overlapping hunks remain reviewable; their line ranges are dynamically updated to account for the manual edit's line delta.

---

## 6. Configurable Model-Aware Context Budget

Instead of a fixed arbitrary token budget, RepoStack uses a dynamic, model-aware budget:

$$\text{Budget}_{\text{total}} = \min(M_{\text{context}}, \text{ConfiguredCeiling})$$

Where $M_{\text{context}}$ is the active model's context window (e.g. 1,048,576 for Gemini 3.1 Flash Lite) and `ConfiguredCeiling` defaults to 64,000 tokens for optimal latency and cost:

| Budget Partition | Share | Allocation (at 64k ceiling) | Purpose |
|---|---|---|---|
| **System & Tool Schemas** | 10% | ~6,400 tokens | System instructions, tool schemas, safety rules. |
| **Output Reservation** | 15% | ~9,600 tokens | Multi-file proposals, reasoning tokens, diff output. |
| **Conversation & Plan History** | 20% | ~12,800 tokens | Multi-turn user prompts, agent reasoning, tool call logs. |
| **Repository Context Pool** | **55%** | **~35,200 tokens** | Target source files, `@file`, `@symbol`, imports, tests. |

> [!NOTE]
> All ranking weights ($w_k$) defined in context engineering are **initial heuristic hypotheses** that will be calibrated against the Pallets/Flask benchmark in Prompt 19.

---

## 7. Verified Model Resilience & Compliant Fallback

### SDK Verification Findings
- In `@truefoundry/trueforge-sdk` v0.182.0, `client.sessions.create` binds to a specific agent name (`agent.name`).
- TrueForge does **NOT** support mid-turn or same-session model switching.
- Google Gemini is currently the only configured provider in the local TrueForge settings.

### Compliant Fallback Architecture
1. **Network Retries**: For transient connection errors (`ECONNREFUSED`, network timeout), the extension retries up to 3 times with exponential backoff (1s, 2s, 4s).
2. **Agent-Level Fallback Session**:
   - If configured in TrueForge settings with a secondary provider, the extension initiates a fallback session bound to `repostack-agent-fallback`.
   - The conversation history and current turn input are transferred to the fallback session.
3. **Graceful Failure Invariant (Task C)**:
   - If fallback is unconfigured or fails, the extension catches the SDK error, halts generation, renders a clear failure explanation in the webview, and guarantees that the workspace is 100% clean (`git status` confirms 0 files modified).

<!-- End of RepoStack System Architecture Specification -->
