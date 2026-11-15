# RepoStack Security & Safety Design

> **Security Posture**: Zero silent file writes, strict workspace boundary enforcement, rigidly allowlisted command profiles, and defense-in-depth across the VS Code Extension, MCP Server, and TrueForge Agent Runtime.

---

## 1. Threat Model & Security Boundaries

```
[ External / Untrusted ]
         │
         │  (Model generated code, untrusted repo content, PR context)
         ▼
┌──────────────────────────────────────────────────────────────┐
│  BOUNDARY 1: TrueForge Agent Runtime                         │
│  - System Prompt constraints ("Never write silently")        │
│  - Tool approvals: requireApprovalForTools=["@destructive"]  │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  BOUNDARY 2: RepoStack MCP Server                            │
│  - Localhost 127.0.0.1 binding only                          │
│  - DNS Rebinding protection (validates Host header)          │
│  - Path Traversal & Symlink Escaping checks                  │
│  - Sensitive File regex + .gitignore blocking                │
│  - Staged Proposals Store (No unreviewed disk mutations)     │
│  - Rigid Command Profiles (No arbitrary shell)               │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  BOUNDARY 3: VS Code Extension Host                          │
│  - Per-hunk interactive review in editor                     │
│  - Pre-application verification & rollback snapshots         │
│  - Stale-file conflict detection on manual edits             │
│  - Webview Content Security Policy (CSP)                     │
│  - Secret redaction in telemetry & logs                      │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. File Editing Safety & Multi-File Application

### The "No Silent Modification" Invariant
Under NO circumstances may an AI agent write directly to files on disk without explicit developer confirmation.
- The MCP tool `propose_file_edit` **only stores the proposed modification in a temporary staging stash**.
- The MCP server returns a `proposal_id` and computed diff hunks to the agent via tool streaming.
- The actual disk write is executed **only by the VS Code Extension Host** via `vscode.workspace.applyEdit` when the developer explicitly clicks **Accept Hunk** or **Accept All**.

### Realistic Multi-File Transactional Protocol
> [!WARNING]
> VS Code's `vscode.workspace.applyEdit` does not guarantee operating system-level or filesystem-level atomicity across multiple files. Edits on Windows are applied sequentially across file buffers.

To prevent partial, corrupted, or broken multi-file states:
1. **Pre-flight Validation**:
   - Check write permissions for every file in the batch.
   - Verify `live_sha256 === original_hash` for each file.
   - If any file fails verification, abort the entire batch immediately before modifying any file.
2. **Snapshot Creation**:
   - Record pre-modification byte-for-byte snapshots into an `UndoSnapshotBatch`.
3. **Application & Verification**:
   - Apply edits via `vscode.workspace.applyEdit`.
   - If `applyEdit` fails or an exception occurs, trigger the **Recovery Routine**:
     - Read pre-modification snapshots from `UndoSnapshotBatch`.
     - Revert any file that was partially modified.
     - Transition the proposal batch status to `failed`.
     - Present an actionable error dialog explaining which file triggered the abort.

### Independent Per-Hunk Acceptance & Stale-File Detection
- **Independent Hunk Application**: Hunks within the same file are applied in **reverse line order** (bottom of file to top). This ensures that line insertions or deletions in later hunks do not invalidate the 1-based start line of earlier hunks.
- **Manual Edit Conflict Detection**:
  - If a developer edits a file in VS Code while hunks are pending:
  - The extension hooks `vscode.workspace.onDidChangeTextDocument`.
  - It detects whether the user's edit overlaps with any pending hunk range.
  - Overlapping hunks are flagged as `conflicted`.
  - The developer is given a merge notification: *"File was modified externally. Please review conflicted hunks."*

---

## 3. Rigid Command Execution Security (No Generic Shell Execution)

### Removal of Unrestricted Command Execution
Unrestricted `python -c` execution and generic shell evaluation (`bash -c`, `powershell.exe`) are **strictly prohibited** and excluded from the design.

### Command Profiles Allowlist
The tool `execute_validation` enforces three strict, immutable profiles:

| Profile | Allowed Binary | Working Dir | Argument Regex Pattern | Rejection Criteria |
|---|---|---|---|---|
| `pytest` | `pytest`, `python -m pytest` | `$REPOSTACK_WORKSPACE` | `^[-a-zA-Z0-9_./\\]+$` | Any argument with shell metacharacters (`\|`, `&`, `;`, `>`, `<`, `` ` ``, `$`). |
| `unittest`| `python -m unittest` | `$REPOSTACK_WORKSPACE` | `^[-a-zA-Z0-9_./\\]+$` | Any argument with shell metacharacters. |
| `npm_test`| `npm test`, `npm run test` | `$REPOSTACK_WORKSPACE` | `^[-a-zA-Z0-9_./\\]+$` | Subcommand arguments only. |

### Technical Execution Constraints:
1. **No Shell**: Commands run strictly using `child_process.spawn(binary, args, { shell: false })`.
2. **Timeout**: Hard timeout of 30 seconds default (max 60 seconds) with process tree termination via `tree-kill` / Windows `taskkill /T /F`.
3. **Output Cap**: Standard output and standard error are truncated at 32 KB to prevent memory exhaustion.
4. **Interactive Confirmation**: Every command execution requires explicit developer consent in VS Code before spawning.

---

## 4. Path Traversal & Symlink Escape Guards

Verified and enforced in `mcp-server/src/security/path-validator.ts`:
1. **Absolute Path Rejection**: `path.isAbsolute(userPath)` rejects Unix `/` and Windows `C:\` or `\\` UNC paths.
2. **Directory Traversal Rejection**: Rejects any path component equaling `..`.
3. **Workspace Boundary Normalization**: `path.resolve(workspaceRoot, userPath)` must start with `workspaceRoot + path.sep`.
4. **Symlink Escape Resolution**: `fs.realpathSync(resolved)` verifies that the physical disk path remains strictly within `fs.realpathSync(workspaceRoot)`.

---

## 5. Cancellation Behavior for Staged Proposals

When a user clicks **Cancel** in VS Code while a proposal has already been staged:
1. The extension issues `client.sessions.cancel(sessionId)` to abort TrueForge turn execution.
2. The proposal status transitions to `cancelled`.
3. Any unapplied hunks are purged from the pending review queue.
4. The workspace disk remains **100% untouched and unchanged**.

---

## 6. Secret Masking & Redaction Hygiene

1. **Sensitive File Blocklist**: Implemented via regex in `mcp-server/src/security/file-filter.ts`:
   - `/^\.env($|\..*)/i`
   - `/\.(pem|key|p12|pfx)$/i`
   - `/^(credentials|secrets)\.json$/i`
   - `/^\.(npmrc|netrc)$/i`
   - `/^id_(rsa|ed25519|ecdsa|dsa)$/i`
2. **Task B Exact Masking Invariant**:
   - Configuration values containing `SECRET`, `PASSWORD`, `TOKEN`, or `KEY` must be masked as exactly:
     `***`
3. **Log Sanitization**:
   - `sanitizePath`: Strips local host directories (`C:\Users\user\...`) from errors returned to model/agents.
   - Any sensitive keyword matching `/(secret|password|token|apikey|private_key)/i` in error traces is masked as `***REDACTED***`.
