# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `R1`/`R2` reviewer headers are now recognized; the README, module docs and
  changelog promised them but the header regex only matched Reviewer/Referee/
  审稿人/专家.
- Malformed `comments`/`responses` JSON now returns `INVALID_INPUT` from
  `letter_check`/`letter_export` instead of leaking a `TypeError`.
- `letter_export` shows the same (first) answer for a repeated response number
  that `letter_check` reported on; it previously rendered the last duplicate.
- Corrected the `letter_export` response parameter type (`ParsedResponse[]`).
- CRLF review and letter text is now parsed: the numbered-line regex rejected
  the trailing `\r`, so Windows files silently fell back to paragraph mode and
  produced no response matches.
- Duplicate response numbers are warned about even when no comment has that
  number (previously the duplicate was only reported for matched numbers).

### Added

- Tests for `R1` headers, CRLF text, duplicate-answer consistency, symlink
  escape, malformed JSON payloads and the function-plugin mount contract (21
  tests total).

## [0.1.0] - 2026-11-08

First release: reviewer-comment parsing and response coverage.

### Added

- `letter_parse`: reviewer headers (`Reviewer`/`Referee`/`审稿人`/`R`) and
  numbered markers, global numbering with character locators, paragraph
  fallback with an explicit warning.
- `letter_check`: coverage by response number — missing, shorter than 20
  characters, duplicate, extra — with a coverage ratio.
- `letter_export`: Markdown point-by-point table, unanswered points in bold,
  and the coverage table.
- REP v1 integration: the parsed review becomes immutable evidence with parse
  checks and a valid record.
- 15 tests.

### Notes

- Coverage counts answers; it does not judge whether an answer is adequate.
- Numbering must be global (1..N across reviewers); per-reviewer numbering is
  reported as a mismatch rather than silently remapped.
