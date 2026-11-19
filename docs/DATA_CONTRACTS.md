# RepoStack Core Data Contracts

<!-- Tier Contracts & Communication Schemas -->

> **Standard Specification**: Complete TypeScript interfaces, enums, payload contracts, and error structures across the VS Code Extension, TrueForge SDK, and RepoStack MCP Server.

---

## 1. Proposal & Hunk Lifecycle State Machine

```
              ┌───────────────┐
              │    CREATED    │ (Agent calls propose_file_edit)
              └───────┬───────┘
                      │ Validated against base disk SHA-256
                      ▼
              ┌───────────────┐
              │PENDING_REVIEW │ (Diff displayed in VS Code)
              └───────┬───────┘
         ┌────────────┼────────────────────────┐
         │            │                        │
(Reject Hunk)   (Accept Hunk)            (User Cancel / Abort)
         │            │                        │
         ▼            ▼                        ▼
┌───────────────┐┌──────────────────┐   ┌───────────────┐
│PARTIAL_REJECT ││PARTIAL_ACCEPTED  │   │   CANCELLED   │ (Staging purged)
└───────────────┘└────────┬─────────┘   └───────────────┘
         │                │
         └────────┬───────┘
                  │ (Pre-flight verify all files)
                  ▼
         ┌──────────────────┐
         │     APPLYING     │ (vscode.workspace.applyEdit)
         └────────┬─────────┘
                  │
         ┌────────┴─────────┐
         ▼                  ▼
┌──────────────────┐┌──────────────────┐
│     APPLIED      ││    CONFLICTED    │ (File modified externally)
│ (Undo Available) ││     / FAILED     │ (Rollback triggered)
└──────────────────┘└──────────────────┘
```

---

## 2. Editing & Proposal Data Contracts

```typescript
export type ProposalStatus =
  | 'created'
  | 'pending_review'
  | 'partially_accepted'
  | 'approved'
  | 'applying'
  | 'applied'
  | 'rejected'
  | 'cancelled'
  | 'conflicted'
  | 'failed';

export type HunkStatus = 'pending' | 'accepted' | 'rejected' | 'conflicted';

export interface DiffHunk {
  id: string;                      // Unique hunk id (e.g., "hunk_0_1")
  proposalId: string;              // Parent proposal id
  originalStartLine: number;       // 1-based original line number
  originalLineCount: number;       // Number of original lines in hunk
  proposedStartLine: number;       // 1-based proposed line number
  proposedLineCount: number;       // Number of proposed lines in hunk
  originalLines: string[];         // Content of original lines
  proposedLines: string[];         // Content of proposed replacement lines
  status: HunkStatus;              // Review status of this specific hunk
  reviewedAt?: string;             // ISO timestamp when user accepted/rejected
  conflictReason?: string;         // Reason if flagged as conflicted
}

export interface FileProposal {
  id: string;                      // Unique proposal ID (e.g., "prop_01m678...")
  sessionId: string;               // Associated TrueForge session ID
  turnId: string;                  // Associated TrueForge turn ID
  filePath: string;                // Relative path within workspace root
  originalHash: string;            // SHA-256 hash of original file at generation time
  proposedHash: string;            // SHA-256 hash of proposed complete file
  originalContent: string;         // Snapshot of original file content
  proposedContent: string;         // Complete proposed file content
  hunks: DiffHunk[];               // Array of computed diff hunks
  status: ProposalStatus;          // Overall proposal status
  createdAt: string;               // ISO timestamp
  explanation: string;             // Agent's natural language reason for the edit
  errorMessage?: string;           // Error message if application failed
}

export interface MultiFileProposalBatch {
  batchId: string;                 // Grouping ID for multi-file operations
  sessionId: string;
  turnId: string;
  proposals: FileProposal[];       // Array of individual file proposals
  overallStatus: ProposalStatus;
  createdAt: string;
}

export interface UndoSnapshot {
  undoId: string;                  // Unique snapshot ID
  batchId?: string;                // Optional batch grouping ID
  proposalId: string;              // Associated proposal
  filePath: string;                // Relative path
  previousContent: string;         // Content before the change was applied
  appliedContent: string;          // Content that was applied
  previousHash: string;            // Hash before apply
  appliedHash: string;             // Hash after apply
  appliedAt: string;               // ISO timestamp
}

export interface UndoSnapshotBatch {
  batchId: string;
  snapshots: UndoSnapshot[];
  appliedAt: string;
}
```

---

## 3. Context Engineering Data Contracts

