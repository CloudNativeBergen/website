import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS, afterAttempt, isFontFetchFailure } from './ci-build'

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

describe('isFontFetchFailure', () => {
  it('recognises a Google Font that could not be downloaded', () => {
    expect(isFontFetchFailure(FONT_FETCH_FAILED)).toBe(true)
  })

  it('does not take any other build failure for one', () => {
    expect(isFontFetchFailure(TYPE_ERROR)).toBe(false)
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
  })
})
