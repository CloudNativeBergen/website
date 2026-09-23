import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT, findMissingGated } from './assert-gated-coverage'

const GATED = ['src/lib/auth.ts', 'src/proxy.ts']

describe('assert-gated-coverage — findMissingGated', () => {
  it('accepts a report keyed by this root', () => {
    const keys = GATED.map((g) => path.join(ROOT, g))
    expect(findMissingGated(keys, GATED)).toEqual([])
  })

  it('names the gated file that is absent from the report', () => {
    const keys = [path.join(ROOT, 'src/lib/auth.ts')]
    expect(findMissingGated(keys, GATED)).toEqual(['src/proxy.ts'])
  })

  it('rejects a report keyed by ANOTHER checkout root, even when the suffix matches', () => {
    // The drift the guard exists for: blobs written under a different
    // absolute root. Vitest matches thresholds root-relative and would judge
    // nothing; a suffix comparison would have waved this through.
    const keys = GATED.map((g) => path.join('/different-checkout', g))
    expect(findMissingGated(keys, GATED)).toEqual(GATED)
  })

  it('resolves against the repo root by default', () => {
    expect(ROOT).toBe(path.resolve(__dirname, '..'))
  })
})
