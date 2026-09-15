/**
 * @vitest-environment node
 */
const publish = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/events/bus', () => ({ eventBus: { publish } }))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { becameSigned, publishSponsorStatusChange } from './events'

beforeEach(() => publish.mockClear())

describe('becameSigned', () => {
  const none = { status: 'negotiating', contractStatus: 'contract-sent' }
  it('is true when the contract becomes signed or the deal becomes won', () => {
    expect(
      becameSigned(none, { ...none, contractStatus: 'contract-signed' }),
    ).toBe(true)
    expect(becameSigned(none, { ...none, status: 'closed-won' })).toBe(true)
  })
  it('is false for anything else, including staying signed', () => {
    expect(becameSigned(none, { ...none, status: 'closed-lost' })).toBe(false)
    const won = { status: 'closed-won', contractStatus: 'contract-signed' }
    expect(becameSigned(won, won)).toBe(false)
    expect(
      becameSigned(
        { status: 'closed-won', contractStatus: 'contract-sent' },
        { status: 'closed-won', contractStatus: 'contract-sent' },
      ),
    ).toBe(false)
  })
})

describe('publishSponsorStatusChange', () => {
  const base = {
    conferenceId: 'conf-A',
    sponsorForConferenceId: 'sfc-1',
    source: 'test',
  }

  it('publishes ids and both states when a status changed, untouched fields carried over', async () => {
    await publishSponsorStatusChange({
      ...base,
      previous: { status: 'negotiating', contractStatus: 'contract-sent' },
      next: { contractStatus: 'contract-signed' },
      triggeredBy: 'sp-1',
    })
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'sponsor.status.changed',
        conferenceId: 'conf-A',
        sponsorForConferenceId: 'sfc-1',
        previous: { status: 'negotiating', contractStatus: 'contract-sent' },
        next: { status: 'negotiating', contractStatus: 'contract-signed' },
        metadata: { source: 'test', triggeredBy: 'sp-1' },
      }),
    )
  })

  it('publishes nothing when neither status changed', async () => {
    await publishSponsorStatusChange({
      ...base,
      previous: { status: 'closed-won', contractStatus: 'contract-signed' },
      next: { status: 'closed-won' },
    })
    expect(publish).not.toHaveBeenCalled()
  })

  it('treats a created record as changing from nothing', async () => {
    await publishSponsorStatusChange({
      ...base,
      previous: {},
      next: { status: 'closed-won', contractStatus: null },
    })
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        previous: { status: null, contractStatus: null },
        next: { status: 'closed-won', contractStatus: null },
      }),
    )
  })

  it('never throws when publishing fails', async () => {
    publish.mockRejectedValueOnce(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      publishSponsorStatusChange({
        ...base,
        previous: {},
        next: { status: 'closed-won' },
      }),
    ).resolves.toBeUndefined()
    spy.mockRestore()
  })
})
