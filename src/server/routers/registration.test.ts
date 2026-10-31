/**
 * @vitest-environment node
 *
 * registration.complete (#1687 N1): the registration-complete Slack alert is
 * addressed to the sponsor's owner, and a Slack failure never fails the
 * sponsor's submit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

const h = vi.hoisted(() => ({
  notify: vi.fn(),
}))

vi.mock('@/lib/sponsor-crm/registration', () => ({
  validateRegistrationToken: vi.fn(),
  generateRegistrationToken: vi.fn(),
  buildPortalUrl: vi.fn(),
  completeRegistration: vi.fn(async () => ({
    success: true,
    sponsorForConferenceId: 'sfc-1',
  })),
  getSfcForNotification: vi.fn(async () => ({
    _id: 'sfc-1',
    sponsorName: 'Acme',
    ownerName: null,
    tierTitle: null,
    contractValue: null,
    contractCurrency: null,
    conference: { _id: 'conf-1' },
  })),
}))
vi.mock('@/lib/sponsor-crm/activity', () => ({
  logRegistrationComplete: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))
vi.mock('@/lib/slack/notify', () => ({
  notifySponsorRegistrationComplete: h.notify,
}))
vi.mock('@/lib/svg/upload', () => ({
  sanitizeSvgFieldOrThrow: (s: string) => s,
  SvgSanitizeError: class extends Error {},
}))

import { registrationRouter } from './registration'

const caller = registrationRouter.createCaller({} as Context)
const input = {
  token: '11111111-2222-4333-8444-555555555555',
  contactPersons: [{ name: 'Kari', email: 'kari@acme.test' }],
  billing: { email: 'billing@acme.test' },
  logo: '<svg/>',
  orgNumber: '123',
  address: 'Street 1',
}

beforeEach(() => vi.clearAllMocks())

describe('registration.complete Slack alert', () => {
  it('addresses the owner (none here) of the registered sponsor', async () => {
    await caller.complete(input)
    expect(h.notify).toHaveBeenCalledOnce()
    expect(h.notify.mock.calls[0][5]).toEqual({
      sfcId: 'sfc-1',
      ownerName: null,
    })
  })

  it('still succeeds when Slack fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.notify.mockRejectedValueOnce(new Error('slack down'))
    await expect(caller.complete(input)).resolves.toEqual({ success: true })
  })
})

describe('registration.validate (#848)', () => {
  it('answers NOT_FOUND for an unknown token', async () => {
    const { validateRegistrationToken } =
      await import('@/lib/sponsor-crm/registration')
    vi.mocked(validateRegistrationToken).mockResolvedValueOnce({
      error: new Error('Invalid or expired registration token'),
    })
    await expect(caller.validate({ token: input.token })).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    )
  })

  it('answers INTERNAL_SERVER_ERROR when the read fails', async () => {
    const { validateRegistrationToken } =
      await import('@/lib/sponsor-crm/registration')
    vi.mocked(validateRegistrationToken).mockResolvedValueOnce({
      error: new Error('sanity down'),
      transient: true,
    })
    await expect(caller.validate({ token: input.token })).rejects.toMatchObject(
      { code: 'INTERNAL_SERVER_ERROR' },
    )
  })
})
