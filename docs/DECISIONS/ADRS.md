# RepoStack Architecture Decision Records (ADRs)

---

## ADR-001: VS Code Extension Host Architecture

### Context
RepoStack needs an editor-native experience providing chat, inline editing, diff review, and workspace application.
### Decision
Scaffold `@repostack/vscode-extension` as a standard TypeScript VS Code extension using the VS Code Extension API (`vscode`), Webview API for sidebar interaction, and `vscode.workspace.applyEdit` for hunk application.
### Alternatives Considered
- *Standalone Web App / Electron App*: Rejected. Violates product identity ("editor-native autonomous AI coding agent for VS Code").
- *CLI-only tool*: Rejected. Cannot provide per-hunk editor diff decorations or interactive accept/reject workflows.
### Consequences
- Full access to editor selection, active tabs, language servers, and decorations.
- Must operate within VS Code Extension Host constraints (single-threaded JS, async IPC to webview).

---

## ADR-002: TrueForge Integration & Agent Ownership

### Context
The TrueForge Agent Harness (`@truefoundry/trueforge` v0.182.0) runs locally on port 8790. We currently have two agents: `repostackv1` (has system prompt, 0 tools) and `v2` (has tools, no prompt).
### Decision
Consolidate into a single definitive agent manifest named `repostack-agent` inside TrueForge. The extension communicates via `@truefoundry/trueforge-sdk` (`client.sessions.create`, `client.sessions.createTurnStream`, `client.sessions.cancel`). TrueForge controls the LLM execution loop, model reasoning, and tool selection.
### Alternatives Considered
- *Implement custom LLM loop in extension*: Rejected. Explicitly violates competition instructions ("TrueForge must remain the agent runtime; do not implement an independent agent loop").
### Consequences
- Clean separation of concerns. TrueForge handles agent autonomy; RepoStack handles editor presentation and safe file review.

---

## ADR-003: MCP Tool Responsibilities & Proposal Streaming

### Context
RepoStack currently has three read-only MCP tools (`list_files`, `read_file`, `search_workspace`). The agent must modify code, but direct writes violate diff review safety.
### Decision
Add `propose_file_edit`, `read_file_range`, and `execute_validation` to the MCP server.
`propose_file_edit` returns complete structured proposal data as its standard MCP tool result, which TrueForge streams over SSE to the extension via `ToolResponseEvent`. This eliminates side-channel polling.
### Alternatives Considered
- *Direct `write_file` MCP tool*: Rejected. Silent writes fail competition criteria and risk destroying user code.
- *Side-channel HTTP polling from Extension to MCP*: Brittle, requires managing second port polling loop.
### Consequences
- TrueForge stream carries proposal payloads naturally as tool results; proposals are displayed in VS Code instantly.

---

## ADR-004: Proposal Staging & MCP Restart Recovery

### Context
Proposed file changes must be held safely between generation and developer review. If the MCP server or extension restarts, pending proposals must not vanish.
### Decision
Adopt a **Staged File Stash Architecture**:
1. When `propose_file_edit` runs, the MCP server stages the proposal payload in `.repostack/proposals/{proposal_id}.json` inside the workspace storage directory.
2. The proposal is returned in the tool result stream.
3. On extension or server restart, the extension reads the `.repostack/proposals/` directory to re-hydrate any unapplied pending proposals.
### Alternatives Considered
- *Pure in-memory without persistence*: If the process restarts during review, the proposal is lost.
- *Writing to actual source file paths with `.patch` extensions*: Pollutes repository git status.
### Consequences
- Resilient against process restarts, 0 footprint in git tracked files, safe on Windows.

---

## ADR-005: Independent Per-Hunk Acceptance & Stale Detection

### Context
Judges require independent per-hunk accept/reject capability. Accepting one hunk must not break or invalidate pending hunks in the same file.
### Decision
1. Compute hunks via the Myers diff algorithm (`diff` library).
2. When applying hunks, apply in **reverse line order** (bottom of file to top) so line shifts do not alter the start lines of preceding hunks.
3. When manual edits occur, hook `onDidChangeTextDocument`: overlapping pending hunks are marked `conflicted`, while non-overlapping hunks have line ranges dynamically adjusted.
### Alternatives Considered
- *Full-file accept-all only*: Rejected. Disqualified from top competition score.
### Consequences
- Independent per-hunk review works reliably without line corruption.

---

## ADR-006: Realistic Multi-File Transactional Application & Undo

