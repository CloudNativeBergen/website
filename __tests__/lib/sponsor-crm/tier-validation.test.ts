import { describe, it, expect, vi } from 'vitest'
import {
  closedWonTierWarning,
  tierExistenceQuery,
} from '@/lib/sponsor-crm/tier-validation'

const exists = () => Promise.resolve(true)
const absent = () => Promise.resolve(false)

describe('closedWonTierWarning', () => {
  it('passes for non-closed-won statuses regardless of tier', async () => {
    expect(await closedWonTierWarning('negotiating', undefined, absent)).toBe(
      true,
    )
  })

  it('warns when a closed-won sponsor has no tier reference', async () => {
    const result = await closedWonTierWarning('closed-won', undefined, exists)
    expect(result).toMatch(/tier/i)
  })

  it('warns when the closed-won tier reference is dangling (doc deleted)', async () => {
    const result = await closedWonTierWarning('closed-won', 'tier-x', absent)
    expect(result).toMatch(/no longer exists/i)
  })

  it('passes when the closed-won tier reference resolves to an existing doc', async () => {
    expect(await closedWonTierWarning('closed-won', 'tier-x', exists)).toBe(
      true,
    )
  })

  it('skips the existence check when there is no tier reference', async () => {
    const check = vi.fn().mockResolvedValue(true)
    await closedWonTierWarning('closed-won', undefined, check)
    expect(check).not.toHaveBeenCalled()
  })
})

describe('tierExistenceQuery', () => {
  it('checks for a published sponsorTier with the given id', () => {
    const { query, params } = tierExistenceQuery('tier-x')
    expect(query).toContain('_type == "sponsorTier"')
    expect(query).toContain('_id == $id')
    expect(params).toEqual({ id: 'tier-x' })
  })

  it('does not count draft-only tiers (no drafts arm — the public site reads published)', () => {
    const { query } = tierExistenceQuery('tier-x')
    expect(query).not.toContain('drafts')
    expect(query).not.toContain('$draftId')
  })

  it('normalises a drafts-prefixed ref to its published id', () => {
    expect(tierExistenceQuery('drafts.tier-x').params).toEqual({ id: 'tier-x' })
  })
})
