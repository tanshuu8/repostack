# RepoStack 20-Prompt Implementation Roadmap

<!-- Phased Engineering Milestones -->

> **Engineering Plan**: Chronological, dependency-verified roadmap from initial audit through final Forge-a-thon competition submission.

---

## Roadmap Overview & Dependency Graph

```
[P01: Audit] ──► [P02: Arch Spec] ──► [P02.1: Design Lock] ──► [P03: VS Code Scaffold]
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
▼
[P04: Interface Design] ──► [P05: TrueForge SDK Client] ──► [P06: Agent Consolidation]
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
▼
[P07: MCP Tool Expansion] ──► [P08: Context Assembly] ──► [P09: Inline Editing]
                                                                  │
┌─────────────────────────────────────────────────────────────────┘
▼
[P10: Diff Engine] ──► [P11: Hunk Review & Undo] ──► [P12: Autonomous Agent Mode]
                                                             │
┌────────────────────────────────────────────────────────────┘
▼
[P13: Multi-File Discovery] ──► [P14: Controlled Execution] ──► [P15: UI Streaming]
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
▼
[P16: Cancellation Handling] ──► [P17: Model Resilience] ──► [P18: Advanced TrueForge]
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
▼
[P19: Fixed-Task Regression] ──► [P20: Final Submission]
```

---

## Detailed Prompt Breakdown

### Prompt 01 — Repository Audit & Competition Gap Analysis
- **Status**: Completed ✅
- **Deliverables**: Comprehensive audit report, baseline verification of MCP server & TrueForge runtime.

### Prompt 02 & 02.1 — Technical Architecture, Validation & Design Lock
- **Status**: Completed ✅
- **Deliverables**: 6 locked architecture documents (`ARCHITECTURE.md`, `DATA_CONTRACTS.md`, `SECURITY_DESIGN.md`, `CONTEXT_ENGINEERING.md`, `ADRS.md`, `IMPLEMENTATION_ROADMAP.md`).
- **Key Locked Decisions**: Streaming proposal return, realistic multi-file snapshot rollback, independent per-hunk reverse line-order application, dynamic model-aware context budget, agent-level fallback for Task C, rigid command profiles, exact `***` secret mask.

### Prompt 03 — VS Code Extension Scaffold & Host Setup
- **Objective**: Scaffold `@repostack/vscode-extension` workspace, extension manifest (`package.json`), TypeScript configuration, and activation lifecycle.
- **Prerequisites**: P01, P02.1.
- **Affected Files**: `vscode-extension/package.json`, `vscode-extension/tsconfig.json`, `vscode-extension/src/extension.ts`.
- **Deliverables**: Clean extension compiling and launching in VS Code Extension Development Host.
- **Acceptance Test**: Pressing `F5` in VS Code activates the extension and registers RepoStack commands.

### Prompt 04 — Sidebar Webview & Interface Design
- **Objective**: Implement the responsive chat sidebar with turn container, markdown renderer, status pill, and diff preview cards.
- **Prerequisites**: P03.
- **Affected Files**: `vscode-extension/src/views/ChatViewProvider.ts`, `vscode-extension/media/chat.html`, `chat.css`.
- **Deliverables**: Webview sidebar with strict CSP, responsive message stream container, and quick-action buttons.
- **Acceptance Test**: Webview opens in sidebar, accepts user typing, and posts typed messages to the extension host.

### Prompt 05 — TrueForge SDK Client Integration
- **Objective**: Connect the extension to TrueForge runtime (`http://[::1]:8790`) via `@truefoundry/trueforge-sdk`.
- **Prerequisites**: P03, P04.
- **Affected Files**: `vscode-extension/src/services/TrueForgeClient.ts`.
- **Deliverables**: Typed service managing session creation, turn streaming, error handling, and reconnection.
- **Acceptance Test**: Extension successfully connects to local TrueForge, creates a session, and receives a text response stream.