```typescript
export type ContextSourceType =
  | 'explicit_file'
  | 'explicit_symbol'
  | 'active_selection'
  | 'active_file'
  | 'workspace_search'
  | 'dependency_import'
  | 'test_file';

export interface ContextItem {
  id: string;                      // Unique ID
  source: ContextSourceType;       // Origin of context
  filePath: string;                // Relative path
  startLine?: number;              // Optional line range start
  endLine?: number;                // Optional line range end
  symbolName?: string;             // Symbol name (if applicable)
  content: string;                 // Snippet or full text content
  estimatedTokens: number;         // Estimated token count
  relevanceScore: number;          // 0.0 to 1.0 scoring (hypothesis)
  selectionReason: string;         // Explainability text (e.g., "Explicitly tagged via @file")
}

export interface ModelContextConfig {
  modelId: string;
  maxWindowTokens: number;         // e.g. 1,048,576 for Gemini Flash
  configuredCeilingTokens: number; // e.g. 64,000 for practical latency
}

export interface ContextBudget {
  totalBudget: number;             // Configured ceiling
  systemReservedTokens: number;    // 10% (min 4,000)
  conversationReservedTokens: number; // 20% (min 8,000)
  outputReservedTokens: number;    // 15% (min 8,000)
  repositoryPoolTokens: number;    // 55% (~35,200 at 64k)
  usedTokens: number;              // Actually consumed context tokens
}

export interface ContextReport {
  includedItems: ContextItem[];    // Items fitting in the budget
  excludedItems: {                 // Items pruned due to budget or lower score
    filePath: string;
    reason: string;
    estimatedTokens: number;
    score: number;
  }[];
  budgetSummary: ContextBudget;
  explanation: string;             // Human-readable summary for the developer
}
```

---

## 4. MCP Tool Schemas (JSON-RPC Protocol)

### Tool: `propose_file_edit`
```json
{
  "name": "propose_file_edit",
  "description": "Propose modifications to a file in the workspace. Stages changes for developer review and diff inspection without directly overwriting disk. Returns structured proposal data and diff hunks.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Relative path to the file within the workspace."
      },
      "proposed_content": {
        "type": "string",
        "description": "Complete new content for the file after your modifications."
      },
      "explanation": {
        "type": "string",
        "description": "Clear explanation of what changes you made and why."
      }
    },
    "required": ["path", "proposed_content", "explanation"]
  }
}
```

### Tool Result Schema (Returned in SSE Stream):
```json
{
  "proposal_id": "prop_01m67p...",
  "file_path": "src/flask/cli.py",
  "original_hash": "a1b2c3...",
  "proposed_hash": "d4e5f6...",
  "status": "pending_review",
  "hunks_count": 2,
  "hunks": [
    {
      "id": "hunk_0_1",
      "originalStartLine": 50,
      "originalLineCount": 0,
      "proposedStartLine": 50,
      "proposedLineCount": 15,
      "status": "pending"
    }
  ],
  "explanation": "Added flask config command with sensitive value masking."
}
```

### Tool: `read_file_range`
```json
{
  "name": "read_file_range",
  "description": "Read a specific line range from a text file in the workspace to conserve context window. Line numbers are 1-based.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Relative path to the file within the workspace."
      },
      "start_line": {
        "type": "integer",
        "minimum": 1,
        "description": "First line to read (1-based, inclusive)."
      },
      "end_line": {
        "type": "integer",
        "minimum": 1,
        "description": "Last line to read (1-based, inclusive)."
      }
    },
    "required": ["path", "start_line", "end_line"]
  }
}
```

### Tool: `execute_validation` (Rigidly Allowlisted)
```json
{
  "name": "execute_validation",
  "description": "Execute a pre-configured, allowlisted validation test suite within the workspace (e.g. pytest tests/test_cli.py -q). Generic shell commands and shell operators are strictly rejected.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "command_profile": {
        "type": "string",
        "enum": ["pytest", "unittest", "npm_test"],
        "description": "The exact allowlisted test runner profile."
      },
      "args": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Sanitized arguments matching ^[-a-zA-Z0-9_./\\\\]+$."
      },
      "timeout_ms": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 60000,
        "default": 30000,
        "description": "Execution timeout in milliseconds."
      }
    },
    "required": ["command_profile", "args"]
  }
}
```

---

## 5. Task B Secret Masking Specification
For Task B (`flask config`), the specification requires:
- Any configuration key containing `SECRET`, `PASSWORD`, `TOKEN`, or `KEY` must have its value masked as exactly:
  `***` (three asterisks).
- Example:
  `{"SECRET_KEY": "***", "DATABASE_PASSWORD": "***", "DEBUG": true}`

<!-- End of Core Data Contracts Specification -->
