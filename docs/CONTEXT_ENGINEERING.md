# RepoStack Intelligent Context Assembly Engine

> **Engineering Principle**: Repository understanding is not brute-force concatenation. It is selective, explainable, budget-aware context retrieval that prioritizes high-value code symbols over unnecessary file dumps.

---

## 1. Context Assembly Pipeline

```
Developer Prompt (e.g. "Fix get_debug_flag in @file:src/flask/helpers.py")
               │
               ▼
┌────────────────────────────────────────────────────────┐
│  STAGE 1: Request Parsing & Mention Extraction         │
│  - Extract explicit @file:"path" references            │
│  - Extract explicit @symbol:"name" references          │
│  - Detect active editor selection & cursor line range  │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────┐
│  STAGE 2: Repository Symbol & Dependency Graphing      │
│  - Call MCP search_workspace for referenced symbols    │
│  - Inspect imports / exports of candidate files        │
│  - Identify co-located test files (e.g. tests/test_*.py│
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────┐
│  STAGE 3: Relevance Scoring & Deduplication            │
│  - Compute Weighted Relevance Score (0.0 to 1.0)       │
│  - Deduplicate overlapping snippets and file segments  │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────┐
│  STAGE 4: Model-Aware Token Budget Allocation          │
│  - Query active model profile / configured ceiling     │
│  - Partition budget: System, History, Output, Repo     │
│  - Fill repo pool in descending order of score         │
│  - Invoke read_file_range for files > 250 lines        │
└──────────────────────┬─────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────┐
│  STAGE 5: Structured Context Assembly & Explainability │
│  - Generate XML-tagged context block for LLM           │
│  - Produce human-readable Context Report for developer │
└────────────────────────────────────────────────────────┘
```

---

## 2. Weighted Relevance Ranking Formula (Hypothesis)

> [!NOTE]
> The weights below are **initial engineering hypotheses**. They must be empirically evaluated and calibrated against the fixed competition benchmarks (Pallets/Flask) during Prompt 19.

Every candidate code segment $C_i$ is evaluated by a scoring function:

$$\text{Score}(C_i) = \sum_{k} w_k \cdot f_k(C_i)$$

| Factor ($f_k$) | Initial Weight ($w_k$) | Description |
|---|---|---|
| **Explicit User Reference** | **0.35** | Explicitly referenced via `@file` or `@symbol` by the developer. |
| **Active Editor Selection** | **0.25** | The exact code region currently highlighted in the active VS Code tab. |
| **Active File Context** | **0.15** | Code residing in the active editor file outside the immediate selection. |
| **Direct Import / Dependency** | **0.10** | File is directly imported by or imports the primary target file. |
| **Associated Test File** | **0.08** | Sibling test file covering the module (e.g., `tests/test_cli.py` for `src/flask/cli.py`). |
| **Exact Symbol Search Match** | **0.05** | Keyword or definition match found via `search_workspace`. |
| **Recent File Recency** | **0.02** | Files modified or viewed recently in the current workspace session. |

### Normalization and Cutoff:
- Scores range from `0.00` to `1.00`.
- Items scoring below `0.15` are pruned unless budget headroom is available.

---

## 3. Dynamic Model-Aware Token Budget Allocation

RepoStack replaces arbitrary fixed token counts with a dynamic allocation model configured to the active LLM context limits:

$$\text{Budget}_{\text{total}} = \min(M_{\text{context}}, \text{ConfiguredCeiling})$$

For Gemini 3.1 Flash Lite ($M_{\text{context}} = 1,048,576$), the default `ConfiguredCeiling` is set to **64,000 tokens** to balance generation speed, cost, and attention precision.

### Budget Partitions:

| Partition | Share | Allocation (at 64k ceiling) | Purpose |
|---|---|---|---|
| **System & Tool Schemas** | 10% | ~6,400 tokens | System instructions, tool schemas, safety rules. |
| **Output Reservation** | 15% | ~9,600 tokens | Multi-file proposals, reasoning tokens, diff output. |
| **Conversation & Plan History** | 20% | ~12,800 tokens | Multi-turn user prompts, agent reasoning, tool call logs. |
| **Repository Context Pool** | **55%** | **~35,200 tokens** | Target source files, `@file`, `@symbol`, imports, tests. |

### Selective Range Reading
When a discovered candidate file exceeds 250 lines:
- The context assembler invokes `read_file_range` instead of `read_file`.
- It extracts the target function/class plus 25 lines of surrounding context and top-of-file imports.
- This conserves between 60% and 85% of repository pool tokens per file.

---

## 4. Context Explainability Card (Developer UI)

To ensure developer trust and satisfy competition criteria ("Explainability of context selection"), every agent turn displays a collapsible **Context Selection Card** in the VS Code Webview:

```
┌──────────────────────────────────────────────────────────┐
│ 🧠 Context Assembled (18.4k / 35.2k pool used)           │
├──────────────────────────────────────────────────────────┤
│ Included Items:                                          │
│  ✓ src/flask/helpers.py (Lines 1-85)                     │
│    Reason: Active Editor Selection + Target Function     │
│    Score: 0.95 | Tokens: ~620                           │
│  ✓ src/flask/cli.py (Lines 120-210 via read_file_range)  │
│    Reason: Exact symbol match 'cli' + direct import      │
│    Score: 0.72 | Tokens: ~1,100                         │
│  ✓ tests/test_cli.py (Full file)                         │
│    Reason: Co-located test suite                         │
│    Score: 0.65 | Tokens: ~3,400                         │
│                                                          │
│ Excluded Items:                                          │
│  ✗ src/flask/app.py                                      │
│    Reason: Score below threshold (0.12) - pruned         │
│  ✗ docs/conf.py                                          │
│    Reason: Exceeded remaining repository pool budget     │
└──────────────────────────────────────────────────────────┘
```
