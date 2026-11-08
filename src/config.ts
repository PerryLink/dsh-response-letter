/**
 * Config schema and resolution for `dsh-response-letter`.
 * @module dsh-response-letter/config
 */

import path from 'node:path'
import z from '@deepseek-ai/schemastery'

/** Raw plugin config. */
export interface Config {
  enabled?: boolean
  root?: string
  workspaceRoot?: string
  maxChars?: number
  persist?: boolean
}

/** Fully resolved config. */
export interface ResolvedConfig {
  readonly enabled: boolean
  readonly root: string
  readonly workspaceRoot: string
  readonly maxChars: number
  readonly persist: boolean
}

/** Schemastery schema. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  root: z.string().default('.response-letter'),
  workspaceRoot: z.string(),
  maxChars: z.number().default(1_000_000),
  persist: z.boolean().default(true),
})

/** Throw unless the value is a positive safe integer. */
function assertPositiveInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer, got ${String(value)}`)
}

/**
 * Validate raw values and fill explicit defaults.
 * @param config - raw plugin config.
 * @returns the fully resolved config.
 */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  const root = config.root ?? '.response-letter'
  if (typeof root !== 'string' || root.trim() === '') throw new TypeError('root must be a non-empty path')
  const maxChars = config.maxChars ?? 1_000_000
  assertPositiveInt('maxChars', maxChars)
  return {
    enabled: config.enabled ?? true,
    root: path.resolve(root),
    workspaceRoot: path.resolve(config.workspaceRoot ?? process.cwd()),
    maxChars,
    persist: config.persist ?? true,
  }
}
