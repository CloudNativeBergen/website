import { describe, expect, it, vi } from 'vitest'
import { mapBackfill } from '../../../services/conference/scripts/backfill'
import { movedConferencePatch } from './conference-write'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({}))

describe('movedConferencePatch published (#1892)', () => {
  // The D1 write must derive `published` exactly as the backfill (and so the
  // parity sweep) does, or every lifecycle change reads as daily drift.
  it.each([['cancelled'], ['archived'], [null], ['something-else']])(
    'matches the backfill for lifecycleStatus %s',
    (lifecycleStatus) => {
      const backfill = mapBackfill(
        [{ _id: 'c', orgId: 'o', lifecycleStatus }],
        new Set(['c']),
      ).rows[0].published
      expect(movedConferencePatch({ lifecycleStatus }).published).toBe(
        backfill === 1,
      )
    },
  )

  it('leaves published untouched when the lifecycle is not in the input', () => {
    expect(movedConferencePatch({ title: 'x' })).not.toHaveProperty('published')
  })
})
