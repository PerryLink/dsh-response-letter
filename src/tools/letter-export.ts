/**
 * `letter_export` — Markdown point-by-point letter + coverage.
 * @module dsh-response-letter/tools/letter-export
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { LetterError, type LetterRuntime } from '../runtime.ts'
import { extractResponses, type ReviewComment } from '../parse.ts'
import { ERROR_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    markdown: { type: 'string' },
    coverage: { type: 'json' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `letter_export` tool.
 * @param runtime - the runtime.
 * @returns the tool definition.
 */
export function makeLetterExportTool(runtime: LetterRuntime) {
  return defineTool({
    name: 'letter_export',
    description: [
      'Export a point-by-point response letter as Markdown (dsh-response-letter).',
      '',
      'Pairs comments with numbered responses in a table (#, reviewer, comment, response), marks unanswered points in bold, and appends the coverage table. Accepts parsed responses or extracts them from the letter text.',
    ].join('\n'),
    parameters: {
      comments: { type: 'json', required: true, description: 'Comments from letter_parse.' },
      responses: { type: 'json', description: 'Parsed responses from letter_check.' },
      letterText: { type: 'string', description: 'Response letter text (used when responses is omitted).' },
      title: { type: 'string', description: 'Letter title.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; markdown: string } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `letter_export failed (${result.error.code}): ${result.error.message}` }]
        return [{ type: 'text', text: result.markdown }]
      },
    },
    async execute(args: unknown) {
      const request = args as { comments?: ReviewComment[]; responses?: never; letterText?: string; title?: string }
      try {
        if (request.comments === undefined || request.comments.length === 0) throw new LetterError('INVALID_INPUT', 'pass the comments from letter_parse')
        const responses = request.responses !== undefined ? request.responses : extractResponses(request.letterText ?? '').responses
        const result = runtime.buildLetter(request.comments, responses, request.title ?? 'Response to reviewers')
        return { ok: true as const, markdown: result.markdown, coverage: result.coverage as never }
      } catch (error) {
        if (error instanceof LetterError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