### Prompt 06 — Agent Consolidation & Prompt Definition
- **Objective**: Consolidate `repostackv1` instructions and `v2` MCP tools into a unified `repostack-agent` manifest in TrueForge.
- **Prerequisites**: P05.
- **Deliverables**: Verified agent manifest with system prompt, MCP connector attachment, reasoning effort configuration, and compaction enabled.
- **Acceptance Test**: TrueForge lists `repostack-agent` with tools `[list_files, read_file, search_workspace]` and complete instructions.

### Prompt 07 — MCP Tool Expansion (Staging & Range Reading)
- **Objective**: Add `propose_file_edit`, `read_file_range`, and `get_proposal` to `mcp-server`.
- **Prerequisites**: P01, P06.
- **Affected Files**: `mcp-server/src/tools/propose-edit.ts`, `mcp-server/src/tools/read-file-range.ts`, `mcp-server/src/staging/proposal-store.ts`.
- **Deliverables**: Staged proposals store (.repostack/proposals/), streaming tool results, range reading tool.
- **Acceptance Test**: Unit tests verify `propose_file_edit` returns structured proposals without modifying workspace files on disk.

### Prompt 08 — Intelligent Context Assembly Engine
- **Objective**: Implement `@file` and `@symbol` parsing, initial relevance scoring formula, model-aware token budgeter, and context explainability report.
- **Prerequisites**: P07.
- **Affected Files**: `vscode-extension/src/context/ContextAssembler.ts`, `vscode-extension/src/context/TokenBudget.ts`.
- **Deliverables**: Context parser, scoring algorithm, and explainability summary payload.
- **Acceptance Test**: Tagging `@file:package.json` in user input extracts package.json and renders token consumption card.

### Prompt 09 — Inline Editing Controller & Decorations
- **Objective**: Implement the inline editing command (`repostack.inlineEdit`), editor selection capture, and inline ghost text / decorations.
- **Prerequisites**: P05, P07, P08.
- **Affected Files**: `vscode-extension/src/editor/InlineEditController.ts`, `vscode-extension/src/editor/Decorations.ts`.
- **Deliverables**: Command allowing selection + instruction -> triggers TrueForge turn with selection context.
- **Acceptance Test**: Selecting a function in an editor and running command opens floating prompt input.

### Prompt 10 — Myers Diff Engine & Hunk Model
- **Objective**: Integrate Myers diff calculation to divide staged proposals into discrete `DiffHunk` structures.
- **Prerequisites**: P07, P09.
- **Affected Files**: `vscode-extension/src/diff/DiffEngine.ts`, `vscode-extension/src/diff/HunkParser.ts`.
- **Deliverables**: Robust diff generator computing original/proposed line ranges and change hunks.
- **Acceptance Test**: Test suite verifies hunk generation for additions, deletions, and replacements.

### Prompt 11 — Per-Hunk Review & Undo Manager
- **Objective**: Implement independent hunk review, reverse-line-order application, conflict detection on manual edits, and undo snapshot stack.
- **Prerequisites**: P10.
- **Affected Files**: `vscode-extension/src/diff/HunkReviewManager.ts`, `vscode-extension/src/services/UndoManager.ts`.
- **Deliverables**: Interactive buttons to accept/reject individual hunks; reverse-offset applier; snapshot-based recovery.
- **Acceptance Test**: Accepting hunk 2 while rejecting hunk 1 applies cleanly without line offset corruption; undo reverts changes.

### Prompt 12 — Autonomous Multi-File Agent Mode
- **Objective**: Build the multi-turn agent coordinator capable of executing high-level developer requests across multiple files with pre-flight verification and rollback.
- **Prerequisites**: P06, P07, P11.
- **Affected Files**: `vscode-extension/src/agent/AutonomousAgentCoordinator.ts`.
- **Deliverables**: Autonomous plan execution, multi-file proposal staging, and batch review presentation.
- **Acceptance Test**: Submitting a multi-file request causes the agent to produce multiple staged file proposals.

