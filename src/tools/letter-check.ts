/**
 * `letter_check` — coverage of comments by the response letter.
 * @module dsh-response-letter/tools/letter-check
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { LetterError, type LetterRuntime } from '../runtime.ts'
import type { ReviewComment } from '../parse.ts'
import { ERROR_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    coverage: { type: 'json' },
    comments: { type: 'json' },
    responses: { type: 'json' },
    warnings: { type: 'array', items: { type: 'string' } },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `letter_check` tool.
 * @param runtime - the runtime.
 * @returns the tool definition.
 */
export function makeLetterCheckTool(runtime: LetterRuntime) {
  return defineTool({
    name: 'letter_check',
    description: [
      'Check whether every reviewer comment has a numbered response (dsh-response-letter).',
      '',
      'Matches response numbers to comment numbers; reports missing comments, responses shorter than 20 characters, duplicate numbers and responses citing a number that no comment has. It counts answers — it does not judge whether an answer is adequate.',
    ].join('\n'),
    parameters: {
      comments: { type: 'json', description: 'Comments from letter_parse (omit when passing reviewText/reviewPath).' },
      reviewText: { type: 'string', description: 'Review text to parse and check in one call.' },
      reviewPath: { type: 'string', description: 'Workspace-relative review file.' },
      letterText: { type: 'string', description: 'Response letter text (mutually exclusive with letterPath).' },
      letterPath: { type: 'string', description: 'Workspace-relative response letter file.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; coverage: { answered: number; total: number; missing: number; empty: number; extra: number; coverage: number } } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `letter_check failed (${result.error.code}): ${result.error.message}` }]
        return [
          {
            type: 'text',
            text: `letter_check: ${result.coverage.answered}/${result.coverage.total} answered (${(result.coverage.coverage * 100).toFixed(0)}%); missing ${result.coverage.missing}, too short ${result.coverage.empty}, extra ${result.coverage.extra}`,
          },
        ]
      },
    },
    async execute(args: unknown) {
      const request = args as {
        comments?: ReviewComment[]
        reviewText?: string
        reviewPath?: string
        letterText?: string
        letterPath?: string
      }
      try {
        const result = await runtime.check({
          ...(request.comments === undefined ? {} : { comments: request.comments }),
          ...(request.reviewText === undefined ? {} : { reviewText: request.reviewText }),
          ...(request.reviewPath === undefined ? {} : { reviewPath: request.reviewPath }),
          ...(request.letterText === undefined ? {} : { letterText: request.letterText }),
          ...(request.letterPath === undefined ? {} : { letterPath: request.letterPath }),
        })
        return {
          ok: true as const,
          coverage: result.coverage as never,
          comments: result.comments as never,
          responses: result.responses as never,
          warnings: [...result.warnings],
        }
      } catch (error) {
        if (error instanceof LetterError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
