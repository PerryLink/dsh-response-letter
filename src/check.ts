/**
 * Coverage of reviewer comments by a point-by-point response letter.
 *
 * Matching is by the response's cited number. The check reports missing numbers,
 * responses that are too short to be a real answer, responses that cite a number
 * with no matching comment, and duplicate response numbers. It never scores the
 * quality of an answer.
 *
 * @module dsh-response-letter/check
 */

import type { ParsedResponse, ReviewComment } from './parse.ts'

/** One finding. */
export interface CoverageFinding {
  readonly commentNumber: number
  readonly reviewer?: string
  readonly status: 'answered' | 'missing' | 'empty' | 'extra'
  readonly detail: string
  readonly responsePreview?: string
}

/** The coverage result. */
export interface CoverageResult {
  readonly total: number
  readonly answered: number
  readonly missing: number
  readonly empty: number
  readonly extra: number
  /** answered / total, rounded to 4 decimals. */
  readonly coverage: number
  readonly findings: readonly CoverageFinding[]
  readonly warnings: readonly string[]
}

/** Shortest text that counts as an answer (characters). */
export const MIN_RESPONSE_CHARS = 20

/**
 * Compare comments with parsed responses.
 * @param comments - parsed reviewer comments.
 * @param responses - parsed responses.
 * @returns coverage, findings and warnings.
 */
export function checkCoverage(comments: readonly ReviewComment[], responses: readonly ParsedResponse[]): CoverageResult {
  if (comments.length === 0) throw new RangeError('there are no comments to check')
  const byNumber = new Map<number, ParsedResponse[]>()
  for (const response of responses) {
    const list = byNumber.get(response.number) ?? []
    list.push(response)
    byNumber.set(response.number, list)
  }
  const findings: CoverageFinding[] = []
  const warnings: string[] = []
  let answered = 0
  let missing = 0
  let empty = 0
  for (const [number, list] of byNumber) {
    if (list.length > 1) warnings.push(`response number ${number} appears ${list.length} times; the first is used`)
  }
  const commentNumbers = new Set(comments.map(comment => comment.number))
  for (const comment of comments) {
    const list = byNumber.get(comment.number) ?? []
    if (list.length === 0) {
      missing += 1
      findings.push({ commentNumber: comment.number, ...(comment.reviewer === '' ? {} : { reviewer: comment.reviewer }), status: 'missing', detail: `no response cites number ${comment.number}` })
      continue
    }
    const response = list[0]!
    if (response.text.trim().length < MIN_RESPONSE_CHARS) {
      empty += 1
      findings.push({
        commentNumber: comment.number,
        ...(comment.reviewer === '' ? {} : { reviewer: comment.reviewer }),
        status: 'empty',
        detail: `the response is shorter than ${MIN_RESPONSE_CHARS} characters`,
        responsePreview: response.text.slice(0, 80),
      })
      continue
    }
    answered += 1
    findings.push({
      commentNumber: comment.number,
      ...(comment.reviewer === '' ? {} : { reviewer: comment.reviewer }),
      status: 'answered',
      detail: 'a numbered response was found',
      responsePreview: response.text.slice(0, 80),
    })
  }
  let extra = 0
  for (const [number] of byNumber) {
    if (commentNumbers.has(number)) continue
    extra += 1
    findings.push({ commentNumber: number, status: 'extra', detail: `a response cites number ${number}, but no comment has that number` })
  }
  if (missing > 0) warnings.push(`${missing} comment(s) have no numbered response`)
  if (empty > 0) warnings.push(`${empty} response(s) are shorter than ${MIN_RESPONSE_CHARS} characters`)
  if (extra > 0) warnings.push(`${extra} response number(s) do not match any comment`)
  return {
    total: comments.length,
    answered,
    missing,
    empty,
    extra,
    coverage: Number((answered / comments.length).toFixed(4)),
    findings,
    warnings,
  }
}
