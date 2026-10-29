/**
 * @vitest-environment node
 */
const h = vi.hoisted(() => ({
  resolveEmailSender: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('@/lib/email/config', () => ({
  resolveEmailSender: h.resolveEmailSender,
  retryWithBackoff: async (fn: () => unknown) => await fn(),
  delay: async () => {},
  isRateLimitError: () => false,
  EMAIL_CONFIG: { RATE_LIMIT_DELAY: 0, MAX_RETRIES: 3 },
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

import { describe, it, expect, vi } from 'vitest'
import { fakeAccount } from '../../../__tests__/lib/email/fakeResendAccount'
import { removeFromSpeakerAudiences } from './audience-erasure'

describe('removeFromSpeakerAudiences (#1715)', () => {
  it('removes an unsubscribed address from every speaker audience of the org', async () => {
    const account = fakeAccount()
    h.resolveEmailSender.mockResolvedValue({ client: account.client })
    h.fetch.mockResolvedValue([{ _id: 'c1', title: 'Alpha' }])
    const { data } = await account.create({ name: 'Alpha Speakers [c1]' })
    account.fillWith(data.id, ['keep@a.test', 'Gone@a.test'], ['Gone@a.test'])

    const failures = await removeFromSpeakerAudiences('gone@a.test', 'org-1')

    expect(failures).toEqual([])
    expect(h.fetch.mock.calls[0][1]).toEqual({ orgId: 'org-1' })
    expect(account.contactsIn(data.id)).toEqual(['keep@a.test'])
  })
})
