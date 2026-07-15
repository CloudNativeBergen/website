import { beforeEach, describe, expect, it, vi } from 'vitest'

// Control the Sanity write client so we can assert on the patch/log calls the
// promotion helper makes without touching a real dataset.
const { patch, set, commit, create } = vi.hoisted(() => {
  const commit = vi.fn(async () => ({}))
  const set = vi.fn<(fields: unknown) => { commit: typeof commit }>(() => ({
    commit,
  }))
  const patch = vi.fn<(id: string) => { set: typeof set }>(() => ({ set }))
  const create = vi.fn<(doc: unknown) => Promise<{ _id: string }>>(
    async () => ({
      _id: 'activity-id',
    }),
  )
  return { patch, set, commit, create }
})

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch, create },
}))

import { promoteToClosedWonOnContract } from '../activity'

const SFC_ID = 'sfc-123'
const TIER = { _ref: 'tier-abc' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('promoteToClosedWonOnContract', () => {
  it.each(['prospect', 'contacted', 'negotiating'] as const)(
    'promotes a %s deal with a tier to closed-won and logs a stage change',
    async (status) => {
      const result = await promoteToClosedWonOnContract(
        SFC_ID,
        { status, tier: TIER },
        'user-1',
      )

      expect(result).toEqual({ promoted: true })

      // Pipeline status patched to closed-won on the right record.
      expect(patch).toHaveBeenCalledWith(SFC_ID)
      expect(set).toHaveBeenCalledWith({ status: 'closed-won' })
      expect(commit).toHaveBeenCalledTimes(1)

      // A stage_change activity was recorded reflecting the move.
      expect(create).toHaveBeenCalledTimes(1)
      const activity = create.mock.calls[0][0] as {
        activityType: string
        metadata?: { oldValue?: string; newValue?: string }
      }
      expect(activity.activityType).toBe('stage_change')
      expect(activity.metadata?.oldValue).toBe(status)
      expect(activity.metadata?.newValue).toBe('closed-won')
    },
  )

  it.each(['closed-won', 'closed-lost'] as const)(
    'no-ops on a terminal %s deal without patching or re-logging',
    async (status) => {
      const result = await promoteToClosedWonOnContract(
        SFC_ID,
        { status, tier: TIER },
        'user-1',
      )

      expect(result).toEqual({ promoted: false, reason: 'not-early-stage' })
      expect(patch).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )

  it('defaults a missing status to an early stage and promotes', async () => {
    const result = await promoteToClosedWonOnContract(
      SFC_ID,
      { tier: TIER },
      'user-1',
    )

    expect(result).toEqual({ promoted: true })
    expect(set).toHaveBeenCalledWith({ status: 'closed-won' })
  })

  it('skips promotion and logs a note when the tier guard fails', async () => {
    const result = await promoteToClosedWonOnContract(
      SFC_ID,
      { status: 'negotiating', tier: null },
      'user-1',
    )

    expect(result).toEqual({ promoted: false, reason: 'tier-missing' })

    // Never patches the record to an invalid (tier-less) closed-won.
    expect(patch).not.toHaveBeenCalled()

    // Logs a skip note (not a stage_change) for the audit trail.
    expect(create).toHaveBeenCalledTimes(1)
    const activity = create.mock.calls[0][0] as { activityType: string }
    expect(activity.activityType).toBe('note')
  })

  it('reports an error without throwing when the patch fails', async () => {
    commit.mockRejectedValueOnce(new Error('sanity down'))

    const result = await promoteToClosedWonOnContract(
      SFC_ID,
      { status: 'prospect', tier: TIER },
      'user-1',
    )

    expect(result.promoted).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    // Failed before it could log a stage change.
    expect(create).not.toHaveBeenCalled()
  })
})
