/**
 * Runtime: workspace-safe text loading, parsing with REP evidence, coverage.
 * @module dsh-response-letter/runtime
 */

import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  EvidenceStore,
  RepStoreError,
  stableId,
  validateRep,
  type AddEvidenceInput,
  type CaptureInput,
  type CheckResult,
  type Evidence,
  type ResearchRecord,
  type Snapshot,
} from '@perrylink/dsh-research-core'
import type { ResolvedConfig } from './config.ts'
import { checkCoverage, type CoverageResult } from './check.ts'
import { extractResponses, parseComments, type ParsedResponse, type ParseResult, type ReviewComment } from './parse.ts'
import { renderCoverageMarkdown, renderResponseLetter } from './report.ts'
import { VERSION } from './version.ts'

/** Stable error codes. */
export type LetterErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'PATH_ESCAPE' | 'NOT_A_FILE' | 'TOO_LARGE' | 'UNSUPPORTED_FILE' | 'STORE_ERROR'

/** A typed failure. */
export class LetterError extends Error {
  /** Stable code. */
  readonly code: LetterErrorCode

  constructor(code: LetterErrorCode, message: string) {
    super(message)
    this.name = 'LetterError'
    this.code = code
  }
}

/** The subset of the REP service used here. */
export interface EvidencePort {
  capture(input: CaptureInput): Promise<{ snapshot: Snapshot }>
  addEvidence(input: AddEvidenceInput): Promise<{ evidence: Evidence }>
  buildRecord(options?: { evidenceIds?: readonly string[] }): Promise<Omit<ResearchRecord, 'manifest'>>
}

/** Parse result with evidence. */
export interface ParseValue {
  readonly parse: ParseResult
  readonly evidenceId?: string
  readonly recordPath?: string
}

/** Check request: comments directly, or a review text to parse. */
export interface CheckRequest {
  readonly comments?: readonly ReviewComment[]
  readonly reviewText?: string
  readonly reviewPath?: string
  readonly letterText?: string
  readonly letterPath?: string
}

/** Check value. */
export interface CheckValue {
  readonly coverage: CoverageResult
  readonly comments: readonly ReviewComment[]
  readonly responses: readonly ParsedResponse[]
  readonly warnings: readonly string[]
}

/** Runtime options. */
export interface LetterRuntimeOptions {
  readonly config: ResolvedConfig
  readonly service?: EvidencePort
  readonly now?: () => Date
}

/** True when `candidate` is inside `root`. */
function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)
}

/** The runtime. */
export class LetterRuntime {
  readonly config: ResolvedConfig

  readonly #service: EvidencePort | undefined
  readonly #now: () => Date
  #store: EvidenceStore | undefined

  constructor(options: LetterRuntimeOptions) {
    this.config = options.config
    this.#service = options.service
    this.#now = options.now ?? (() => new Date())
  }

  /** Current ISO timestamp. */
  iso(): string {
    return this.#now().toISOString()
  }

