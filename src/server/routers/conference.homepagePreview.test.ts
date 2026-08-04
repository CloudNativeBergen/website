import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

/**
 * `conference.homepagePreviewData` (E3) — the composer preview's data query.
 *
 * The three properties worth pinning, because each of them is a bug the preview
 * would otherwise ship with:
 *
 *  1. It asks for the PUBLIC page's exact include set. A missing include is a
 *     band that silently self-hides in the preview but renders on the live site.
 *  2. It asks UNCACHED. The whole point of the preview is that it shows the edit
 *     the organizer just made, and the public read is `'use cache'` for hours.
 *  3. A ticketing failure degrades to plain labels rather than failing the
 *     query — the preview must not go dark because checkin.no is down.
 */

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const hostMock = vi.fn<() => string | null>(() => 'cloudnativebergen.no')
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => (key === 'host' ? hostMock() : null),
  }),
}))

const getConferenceForDomainMock = vi.fn()
const getConferenceForCurrentDomainMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: (...args: unknown[]) =>
    getConferenceForDomainMock(...args),
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceForCurrentDomainMock(...args),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch: () => ({}) },
  clientReadUncached: { fetch: vi.fn() },
}))

const getPublicTicketTypesMock = vi.fn()
vi.mock('@/lib/tickets/public', () => ({
  getPublicTicketTypes: (...args: unknown[]) =>
    getPublicTicketTypesMock(...args),
  getLowestTicketPrice: (tickets: { amount: number }[]) =>
    tickets.length > 0
      ? { formatted: '3 490', amount: tickets[0].amount }
      : null,
  getTicketAvailability: () => 'on-sale',
}))

import { conferenceRouter } from './conference'

const CONFERENCE_ID = 'conf-1'
const ORG_ID = 'org-test'

function makeCaller(opts: { isOrganizer?: boolean } | null) {
  const speaker = opts
    ? {
        _id: 'sp-1',
        name: 'Org',
        isOrganizer: opts.isOrganizer ?? false,
        organizerOrgIds: opts.isOrganizer ? [ORG_ID] : [],
      }
    : undefined
  const ctx = {
    session: speaker ? { speaker, user: { name: 'Org' } } : null,
    speaker,
  } as unknown as Context
  return conferenceRouter.createCaller(ctx)
}

/** The conference the request host resolves to, ticketing fully bound. */
function domainConference(extra: Record<string, unknown> = {}) {
  return {
    _id: CONFERENCE_ID,
    title: 'Cloud Native Days Norway',
    organization: { _type: 'reference', _ref: ORG_ID },
    checkinCustomerId: 42,
    checkinEventId: 99,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hostMock.mockReturnValue('cloudnativebergen.no')
  // Drives the authz waist's org resolution.
  getConferenceForCurrentDomainMock.mockResolvedValue({
    conference: domainConference(),
    domain: 'cloudnativebergen.no',
    error: null,
  })
  getConferenceForDomainMock.mockResolvedValue({
    conference: domainConference(),
    domain: 'cloudnativebergen.no',
    error: null,
  })
  getPublicTicketTypesMock.mockResolvedValue({
    event: {},
    tickets: [{ amount: 3490 }],
    complimentaryTickets: [],
  })
})

describe('conference.homepagePreviewData', () => {
  it('rejects a non-organizer (the preview is admin-only)', async () => {
    await expect(
      makeCaller({ isOrganizer: false }).homepagePreviewData(),
    ).rejects.toThrow()
  })

  it('rejects an anonymous caller', async () => {
    await expect(makeCaller(null).homepagePreviewData()).rejects.toThrow()
  })

  it('reads the public homepage include set, uncached, for the request host', async () => {
    await makeCaller({ isOrganizer: true }).homepagePreviewData()

    expect(getConferenceForDomainMock).toHaveBeenCalledTimes(1)
    const [domain, options] = getConferenceForDomainMock.mock.calls[0]
    expect(domain).toBe('cloudnativebergen.no')
    // The public page's include set, field for field (src/app/(main)/page.tsx).
    expect(options).toMatchObject({
      organizers: true,
      sponsors: true,
      sponsorTiers: true,
      featuredSpeakers: true,
      featuredTalks: true,
      schedule: true,
      gallery: { featuredOnly: true },
    })
    // The property the preview lives or dies on.
    expect(options.uncached).toBe(true)
  })

  it('returns the conference with the resolved ticket price and availability', async () => {
    const result = await makeCaller({
      isOrganizer: true,
    }).homepagePreviewData()

    expect(result.conference._id).toBe(CONFERENCE_ID)
    expect(result.ticketsFromPrice).toBe('3 490')
    expect(result.ticketAvailability).toBe('on-sale')
  })

  it('degrades to plain labels when the ticket provider throws', async () => {
    getPublicTicketTypesMock.mockRejectedValue(new Error('checkin.no is down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await makeCaller({
      isOrganizer: true,
    }).homepagePreviewData()

    expect(result.conference._id).toBe(CONFERENCE_ID)
    expect(result.ticketsFromPrice).toBeNull()
    expect(result.ticketAvailability).toBeNull()
    errorSpy.mockRestore()
  })

  it('skips the ticket call entirely without a full ticketing binding', async () => {
    getConferenceForDomainMock.mockResolvedValue({
      conference: { ...domainConference(), checkinEventId: undefined },
      domain: 'cloudnativebergen.no',
      error: null,
    })

    const result = await makeCaller({
      isOrganizer: true,
    }).homepagePreviewData()

    expect(getPublicTicketTypesMock).not.toHaveBeenCalled()
    expect(result.ticketsFromPrice).toBeNull()
  })

  it('throws NOT_FOUND when the host resolves to no conference', async () => {
    getConferenceForDomainMock.mockResolvedValue({
      conference: {},
      domain: 'unknown.example',
      error: new Error('Conference not found for domain: unknown.example'),
    })

    await expect(
      makeCaller({ isOrganizer: true }).homepagePreviewData(),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
