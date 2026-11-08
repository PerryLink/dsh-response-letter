/**
 * Runtime and tool surface: evidence, path safety, export.
 * @module test/runtime-tools.spec
 */

import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { validateRep } from '@perrylink/dsh-research-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import type { ParsedResponse } from '../src/parse.ts'
import { LetterRuntime } from '../src/runtime.ts'
import { makeLetterCheckTool } from '../src/tools/letter-check.ts'
import { makeLetterExportTool } from '../src/tools/letter-export.ts'
import { makeLetterParseTool } from '../src/tools/letter-parse.ts'
import { VERSION } from '../src/version.ts'

const AT = new Date('2026-10-15T09:00:00.000Z')
const REVIEW = 'Reviewer 1\n\n1. The sample size is not justified.\n2. The randomization method is unclear.\n'
const LETTER = '1. We added a power calculation and explain the sample size in the methods.\n\n2. We now describe the randomization method in detail.\n'
let workspace: string
let store: string

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'letter-work-'))
  store = await mkdtemp(path.join(tmpdir(), 'letter-store-'))
  await writeFile(path.join(workspace, 'review.md'), REVIEW, 'utf8')
  await writeFile(path.join(workspace, 'letter.md'), LETTER, 'utf8')
})

afterEach(async () => {
  for (const directory of [workspace, store]) {
    if (directory.startsWith(tmpdir())) await rm(directory, { recursive: true, force: true })
  }
})

/** Build a runtime over the fixtures. */
function runtime(): LetterRuntime {
  return new LetterRuntime({ config: resolveConfig({ workspaceRoot: workspace, root: store }), now: () => AT })
}

const EXEC = {} as never

describe('runtime', () => {
  it('parses a review and writes a valid REP record', async () => {
    const result = await runtime().parse({ path: 'review.md' })
    expect(result.parse.comments).toHaveLength(2)
    expect(result.evidenceId).toMatch(/^ev-/u)
    const record = JSON.parse(await readFile(result.recordPath!, 'utf8')) as unknown
    expect(validateRep(record).ok, JSON.stringify(validateRep(record).issues)).toBe(true)
  })

  it('checks coverage from review + letter text and from files', async () => {
    const fromText = await runtime().check({ reviewText: REVIEW, letterText: LETTER })
    expect(fromText.coverage.answered).toBe(2)
    expect(fromText.coverage.coverage).toBe(1)
    const fromFiles = await runtime().check({ reviewPath: 'review.md', letterPath: 'letter.md' })
    expect(fromFiles.coverage.missing).toBe(0)
  })

  it('rejects traversal, docx and oversized text', async () => {
    await expect(runtime().parse({ path: '../escape.md' })).rejects.toMatchObject({ code: 'PATH_ESCAPE' })
    await writeFile(path.join(workspace, 'review.docx'), 'docx', 'utf8')
    await expect(runtime().parse({ path: 'review.docx' })).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' })
    const tiny = new LetterRuntime({ config: resolveConfig({ workspaceRoot: workspace, root: store, maxChars: 10 }), now: () => AT })
    await expect(tiny.parse({ text: REVIEW })).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it.runIf(process.platform !== 'win32')('rejects a symlink that escapes the workspace', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'letter-outside-'))
    try {
      await writeFile(path.join(outside, 'secret.md'), REVIEW, 'utf8')
      await symlink(path.join(outside, 'secret.md'), path.join(workspace, 'linked.md'))
      await expect(runtime().parse({ path: 'linked.md' })).rejects.toMatchObject({ code: 'PATH_ESCAPE' })
    } finally {
      if (outside.startsWith(tmpdir())) await rm(outside, { recursive: true, force: true })
    }
  })
})

describe('tools', () => {
  it('declares names and schemas', () => {
    for (const [tool, name] of [
      [makeLetterParseTool(runtime()), 'letter_parse'],
      [makeLetterCheckTool(runtime()), 'letter_check'],
      [makeLetterExportTool(runtime()), 'letter_export'],
    ] as const) {
      expect(tool.name).toBe(name)
      expect(Object.keys(tool.parameters).length).toBeGreaterThan(0)
      expect(tool.output.schema).toBeDefined()
    }
  })

  it('parse → check → export end to end', async () => {
    const parsed = (await makeLetterParseTool(runtime()).execute({ path: 'review.md' }, EXEC)) as { ok: true; parse: { comments: unknown[] } }
    expect(parsed.ok).toBe(true)

    const checked = (await makeLetterCheckTool(runtime()).execute({ comments: parsed.parse.comments, letterPath: 'letter.md' }, EXEC)) as {
      ok: true
      coverage: { coverage: number }
      responses: ParsedResponse[]
    }
    expect(checked.coverage.coverage).toBe(1)

    const exported = (await makeLetterExportTool(runtime()).execute({ comments: parsed.parse.comments, responses: checked.responses }, EXEC)) as {
      ok: true
      markdown: string
    }
    expect(exported.markdown).toContain('Response to reviewers')
    expect(exported.markdown).toContain('power calculation')
  })

  it('failure branch carries a stable code', async () => {
    const value = (await makeLetterParseTool(runtime()).execute({}, EXEC)) as { ok: false; error: { code: string } }
    expect(value.ok).toBe(false)
    expect(value.error.code).toBe('INVALID_INPUT')

    const malformedComments = (await makeLetterCheckTool(runtime()).execute({ comments: [{ number: '1', text: 'x' }], letterText: LETTER }, EXEC)) as { ok: false; error: { code: string } }
    expect(malformedComments.ok).toBe(false)
    expect(malformedComments.error.code).toBe('INVALID_INPUT')

    const parsed = await runtime().parse({ path: 'review.md', persist: false })
    const malformedResponses = (await makeLetterExportTool(runtime()).execute({ comments: parsed.parse.comments, responses: [{ number: 1, text: 42 }] }, EXEC)) as { ok: false; error: { code: string } }
    expect(malformedResponses.ok).toBe(false)
    expect(malformedResponses.error.code).toBe('INVALID_INPUT')
  })
})

describe('package', () => {
  it('VERSION matches package.json and the manifest declares a bundle patch', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Record<string, unknown>
    expect(pkg['version']).toBe(VERSION)
    expect(pkg['dsh']).toEqual({ manifestVersion: 1, bundle: { patch: './cordis.patch.yml' } })
    expect(pkg['dependencies']).toEqual({})
  })
})