  /** The evidence port. */
  port(): EvidencePort {
    if (this.#service !== undefined) return this.#service
    this.#store ??= new EvidenceStore(path.join(this.config.root, 'store'))
    return this.#store
  }

  /** Resolve a file inside the workspace. */
  async resolveFile(input: string): Promise<{ absolute: string; id: string }> {
    if (typeof input !== 'string' || input.trim() === '') throw new LetterError('INVALID_INPUT', 'path must be a non-empty string')
    let realRoot: string
    try {
      realRoot = await realpath(this.config.workspaceRoot)
    } catch {
      throw new LetterError('NOT_FOUND', `workspace root does not exist: ${this.config.workspaceRoot}`)
    }
    const candidate = path.resolve(realRoot, input)
    if (!isInside(realRoot, candidate)) throw new LetterError('PATH_ESCAPE', 'path resolves outside the workspace root')
    let real: string
    try {
      real = await realpath(candidate)
    } catch {
      throw new LetterError('NOT_FOUND', `file not found: ${input}`)
    }
    if (!isInside(realRoot, real)) throw new LetterError('PATH_ESCAPE', 'path escapes the workspace root through a symlink')
    if (!(await stat(real)).isFile()) throw new LetterError('NOT_A_FILE', `not a regular file: ${input}`)
    return { absolute: real, id: path.relative(realRoot, real).split(path.sep).join('/') }
  }

  /** Load text from text/path with caps. */
  async loadText(request: { text?: string; path?: string }, label: string): Promise<{ text: string; sourceRef: AddEvidenceInput['sourceRef']; id: string }> {
    if ((request.text === undefined) === (request.path === undefined)) throw new LetterError('INVALID_INPUT', `pass exactly one of ${label}Text or ${label}Path`)
    if (request.text !== undefined) {
      if (request.text.length > this.config.maxChars) throw new LetterError('TOO_LARGE', `${label} text is ${request.text.length} characters, the cap is ${this.config.maxChars}`)
      return { text: request.text, sourceRef: { kind: 'other', id: `inline:${label}`, retrievedAt: this.iso() }, id: `inline:${label}` }
    }
    const file = await this.resolveFile(request.path!)
    if (/\.(docx?|pdf)$/iu.test(file.id)) throw new LetterError('UNSUPPORTED_FILE', 'docx/pdf is not parsed here; convert to .md/.txt (PDF text: dsh-doc-anchor)')
    const text = await readFile(file.absolute, 'utf8')
    if (text.length > this.config.maxChars) throw new LetterError('TOO_LARGE', `${label} file is ${text.length} characters, the cap is ${this.config.maxChars}`)
    return { text, sourceRef: { kind: 'file', id: file.id, retrievedAt: this.iso() }, id: file.id }
  }

  /**
   * Parse reviewer comments and (optionally) persist them as evidence.
   * @param request - text/path and persistence.
   * @returns parsed comments and evidence ids.
   */
  async parse(request: { text?: string; path?: string; persist?: boolean }): Promise<ParseValue> {
    const loaded = await this.loadText(request, 'review')
    let parse: ParseResult
    try {
      parse = parseComments(loaded.text)
    } catch (error) {
      if (error instanceof RangeError) throw new LetterError('INVALID_INPUT', error.message)
      throw error
    }
    const persist = request.persist ?? this.config.persist
    if (!persist) return { parse }
    const checks: CheckResult[] = [
      {
        checkId: 'chk-parse-mode',
        check: 'other',
        status: parse.mode === 'numbered' ? 'pass' : 'warn',
        severity: parse.mode === 'numbered' ? 'info' : 'warning',
        detail: parse.mode === 'numbered' ? `parsed ${parse.comments.length} numbered comment(s)` : 'comment numbers were not found; paragraphs were used, so response matching may fail',
      },
      ...(parse.reviewers.length === 0
        ? [{ checkId: 'chk-reviewers', check: 'other' as const, status: 'warn' as const, severity: 'warning' as const, detail: 'no reviewer headers were recognized' }]
        : []),
    ]
    const port = this.port()
    try {
      const captured = await port.capture({ bytes: loaded.text, mediaType: 'text/plain', sourceRef: loaded.sourceRef, capturedAt: this.iso() })
      const evidence = (
        await port.addEvidence({
          evidenceId: stableId('ev', ['response-letter', loaded.id, captured.snapshot.snapshotId]),
          title: `Review comments (${parse.comments.length})`,
          sourceRef: loaded.sourceRef,
          snapshotIds: [captured.snapshot.snapshotId],
          anchors: [{ snapshotId: captured.snapshot.snapshotId, kind: 'record', value: 'field:text' }],
          provenance: { plugin: 'dsh-response-letter', version: VERSION, method: 'review-parser', retrievedAt: this.iso() },
          checks,
          notes: `reviewers: ${parse.reviewers.join(', ') || 'none'}; mode: ${parse.mode}`,
        })
      ).evidence
      const record = await port.buildRecord({ evidenceIds: [evidence.evidenceId] })
      if (!validateRep(record).ok) throw new LetterError('STORE_ERROR', 'refusing to write an invalid REP record')
      const directory = path.join(this.config.root, 'records')
      await mkdir(directory, { recursive: true })
      const file = path.join(directory, `${evidence.evidenceId}.rep.json`)
      await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
      return { parse, evidenceId: evidence.evidenceId, recordPath: file }
    } catch (error) {
      if (error instanceof LetterError) throw error
      if (error instanceof RepStoreError) throw new LetterError('STORE_ERROR', error.message)
      throw new LetterError('STORE_ERROR', `could not store the evidence: ${(error as Error).message}`)
    }
  }

  /**
   * Check coverage of comments by a response letter.
   * @param request - comments (or a review to parse) and the letter.
   * @returns coverage plus the parsed responses.
   */
  async check(request: CheckRequest): Promise<CheckValue> {
    let comments = request.comments
    if (comments === undefined) {
      const parsed = await this.parse({
        ...(request.reviewText === undefined ? {} : { text: request.reviewText }),
        ...(request.reviewPath === undefined ? {} : { path: request.reviewPath }),
        persist: false,
      })
      comments = parsed.parse.comments
    }
    if (comments.length === 0) throw new LetterError('INVALID_INPUT', 'there are no comments to check')
    const letter = await this.loadText(
      { ...(request.letterText === undefined ? {} : { text: request.letterText }), ...(request.letterPath === undefined ? {} : { path: request.letterPath }) },
      'letter',
    )
    const { responses, warnings } = extractResponses(letter.text)
    const coverage = checkCoverage(comments, responses)
    return { coverage, comments, responses, warnings }
  }

  /**
   * Build the point-by-point Markdown letter.
   * @param comments - reviewer comments.
   * @param responses - parsed responses.
   * @param title - letter title.
   * @returns Markdown text and coverage.
   */
  buildLetter(comments: readonly ReviewComment[], responses: readonly ParsedResponse[], title = 'Response to reviewers'): { markdown: string; coverage: CoverageResult } {
    if (comments.length === 0) throw new LetterError('INVALID_INPUT', 'there are no comments')
    const coverage = checkCoverage(comments, responses)
    return { markdown: `${renderResponseLetter(comments, responses, title)}\n${renderCoverageMarkdown(coverage)}`, coverage }
  }
}
