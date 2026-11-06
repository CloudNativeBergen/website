/** @vitest-environment node */
import { describe, it, expect } from 'vitest'
import {
  parseArgs,
  requireReadToken,
  ALL_COLUMNS_WARNING,
} from '../../scripts/backfill-conference'
import {
  updateColumns,
  SETTINGS_PHASE2_COLUMNS,
} from '../../services/conference/scripts/backfill'

const phases = { 'settings-phase1': ['a'], 'settings-phase2': ['b', 'c'] }

describe('backfill-conference parseArgs', () => {
  it('rejects a bare --only instead of clobbering every column', () => {
    expect(() => parseArgs(['--only'], phases)).toThrow('--only needs a value')
    expect(() => parseArgs(['--only', '--out', 'x'], phases)).toThrow(
      '--only needs a value',
    )
  })
  it('rejects an unknown phase', () => {
    expect(() => parseArgs(['--only', 'nope'], phases)).toThrow(
      'unknown --only nope',
    )
  })
  it('requires --only or --all-columns to write', () => {
    expect(() => parseArgs([], phases)).toThrow('pass --only <phase>')
    expect(() => parseArgs(['--out', 'x'], phases)).toThrow('pass --only')
  })
  it('rejects both flags together', () => {
    expect(() =>
      parseArgs(['--only', 'settings-phase1', '--all-columns'], phases),
    ).toThrow('not both')
  })
  it('--only selects that phase, no warning', () => {
    expect(parseArgs(['--only', 'settings-phase2'], phases)).toEqual({
      dryRun: false,
      outDir: '.',
      only: ['b', 'c'],
      warning: undefined,
    })
  })
  it('--all-columns updates everything and warns', () => {
    const o = parseArgs(['--all-columns', '--out', 'tmp/x'], phases)
    expect(o.only).toBeUndefined()
    expect(o.outDir).toBe('tmp/x')
    expect(o.warning).toBe(ALL_COLUMNS_WARNING)
    expect(o.warning).toContain('reverting D1-owned fields')
  })
  it('--dry-run needs no mode', () => {
    expect(parseArgs(['--dry-run'], phases).dryRun).toBe(true)
  })
})

describe('requireReadToken', () => {
  it('names the variable and how to set it', () => {
    expect(() => requireReadToken({})).toThrow(
      /SANITY_API_TOKEN_READ.*\n[\s\S]*fnox exec/,
    )
    expect(() => requireReadToken({ SANITY_API_TOKEN_READ: 't' })).not.toThrow()
  })
})

describe('column summary', () => {
  const row = { conference_id: 'c', org_id: 'o', title: 't', city: 'x' }
  it('lists the phase columns for --only', () => {
    expect(updateColumns(row as never, SETTINGS_PHASE2_COLUMNS)).toEqual([
      ...SETTINGS_PHASE2_COLUMNS,
    ])
  })
  it('lists every column except the keys for --all-columns', () => {
    expect(updateColumns(row as never)).toEqual(['title', 'city'])
  })
})
