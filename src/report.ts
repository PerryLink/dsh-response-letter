/**
 * Markdown export for response letters and coverage checks.
 * @module dsh-response-letter/report
 */

import type { CoverageResult } from './check.ts'
import type { ParsedResponse, ReviewComment } from './parse.ts'

/** Escape a Markdown table cell. */
function cell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\n+/gu, ' ').trim()
}

/**
 * Render a point-by-point response table.
 * @param comments - reviewer comments.
 * @param responses - parsed responses.
 * @param title - letter title.
 * @returns Markdown text.
 */
export function renderResponseLetter(comments: readonly ReviewComment[], responses: readonly ParsedResponse[], title = 'Response to reviewers'): string {
  const byNumber = new Map(responses.map(response => [response.number, response]))
  const lines = [`# ${title}`, '']
  lines.push(`We thank the reviewers for their comments. ${comments.length} point(s) are answered below; the numbering matches the review.`)
  lines.push('')
  lines.push('| # | Reviewer | Comment | Response |')
  lines.push('|---:|---|---|---|')
  for (const comment of comments) {
    const response = byNumber.get(comment.number)
    lines.push(`| ${comment.number} | ${cell(comment.reviewer || '—')} | ${cell(comment.text)} | ${response === undefined ? '**NOT ANSWERED**' : cell(response.text)} |`)
  }
  lines.push('')
  const unanswered = comments.filter(comment => !byNumber.has(comment.number)).map(comment => comment.number)
  if (unanswered.length > 0) {
    lines.push(`> Unanswered points: ${unanswered.join(', ')}. Do not submit the letter before addressing them.`)
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

/**
 * Render a coverage check as Markdown.
 * @param result - coverage result.
 * @returns Markdown text.
 */
export function renderCoverageMarkdown(result: CoverageResult): string {
  const lines = ['# Response coverage', '']
  lines.push(`**Answered:** ${result.answered}/${result.total} (${(result.coverage * 100).toFixed(1)}%) · **missing:** ${result.missing} · **too short:** ${result.empty} · **extra:** ${result.extra}`)
  lines.push('')
  lines.push('| # | Reviewer | Status | Detail |')
  lines.push('|---:|---|---|---|')
  for (const finding of result.findings) {
    lines.push(`| ${finding.commentNumber} | ${cell(finding.reviewer ?? '—')} | ${finding.status} | ${cell(finding.detail)} |`)
  }
  lines.push('')
  for (const warning of result.warnings) lines.push(`- ${warning}`)
  lines.push('')
  lines.push('> Coverage counts numbered answers; it does not judge whether an answer is adequate.')
  return `${lines.join('\n')}\n`
}
