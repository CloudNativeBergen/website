import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  MAX_ATTEMPTS,
  afterAttempt,
  isFontFetchFailure,
  runBuilds,
} from './ci-build'

/**
 * The output of a real failed "Build" job (run 38137132316, 2026-10-11),
 * shortened: one of the 24 font files could not be downloaded.
 */
const FONT_FETCH_FAILED = `
> Build error occurred
Error: Turbopack build failed with 24 errors:
Error: Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
- Execution of <NextFontGoogleFontFileReplacer as ImportMappingReplacement>::result failed
Error while looking up import map: next/font/google queries have exactly one entry
`

/** A build that failed for a reason of the code's own. */
const TYPE_ERROR = `
Failed to compile.
./src/server/routers/speaker.ts:145:7
Type error: Object literal may only specify known properties, and 'uncached' does not exist in type
`

/** The nearest miss: the same error, for a module of the application's own. */
const MODULE_NOT_FOUND = `
> Build error occurred
Error: Turbopack build failed with 1 errors:
Error: Module not found: Can't resolve '@/lib/workshop/missing'
`

/** A font the build cannot find in the repository: not a download, not retried. */
const LOCAL_FONT_MISSING = `
> Build error occurred
Error: Module not found: Can't resolve './fonts/google/Inter.woff2'
`

describe('isFontFetchFailure', () => {
  it('recognises a Google Font that could not be downloaded', () => {
    expect(isFontFetchFailure(FONT_FETCH_FAILED)).toBe(true)
    expect(
      isFontFetchFailure(
        '[next]/internal/font/google/ibm_plex_sans_8a8d0ae1.module.css',
      ),
    ).toBe(true)
  })

  it('does not take any other build failure for one', () => {
    expect(isFontFetchFailure(TYPE_ERROR)).toBe(false)
    expect(isFontFetchFailure(MODULE_NOT_FOUND)).toBe(false)
    expect(isFontFetchFailure(LOCAL_FONT_MISSING)).toBe(false)
    expect(isFontFetchFailure('')).toBe(false)
  })
})

describe('afterAttempt', () => {
  it('is done when the build succeeded, whatever it printed', () => {
    expect(afterAttempt(1, 0, FONT_FETCH_FAILED)).toBe('done')
  })

  it('builds again after a font fetch that failed, while attempts remain', () => {
    expect(afterAttempt(1, 1, FONT_FETCH_FAILED)).toBe('retry')
    expect(afterAttempt(MAX_ATTEMPTS - 1, 1, FONT_FETCH_FAILED)).toBe('retry')
  })

  it('gives up on the last attempt', () => {
    expect(afterAttempt(MAX_ATTEMPTS, 1, FONT_FETCH_FAILED)).toBe('fail')
  })

  it('never builds again after a real failure', () => {
    expect(afterAttempt(1, 1, TYPE_ERROR)).toBe('fail')
    expect(afterAttempt(1, 1, MODULE_NOT_FOUND)).toBe('fail')
    expect(afterAttempt(1, 1, LOCAL_FONT_MISSING)).toBe('fail')
  })
})

describe('runBuilds', () => {
  /** A build that answers these in turn, and a wait that only records. */
  function builds(...results: { exitCode: number; output: string }[]) {
    const build = vi.fn(async () => results.shift()!)
    const waited: number[] = []
    const wait = async (ms: number) => void waited.push(ms)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    return { build, wait, waited }
  }
  const fontFetchFailed = { exitCode: 1, output: FONT_FETCH_FAILED }

  it('builds once and ends with 0 when the build succeeds', async () => {
    const { build, wait, waited } = builds({ exitCode: 0, output: '' })

    expect(await runBuilds(build, wait)).toBe(0)

    expect(build).toHaveBeenCalledTimes(1)
    expect(waited).toEqual([])
  })

  it('ends at once with the build’s own exit code on a real failure', async () => {
    const { build, wait, waited } = builds({ exitCode: 2, output: TYPE_ERROR })

    expect(await runBuilds(build, wait)).toBe(2)

    expect(build).toHaveBeenCalledTimes(1)
    expect(waited).toEqual([])
    expect(console.log).not.toHaveBeenCalled()
  })

  it('recovers: builds again after a font fetch that failed, and says so', async () => {
    const { build, wait, waited } = builds(fontFetchFailed, {
      exitCode: 0,
      output: '',
    })

    expect(await runBuilds(build, wait)).toBe(0)

    expect(build).toHaveBeenCalledTimes(2)
    expect(waited).toEqual([15_000])
    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      '::warning::Build attempt 1 of 3 could not fetch a Google Font; building again.',
    )
  })

  it('gives up after three, with the last build’s exit code', async () => {
    const { build, wait, waited } = builds(fontFetchFailed, fontFetchFailed, {
      exitCode: 7,
      output: FONT_FETCH_FAILED,
    })

    expect(await runBuilds(build, wait)).toBe(7)

    expect(build).toHaveBeenCalledTimes(3)
    expect(waited).toEqual([15_000, 30_000])
  })

  it('stops retrying when a later attempt fails for a real reason', async () => {
    const { build, wait } = builds(fontFetchFailed, {
      exitCode: 2,
      output: TYPE_ERROR,
    })

    expect(await runBuilds(build, wait)).toBe(2)

    expect(build).toHaveBeenCalledTimes(2)
  })
})

describe('the script, run as CI runs it', () => {
  it('passes a failed build’s output through and exits with its code', () => {
    // A stand-in for `pnpm run build`, first on PATH: it fails for a reason
    // that is not a font, so the script must build exactly once.
    const bin = mkdtempSync(path.join(os.tmpdir(), 'ci-build-'))
    const calls = path.join(bin, 'calls')
    writeFileSync(
      path.join(bin, 'pnpm'),
      `#!/bin/sh\necho "$@" >> "${calls}"\necho "compiling"\necho "Type error: nope" >&2\nexit 3\n`,
    )
    chmodSync(path.join(bin, 'pnpm'), 0o755)
    const root = path.resolve(__dirname, '..')

    const run = spawnSync(
      path.join(root, 'node_modules', '.bin', 'tsx'),
      [path.join(root, 'scripts', 'ci-build.ts')],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        },
      },
    )

    expect(run.status).toBe(3)
    expect(run.stdout).toContain('compiling')
    expect(run.stderr).toContain('Type error: nope')
    expect(readFileSync(calls, 'utf8')).toBe('run build\n')
  }, 40_000)
})
