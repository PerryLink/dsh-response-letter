# dsh-response-letter

**Every reviewer comment answered — and provably so, by number.**

*Parses reviewer comments (Reviewer/Referee/审稿人 headers, numbered or paragraph mode), checks the point-by-point letter by response number (missing, too short, extra, duplicates), and exports a Markdown letter with a coverage table.*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

English · [简体中文](README-zh.md)

---

## What it does

- **`letter_parse`** — recognizes `Reviewer 1`, `Referee #2`, `审稿人 2`, `R1` headers and numbered markers (`1.`, `2)`, `Comment 3:`, `Q4:`), assigning a **global number** to every comment (the number a response must cite), a reviewer label and a character locator. Falls back to paragraphs with an explicit warning.
- **`letter_check`** — matches response numbers to comment numbers and reports: missing numbers, answers shorter than 20 characters, duplicate response numbers, and responses citing a number that no comment has.
- **`letter_export`** — a Markdown table (#, reviewer, comment, response) with unanswered points in bold, plus the coverage table. Markdown is the deliverable; nothing is emailed or uploaded.

## What it does not do

- **No adequacy judgement.** Coverage counts numbered answers; it does not say whether an answer is convincing, polite or evidence-based.
- **No reviewer text editing.** Comments are reproduced verbatim; the author writes the responses.
- **No DOCX/PDF.** Convert to `.md`/`.txt` (PDF text: `dsh-doc-anchor`).
- **No submission.** It does not touch the journal system.
- **No AI-generated rebuttals.** The plugin parses and checks; the words stay the author's.

## How numbering works

Comments are numbered 1..N in document order across reviewers (not per reviewer). The response letter must cite the same global numbers. If the letter uses its own per-reviewer numbering, the numbers will not match and the check says so rather than guessing.

## Tools

### `letter_parse`

`{ text? | path?, persist? }` → `{ ok, parse: {comments, reviewers, mode, warnings}, evidenceId?, recordPath? }`.

### `letter_check`

`{ comments? | reviewText? | reviewPath?, letterText? | letterPath? }` → `{ ok, coverage, comments, responses, warnings }`.

### `letter_export`

`{ comments, responses? | letterText?, title? }` → `{ ok, markdown, coverage }`.

### Error codes

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `UNSUPPORTED_FILE` · `STORE_ERROR`

## Compatibility & install

| | |
|---|---|
| DeepSeek Harness | **`dsh-v0.2.1-rc.5`** (verified 2026-11-08); peer `>=0.2.1-0 <0.3.0 \|\| >=0.2.2-0 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.9.0` (tested `24.22.1`), ESM only |
| Peers | `@perrylink/dsh-research-core ^0.1.0`, `@deepseek-ai/cordis ^4.0.5-alpha.1`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery ^3.18.5-alpha.1` |
| Runtime dependencies | **zero** |

```sh
dsh plugin --profile <name> add @perrylink/dsh-research-core dsh-response-letter
dsh --profile <name> --dump-config | grep dsh-response-letter
```

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | `false` mounts nothing |
| `root` | `.response-letter` | store/record root |
| `workspaceRoot` | `process.cwd()` | paths must resolve inside it |
| `maxChars` | `1000000` | character cap (fails, never truncates) |
| `persist` | `true` | store parsed reviews as REP evidence + record |

## Security boundaries

- Read-only on review and letter files; writes only under `root`.
- `realpath` containment rejects symlink escapes.
- Character cap fails loudly; DOCX/PDF rejected with a conversion hint.
- Comments are treated as data; any instruction-like text in them is never executed (the plugin has no executor).

## Evaluation

**21 tests**: numbered parsing with reviewer headers (including `R1`) and CRLF text, paragraph fallback with warning, empty-text rejection, response extraction, full/partial coverage (missing, short, extra), duplicate numbers and duplicate-export consistency, runtime (valid REP record, file and text paths, traversal/symlink/DOCX/oversize rejection, malformed JSON payloads), tools (schemas, parse→check→export end-to-end, failure branch), plugin contract, package contract.

No benchmark is claimed: correctness here is parsing behavior on explicit formats, checked with fixtures; there is no labelled corpus of real review letters.

## Known limitations (v0.1)

- The parser expects one comment per numbered line/block; a comment spanning several unnumbered paragraphs is split.
- Per-reviewer numbering is not auto-remapped; the check reports the mismatch instead.
- Response quality (tone, evidence) is out of scope.
- English/Chinese markers only; other languages need new patterns.

## License

Apache-2.0. No third-party runtime code.
