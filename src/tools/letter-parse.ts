/**
 * `letter_parse` — parse reviewer comments.
 * @module dsh-response-letter/tools/letter-parse
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { LetterError, type LetterRuntime } from '../runtime.ts'
import { ERROR_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    parse: { type: 'json' },
    evidenceId: { type: 'string' },
    recordPath: { type: 'string' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `letter_parse` tool.
 * @param runtime - the runtime.
 * @returns the tool definition.
 */
export function makeLetterParseTool(runtime: LetterRuntime) {
  return defineTool({
    name: 'letter_parse',
    description: [
      'Parse reviewer comments from a review text (dsh-response-letter).',
      '',
      'Recognizes `Reviewer 1` / `Referee #2` / `审稿人 2` headers and numbered markers (`1.`, `2)`, `Comment 3:`, `Q4:`); falls back to paragraphs with an explicit warning. Every comment gets a global number (the number a response must cite), a reviewer label and a character locator.',
    ].join('\n'),
    parameters: {
      text: { type: 'string', description: 'Review text (mutually exclusive with path).' },
      path: { type: 'string', description: 'Workspace-relative .md/.txt review file.' },
      persist: { type: 'boolean', description: 'Store the review as REP evidence + record (default true).' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; parse: { comments: unknown[]; reviewers: string[]; mode: string; warnings: string[] } } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `letter_parse failed (${result.error.code}): ${result.error.message}` }]
        return [
          { type: 'text', text: `letter_parse: ${result.parse.comments.length} comment(s) from ${result.parse.reviewers.join(', ') || 'no named reviewer'} (mode ${result.parse.mode})${result.parse.warnings.length === 0 ? '' : `; ${result.parse.warnings.join('; ')}`}` },
        ]
      },
    },
    async execute(args: unknown) {
      const request = args as { text?: string; path?: string; persist?: boolean }
      try {
        const result = await runtime.parse({
          ...(request.text === undefined ? {} : { text: request.text }),
          ...(request.path === undefined ? {} : { path: request.path }),
          ...(request.persist === undefined ? {} : { persist: request.persist }),
        })
        return {
          ok: true as const,
          parse: result.parse as never,
          ...(result.evidenceId === undefined ? {} : { evidenceId: result.evidenceId }),
          ...(result.recordPath === undefined ? {} : { recordPath: result.recordPath }),
        }
      } catch (error) {
        if (error instanceof LetterError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
