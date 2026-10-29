import { describe, expect, it } from 'vitest'
import {
  BroadcastFiltersSchema,
  resolveBroadcastRecipients,
} from './broadcast-recipients'
import type { SponsorForConferenceExpanded } from './types'

const sfc = (
  id: string,
  status: string,
  tierId: string | null,
  contacts: Array<{ email: string; isPrimary?: boolean; role?: string }>,
) =>
  ({
    _id: id,
    status,
    tier: tierId ? { _id: tierId, title: tierId } : undefined,
    sponsor: { name: id },
    contactPersons: contacts.map((c, i) => ({ _key: `k${i}`, name: 'A B', ...c })),
  }) as unknown as SponsorForConferenceExpanded

const sponsors = [
  sfc('acme', 'closed-won', 'gold', [
    { email: 'p@acme.test', isPrimary: true },
    { email: 'bill@acme.test', role: 'Billing Reference' },
  ]),
  sfc('beta', 'closed-won', 'silver', [
    { email: 'p@beta.test', isPrimary: true },
    { email: 'P@ACME.test' },
    { email: '  ' },
  ]),
  sfc('gamma', 'negotiating', 'gold', [{ email: 'p@gamma.test' }]),
]

const emails = (input: unknown) =>
  resolveBroadcastRecipients(sponsors, BroadcastFiltersSchema.parse(input))
    .recipients.map((r) => r.email)

describe('resolveBroadcastRecipients', () => {
  it('defaults to every contact at closed-won sponsors, deduplicated', () => {
    expect(emails({})).toEqual(['p@acme.test', 'bill@acme.test', 'p@beta.test'])
  })

  it('filters by tier', () => {
    expect(emails({ tierIds: ['silver'] })).toEqual(['p@beta.test', 'P@ACME.test'])
  })

  it('filters by stage', () => {
    expect(emails({ statuses: ['negotiating'] })).toEqual(['p@gamma.test'])
  })

  it('filters by contact role', () => {
    expect(emails({ contactRole: 'primary' })).toEqual([
      'p@acme.test',
      'p@beta.test',
    ])
    expect(emails({ contactRole: 'billing' })).toEqual(['bill@acme.test'])
  })

  it('counts only sponsors that contribute a recipient', () => {
    const r = resolveBroadcastRecipients(
      sponsors,
      BroadcastFiltersSchema.parse({ contactRole: 'billing' }),
    )
    expect(r.sponsors.map((s) => s._id)).toEqual(['acme'])
  })

  it('rejects unknown keys, so no recipient list can ride along', () => {
    expect(() =>
      BroadcastFiltersSchema.parse({ emails: ['x@evil.test'] }),
    ).toThrow()
  })
})