### Prompt 13 — Multi-File Dependency Discovery
- **Objective**: Enhance repository exploration heuristics so the agent independently discovers imports, CLI registrations, tests, and docs.
- **Prerequisites**: P12.
- **Deliverables**: System prompt instructions and search chaining strategies enabling the agent to find related files autonomously.
- **Acceptance Test**: Agent discovers at least 3 files for a feature request without the user providing file paths.

### Prompt 14 — Controlled Command Execution & Validation
- **Objective**: Implement the `execute_validation` MCP tool for safe local test running on Windows 11.
- **Prerequisites**: P07.
- **Affected Files**: `mcp-server/src/tools/execute-validation.ts`.
- **Deliverables**: Rigid command profiles (`pytest`, `unittest`, `npm_test`) with no shell, timeouts, and developer confirmation.
- **Acceptance Test**: Running `pytest -q` executes tests safely and returns exit code + summary output to the agent.

### Prompt 15 — Real-Time Streaming & Tool Activity Visualization
- **Objective**: Render token-by-token streaming, reasoning deltas, and live tool spinners in the webview.
- **Prerequisites**: P04, P05.
- **Affected Files**: `vscode-extension/src/views/StreamRenderer.ts`.
- **Deliverables**: Live updating message bubbles, tool status badges, and progress spinners.
- **Acceptance Test**: User observes real-time text streaming and visual indicator when tools are running.

### Prompt 16 — Cancellation & Workspace Consistency
- **Objective**: Implement instantaneous user cancellation with TrueForge session abort and staging purge.
- **Prerequisites**: P05, P15.
- **Affected Files**: `vscode-extension/src/services/CancellationController.ts`.
- **Deliverables**: Stop button interrupting generation immediately, cancelling turn, and leaving files unchanged.
- **Acceptance Test**: Clicking Stop midway through generation halts stream within 300ms; git status shows clean workspace.

### Prompt 17 — Model Resilience & Provider Fallback
- **Objective**: Implement connection retries, backoff, and agent-level secondary model fallback for Task C.
- **Prerequisites**: P05, TrueForge model setup.
- **Affected Files**: `vscode-extension/src/services/ResilienceManager.ts`.
- **Deliverables**: Automatic retry with exponential backoff on network errors; fallback session trigger; clean user error messaging.
- **Acceptance Test**: Simulating unreachable endpoint displays clear error banner with workspace unchanged.

### Prompt 18 — Advanced TrueForge Context Engineering (Compaction & Subagents)
- **Objective**: Verify and demonstrate TrueForge context compaction and dynamic subagents in complex multi-file runs.
- **Prerequisites**: P06, P12.
- **Deliverables**: Configured compaction threshold and subagent delegation traces for repository indexing.
- **Acceptance Test**: Session trace shows TrueForge compaction reducing context tokens after large tool outputs.

### Prompt 19 — Fixed Tasks End-to-End Regression
- **Objective**: Execute and verify the three competition benchmarks on the `pallets/flask` repository (release tag 3.1.3, commit 22d92470).
  - **Task A**: Inline edit on `src/flask/helpers.py` (`get_debug_flag` treats 'off'/'n' as false).
  - **Task B**: Autonomous agent creates `flask config`, masking sensitive keys with exactly `***`, modifying CLI, test, and doc files (>=3 files), with `pytest tests/test_cli.py -q` passing.
  - **Task C**: Model resilience with invalid key/endpoint; workspace confirmed unchanged via `git status`.
- **Prerequisites**: Prompts 01 through 18.
- **Deliverables**: Verified execution logs, diff outputs, test run logs for Tasks A, B, and C.

### Prompt 20 — Submission Readiness & Presentation
- **Objective**: Final repository polish, technical write-up, demo video script, setup documentation, and competition submission checklist.
- **Prerequisites**: P19.
- **Deliverables**: `README.md`, `docs/SUBMISSION.md`, demo recording assets, code freeze.