### Context
Autonomous Agent Mode (Task B) modifies at least three files. If an error occurs on file 3, files 1 and 2 may have already been changed.
### Decision
Do not claim OS-level atomicity. Implement an application-level transactional protocol:
1. **Pre-flight**: Verify write permissions and `live_sha256 === original_hash` across all files in the batch.
2. **Snapshot**: Capture full pre-modification contents in an `UndoSnapshotBatch`.
3. **Coordinated Apply**: Submit edits via `vscode.workspace.applyEdit`.
4. **Recovery**: If `applyEdit` fails, automatically write back pre-modification snapshots to revert partially touched files.
### Alternatives Considered
- *Claiming WorkspaceEdit provides filesystem atomicity*: False; VS Code applies edits across document buffers sequentially on Windows.
### Consequences
- Bulletproof multi-file recovery without leaving partial edits or corrupting repositories.

---

## ADR-007: Dynamic Model-Aware Token Budget

### Context
Arbitrary fixed token limits (e.g. 40,000) fail to adapt when models have larger or smaller context windows.
### Decision
Determine budget dynamically based on the active model's context window with a practical 64,000 ceiling. Partition: 10% System, 15% Output, 20% Conversation, 55% Repository Pool. Explicitly document that all ranking weights ($w_k$) are initial heuristic hypotheses requiring empirical calibration.
### Alternatives Considered
- *Hardcoded static token numbers*: Fragile across model upgrades.
### Consequences
- Optimal token allocation and predictable latency across different LLMs.

---

## ADR-008: Two-Tier Approval Model

### Context
TrueForge supports `requireApprovalForTools`, while VS Code requires hunk review.
### Decision
Formalize two distinct approval tiers:
- **Tier 1 (Tool-Level Approval in TrueForge)**: Controls permission to invoke potentially sensitive operations (e.g. `execute_validation`). Handled via `UserToolApprovalInputEvent` (`status: "allow" | "deny"`).
- **Tier 2 (Change-Level Approval in VS Code)**: Controls acceptance of proposed code changes into the repository files.
Tier 1 approval NEVER bypasses Tier 2 change review.
### Consequences
- Full defense-in-depth: the agent is constrained at the harness level and the developer has total authority at the editor level.

---

## ADR-009: SSE Streaming & Staged Proposal Cancellation

### Context
Developer needs real-time feedback and must be able to cancel generation at any moment without leaving ghost processes or corrupted files.
### Decision
Consume TrueForge's `client.sessions.createTurnStream` via async iterator. On user cancellation:
1. Signal `vscode.CancellationToken`.
2. Issue `client.sessions.cancel(sessionId)` to abort TrueForge turn.
3. If a proposal was already staged, transition it to `cancelled` and purge unapplied hunks.
4. Leave workspace disk 100% untouched.
### Consequences
- Instant UI responsiveness, zero orphaned background generations, zero partial file corruption.

---

## ADR-010: Compliant Agent-Level Model Fallback (Task C)

### Context
Task C requires handling invalid credentials or unreachable endpoints. In TrueForge v0.182.0 SDK, same-session in-flight model swapping is unsupported.
### Decision
Implement a compliant fallback protocol:
1. Detect network timeouts, 401 auth errors, or 503 provider outages.
2. Attempt 3 exponential backoff retries (1s, 2s, 4s).
3. If unrecoverable, initiate a fallback session with `repostack-agent-fallback` (configured with secondary model/key) passing prior turn input.
4. If no fallback is configured, report a clean error with workspace confirmed unchanged (`git status` clean).
### Alternatives Considered
- *Direct provider calls from Extension*: Strictly prohibited.
- *Fictional SDK fallback parameters*: Disallowed; violates SDK contract.
### Consequences
- Fully compliant with TrueForge v0.182.0 architecture and satisfies Task C.

---

## ADR-011: Rigid Allowlisted Command Profiles on Windows

### Context
TrueForge local sandbox is unsupported on Windows. Direct shell execution could allow arbitrary command execution.
### Decision
Replace generic shell execution with three strict Command Profiles (`pytest`, `unittest`, `npm_test`). Arguments must match `^[-a-zA-Z0-9_./\\]+$`. Commands run with `shell: false`. Shell operators (`|`, `&`, `;`) cause immediate rejection.
### Alternatives Considered
- *Allowing `python -c`*: High security risk; allows executing arbitrary python code without file tracing.
### Consequences
- Safe local test verification of Task B (`pytest tests/test_cli.py -q`) on Windows 11 without container overhead.

---

## ADR-012: Monorepo Structure & Boundary Contracts

### Context
Extension and MCP server must maintain clean separation without circular dependencies or version drift.
### Decision
Organize repository into two discrete packages:
- `mcp-server/`: Node.js MCP server process.
- `vscode-extension/`: VS Code extension client.
- `docs/`: System documentation, ADRs, and roadmap.
Contracts between them are governed by Model Context Protocol JSON-RPC tool schemas.
### Consequences
- Decoupled deployment and testing; extension connects to MCP server over standard HTTP JSON-RPC without tight module coupling.
