/**
 * Parsing and coverage heuristics.
 * @module test/parse-check.spec
 */

import { describe, expect, it } from 'vitest'
import { checkCoverage, MIN_RESPONSE_CHARS } from '../src/check.ts'
import { extractResponses, parseComments } from '../src/parse.ts'
import { renderResponseLetter } from '../src/report.ts'

const REVIEW = `Reviewer 1

1. The sample size is not justified. Please add a power calculation.
2. The randomization method is unclear.

Reviewer 2

3. The discussion ignores the 2023 trial.
4. Minor: fix the typo in Table 2.
`

describe('parseComments', () => {
  it('parses numbered comments and reviewer headers', () => {
    const result = parseComments(REVIEW)
    expect(result.mode).toBe('numbered')
    expect(result.comments).toHaveLength(4)
    expect(result.comments.map(comment => comment.reviewer)).toEqual(['Reviewer 1', 'Reviewer 1', 'Reviewer 2', 'Reviewer 2'])
    expect(result.comments[0]!.text).toContain('power calculation')
    expect(result.comments[0]!.charStart).toBeGreaterThan(0)
  })

  it('falls back to paragraphs with a warning', () => {
    const result = parseComments('Reviewer 1\n\nThe analysis is unclear.\n\nThe writing needs work.')
    expect(result.mode).toBe('paragraph')
    expect(result.comments).toHaveLength(2)
    expect(result.warnings.join(' ')).toContain('paragraphs')
  })

  it('recognizes R1/R2 reviewer headers', () => {
    const result = parseComments('R1\n\n1. The sample size is not justified.\n\nR2\n\n2. The discussion is thin.')
    expect(result.mode).toBe('numbered')
    expect(result.comments.map(comment => comment.reviewer)).toEqual(['Reviewer 1', 'Reviewer 2'])
  })

  it('parses CRLF review text and response letters', () => {
    const review = REVIEW.replace(/\n/gu, '\r\n')
    const parsed = parseComments(review)
    expect(parsed.mode).toBe('numbered')
    expect(parsed.comments).toHaveLength(4)
    const letter = '1. We added a power calculation and explain the sample size.\r\n\r\n2. We now describe the randomization method in detail.\r\n'
    const { responses } = extractResponses(letter)
    expect(responses).toHaveLength(2)
    expect(responses[0]!.text).not.toContain('\r')
  })

  it('rejects empty text', () => {
    expect(() => parseComments('  ')).toThrow(RangeError)
  })
})

describe('extractResponses', () => {
  it('extracts numbered response blocks', () => {
    const { responses } = extractResponses('1. We thank the reviewer and have added a power calculation.\n\n2. We now describe the randomization in detail.\n')
    expect(responses.map(response => response.number)).toEqual([1, 2])
    expect(responses[0]!.text).toContain('power calculation')
  })
})

describe('checkCoverage', () => {
  const comments = parseComments(REVIEW).comments

  it('reports full coverage, missing numbers and short answers', () => {
    const letter = [
      '1. We thank the reviewer and have added a power calculation; the sample size section now explains it.',
      '2. We now describe the randomization method, including the sequence generation and allocation concealment.',
      `3. Added.`,
    ].join('\n\n')
    const { responses } = extractResponses(letter)
    const result = checkCoverage(comments, responses)
    expect(result.total).toBe(4)
    expect(result.answered).toBe(2)
    expect(result.empty).toBe(1)
    expect(result.missing).toBe(1)
    expect(result.coverage).toBe(0.5)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.findings.find(finding => finding.commentNumber === 3)?.status).toBe('empty')
    expect(result.findings.find(finding => finding.commentNumber === 4)?.status).toBe('missing')
  })

  it('flags a response that cites a number with no comment', () => {
    const { responses } = extractResponses('1. A sufficiently long response that addresses the first point fully.\n\n9. This number has no matching comment at all, which is a problem.\n\n9. A duplicate of that unmatched number, also long enough.')
    const result = checkCoverage(comments, responses)
    expect(result.extra).toBe(1)
    expect(result.findings.some(finding => finding.commentNumber === 9 && finding.status === 'extra')).toBe(true)
    expect(result.warnings.join(' ')).toContain('response number 9 appears 2 times')
  })

  it('uses the first response when a number repeats', () => {
    const { responses } = extractResponses(`1. First answer long enough to pass the short-answer check comfortably.\n\n1. Second answer for the same number.`)
    const result = checkCoverage(comments, responses)
    expect(result.findings.find(finding => finding.commentNumber === 1)?.responsePreview).toContain('First answer')
    expect(result.warnings.join(' ')).toContain('appears 2 times')
  })

  it('keeps the minimum response length explicit', () => {
    expect(MIN_RESPONSE_CHARS).toBe(20)
  })

  it('exports the same first response that coverage used when a number repeats', () => {
    const comments = parseComments(REVIEW).comments
    const { responses } = extractResponses(`1. First answer long enough to pass the short-answer check comfortably.\n\n1. Second answer for the same number, also long enough to pass.`)
    const result = checkCoverage(comments, responses)
    expect(result.findings.find(finding => finding.commentNumber === 1)?.responsePreview).toContain('First answer')
    const markdown = renderResponseLetter(comments, responses)
    expect(markdown).toContain('First answer')
    expect(markdown).not.toContain('Second answer')
  })
})
