/**
 * Parsing reviewer comments and point-by-point responses.
 *
 * Heuristic but explicit: comments are recognized by reviewer headers
 * (`Reviewer 1`, `Referee #2`, `审稿人 2`, `R1`) and numbered markers
 * (`1.`, `2)`, `Comment 3:`, `Q4:`). When no numbering is found, paragraphs are
 * used and the parse reports that it fell back. Every recognized item carries a
 * character locator so the author can check the split.
 *
 * @module dsh-response-letter/parse
 */

/** One parsed comment. */
export interface ReviewComment {
  /** Global 1-based number across reviewers (the number a response must cite). */
  readonly number: number
  /** Reviewer label, e.g. "Reviewer 1"; empty when no header was found. */
  readonly reviewer: string
  /** Comment text (trimmed). */
  readonly text: string
  /** Character range in the source text. */
  readonly charStart: number
  readonly charEnd: number
}

/** Parse result. */
export interface ParseResult {
  readonly comments: readonly ReviewComment[]
  readonly reviewers: readonly string[]
  readonly mode: 'numbered' | 'paragraph'
  readonly warnings: readonly string[]
}

/** A reviewer header. */
const REVIEWER_HEADER = /^\s*(?:reviewer|referee|审稿人|专家|r)\s*#?\s*(\d+)\s*[:：.]?\s*$/i

/** A numbered comment marker at the start of a line (tolerates a CRLF line ending). */
const NUMBERED = /^\s*(?:comment|question|point|意见|问题)?\s*#?(\d{1,3})\s*[.):：、]\s+(.+?)\r?$/i

/** Extract reviewer sections with their start offsets. */
function reviewerSections(text: string): Array<{ label: string; start: number; end: number }> {
  const headers: Array<{ label: string; start: number; end: number }> = []
  const lines = text.split('\n')
  let offset = 0
  for (const line of lines) {
    const match = REVIEWER_HEADER.exec(line)
    if (match !== null) headers.push({ label: `Reviewer ${match[1]}`, start: offset, end: offset + line.length })
    offset += line.length + 1
  }
  return headers.map((header, index) => ({
    label: header.label,
    start: header.end,
    end: index + 1 < headers.length ? headers[index + 1]!.start : text.length,
  }))
}

/** Reviewer label containing an offset. */
function reviewerAt(sections: readonly { label: string; start: number; end: number }[], offset: number): string {
  return sections.find(section => offset >= section.start && offset <= section.end)?.label ?? ''
}

/**
 * Parse reviewer comments from a text.
 * @param text - the review text.
 * @returns the comments, reviewers and parse warnings.
 */
export function parseComments(text: string): ParseResult {
  if (typeof text !== 'string' || text.trim() === '') throw new RangeError('the review text is empty')
  const sections = reviewerSections(text)
  const numbered: ReviewComment[] = []
  const warnings: string[] = []
  let number = 0
  const lines = text.split('\n')
  let offset = 0
  for (const line of lines) {
    const match = NUMBERED.exec(line)
    if (match !== null) {
      number += 1
      numbered.push({
        number,
        reviewer: reviewerAt(sections, offset),
        text: match[2]!.trim(),
        charStart: offset,
        charEnd: offset + line.length,
      })
    }
    offset += line.length + 1
  }
  if (numbered.length > 0) {
    if (sections.length === 0) warnings.push('no reviewer headers were found; every comment is labelled with an empty reviewer')
    return { comments: numbered, reviewers: [...new Set(numbered.map(comment => comment.reviewer).filter(label => label !== ''))], mode: 'numbered', warnings }
  }

  // Fallback: paragraphs inside reviewer sections (or the whole text).
  const ranges = sections.length > 0 ? sections : [{ label: '', start: 0, end: text.length }]
  const comments: ReviewComment[] = []
  for (const range of ranges) {
    const segment = text.slice(range.start, range.end)
    const blocks = segment.split(/\n\s*\n/u)
    let cursor = range.start
    for (const block of blocks) {
      const cleaned = block.replace(/\r\n?/gu, '\n').trim()
      const index = text.indexOf(block, cursor)
      cursor = index === -1 ? cursor : index + block.length
      if (cleaned === '' || REVIEWER_HEADER.test(cleaned)) continue
      comments.push({ number: comments.length + 1, reviewer: range.label, text: cleaned, charStart: index === -1 ? range.start : index, charEnd: (index === -1 ? range.start : index) + block.length })
    }
  }
  if (comments.length === 0) throw new RangeError('no comments could be parsed')
  warnings.push('no numbered comment markers were found; paragraphs were used instead')
  return { comments, reviewers: [...new Set(comments.map(comment => comment.reviewer).filter(label => label !== ''))], mode: 'paragraph', warnings }
}

/** One parsed response. */
export interface ParsedResponse {
  readonly number: number
  readonly text: string
  readonly charStart: number
  readonly charEnd: number
}

/**
 * Extract numbered responses from a response letter.
 * @param text - the letter text.
 * @returns responses keyed by their number, plus a warning when numbering is absent.
 */
export function extractResponses(text: string): { responses: ParsedResponse[]; warnings: string[] } {
  const responses: ParsedResponse[] = []
  const warnings: string[] = []
  const lines = text.split('\n')
  let current: { number: number; start: number; lines: string[] } | undefined
  let offset = 0
  const flush = (): void => {
    if (current === undefined) return
    const body = current.lines.join('\n').replace(/\r\n?/gu, '\n').trim()
    responses.push({ number: current.number, text: body, charStart: current.start, charEnd: current.start + body.length })
    current = undefined
  }
  for (const line of lines) {
    const match = NUMBERED.exec(line)
    if (match !== null) {
      flush()
      current = { number: Number(match[1]), start: offset, lines: [match[2]!.trim()] }
    } else if (current !== undefined) {
      current.lines.push(line)
    }
    offset += line.length + 1
  }
  flush()
  if (responses.length === 0) {
    warnings.push('no numbered responses were recognized; the letter cannot be matched to comments by number')
  }
  return { responses, warnings }
}
