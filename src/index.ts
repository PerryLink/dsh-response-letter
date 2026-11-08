/**
 * `dsh-response-letter` — reviewer comments → point-by-point coverage → export.
 *
 * Three tools: letter_parse, letter_check, letter_export. Local text handling;
 * no network.
 *
 * Function plugin — no default export.
 * @module dsh-response-letter
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig, type Config as ConfigShape } from './config.ts'
import { LetterRuntime, type EvidencePort } from './runtime.ts'
import { makeLetterCheckTool } from './tools/letter-check.ts'
import { makeLetterExportTool } from './tools/letter-export.ts'
import { makeLetterParseTool } from './tools/letter-parse.ts'

/** Cordis plugin name. */
export const name = 'response-letter'

/** The tool registry is required; the REP service is optional. */
export const inject = ['tools']

export { Config, resolveConfig }
export type { ConfigShape }
export type { ResolvedConfig } from './config.ts'
export { VERSION } from './version.ts'
export { MIN_RESPONSE_CHARS, checkCoverage } from './check.ts'
export type { CoverageFinding, CoverageResult } from './check.ts'
export { extractResponses, parseComments } from './parse.ts'
export type { ParsedResponse, ParseResult, ReviewComment } from './parse.ts'
export { renderCoverageMarkdown, renderResponseLetter } from './report.ts'
export { LetterError, LetterRuntime } from './runtime.ts'
export type { CheckRequest, CheckValue, EvidencePort, LetterErrorCode, LetterRuntimeOptions, ParseValue } from './runtime.ts'
export { makeLetterParseTool } from './tools/letter-parse.ts'
export { makeLetterCheckTool } from './tools/letter-check.ts'
export { makeLetterExportTool } from './tools/letter-export.ts'

/**
 * Mount the three tools.
 * @param ctx - the plugin context (host).
 * @param config - raw plugin config.
 */
export function apply(ctx: Context, config: ConfigShape): void {
  const resolved = resolveConfig(config)
  const logger = ctx.logger('response-letter')
  if (!resolved.enabled) {
    logger.info('disabled: enabled is false — no tools are mounted')
    return
  }
  const service = ctx.get('researchEvidence') as EvidencePort | undefined
  const runtime = new LetterRuntime({ config: resolved, ...(service === undefined ? {} : { service }) })
  if (service === undefined) {
    logger.info(`ctx.researchEvidence is not mounted; using a local core store under ${resolved.root}`)
  }
  ctx.effect(() => ctx.tools.register(makeLetterParseTool(runtime)), 'response-letter: letter_parse tool')
  ctx.effect(() => ctx.tools.register(makeLetterCheckTool(runtime)), 'response-letter: letter_check tool')
  ctx.effect(() => ctx.tools.register(makeLetterExportTool(runtime)), 'response-letter: letter_export tool')
}
