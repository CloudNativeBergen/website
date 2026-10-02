/**
 * @vitest-environment node
 *
 * The claim module's own contract, at its seam. The routers reach most of it
 * (see `sponsor.sendDiscount.test.ts`); this covers the rule a router cannot
 * reach because `resolveChosenCodes` refuses first from the same snapshot:
 * a claim whose holder STILL STORES the code is never taken over, however old.
 */
const h = vi.hoisted(() => ({
  claim: null as Record<string, unknown> | null,
  ops: [] as string[],
}))
vi.mock('@/lib/organization/sanity', () => ({
  organizationField: () => ({}),
}))
vi.mock('@/lib/sanity/client', () => {
  const chain = {
    ifRevisionId: () => chain,
    set: () => chain,
    commit: async () => {
      h.ops.push('takeover')
      return {}
    },
  }
  const client = {
    fetch: async () => h.claim,
    create: async () => {
      h.ops.push('create')
      throw Object.assign(new Error('already exists'), { statusCode: 409 })
    },
    patch: () => chain,
    delete: async () => {
      h.ops.push('delete')
    },
  }
  return { clientReadUncached: client, clientWrite: client }
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { claimDiscountCodes, discountCodeClaimId } from './discount-code-claims'

const LINKS = [
  {
    sponsorForConferenceId: 'sfc-globex',
    sponsorId: 'sp-globex',
    name: 'Globex',
    linkedCodes: ['VIP'],
  },
]

beforeEach(() => {
  h.ops = []
  h.claim = {
    _id: discountCodeClaimId('conf', 'VIP'),
    _rev: 'r1',
    code: 'VIP',
    sponsorForConferenceId: 'sfc-globex',
    // Far older than the settle window: stale by age alone.
    claimedAt: '2020-01-01T00:00:00.000Z',
  }
})

describe('claimDiscountCodes', () => {
  it('never takes over a claim whose holder still stores the code, however old', async () => {
    await expect(
      claimDiscountCodes({
        conferenceId: 'conf',
        orgRef: null,
        sponsorForConferenceId: 'sfc-acme',
        codes: [{ code: 'VIP', providerCodeId: 'VIP' }],
        links: LINKS,
        onConflict: 'refuse',
      }),
    ).rejects.toThrow('Discount code "VIP" is already linked to Globex')
    expect(h.ops).toEqual(['create'])
  })

  it('takes the same claim over once the holder no longer stores the code', async () => {
    const hold = await claimDiscountCodes({
      conferenceId: 'conf',
      orgRef: null,
      sponsorForConferenceId: 'sfc-acme',
      codes: [{ code: 'VIP', providerCodeId: 'VIP' }],
      links: [{ ...LINKS[0], linkedCodes: [] }],
      onConflict: 'refuse',
    })
    expect(hold.held.map((c) => c.code)).toEqual(['VIP'])
    expect(h.ops).toEqual(['create', 'takeover'])
  })

  it.each([
    ['ACME-2026', 'discountCodeClaim-conf-ACME-2026'],
    ['acme-2026 ', 'discountCodeClaim-conf-ACME-2026'],
  ])('derives one stable id per (conference, code): %s', (code, id) => {
    expect(discountCodeClaimId('conf', code)).toBe(id)
  })

  it('hashes a code the id alphabet cannot carry, without collisions', () => {
    const a = discountCodeClaimId('conf', 'A/B')
    const b = discountCodeClaimId('conf', 'A B')
    expect(a).toMatch(/^discountCodeClaim-conf-A_B-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })
})
