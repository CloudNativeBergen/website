import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  rolloutFlags: vi.fn(),
  mergeKonfApiConference: vi.fn(),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientRead: { fetch: h.fetch },
  clientReadUncached: { fetch: h.fetch },
  clientReadCached: { fetch: h.fetch },
  clientWrite: {},
}))
vi.mock('@/lib/conference/konf-api', () => ({
  rolloutFlags: h.rolloutFlags,
  mergeKonfApiConference: h.mergeKonfApiConference,
  // The members-only read (#2038): a pass-through here.
  mergeTicketSetup: async (_host: string, c: unknown) => c,
}))

import { getSponsorForConference } from './sanity'
import { validateRegistrationToken } from './registration'

const sanityConf = {
  _id: 'conf-1',
  domains: ['example.com'],
  organization: { _ref: 'org-1' },
  title: 'Sanity Conf',
  startDate: '2026-10-15',
  endDate: '2026-10-16',
  venueName: 'Sanity Hall',
  venueAddress: 'Sanity St 1',
  registrationLink: 'https://sanity.example/tickets',
  sponsorRegistrationLink: null,
  sponsorEmail: 'sponsor@example.com',
}
const d1 = {
  title: 'D1 Conf',
  startDate: '2026-11-01',
  endDate: '2026-11-02',
  venueName: 'D1 Hall',
  venueAddress: 'D1 St 1',
  registrationLink: 'https://d1.example/tickets',
}

const sfcRow = () => ({
  _id: 'sfc-1',
  sponsor: { name: 'Acme' },
  conference: { ...sanityConf },
})
const portalRow = () => ({
  _id: 'sfc-1',
  conferenceName: sanityConf.title,
  conferenceStartDate: sanityConf.startDate,
  conferenceDoc: { ...sanityConf },
  contractStatus: 'contract-signed',
  afterSigning: {
    ticketUrl: sanityConf.registrationLink,
    startDate: sanityConf.startDate,
    endDate: sanityConf.endDate,
    venueName: sanityConf.venueName,
    venueAddress: sanityConf.venueAddress,
    sponsorEmail: sanityConf.sponsorEmail,
    discountCodes: ['ACME'],
    conferenceId: null,
  },
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  h.rolloutFlags.mockResolvedValue({ apiRead: false })
  h.mergeKonfApiConference.mockImplementation(async (_host, c) => ({
    ...c,
    ...d1,
  }))
})

describe('sponsor CRM conference reads (#1997)', () => {
  it('unflagged: Sanity values unchanged, gateway never called', async () => {
    h.fetch.mockResolvedValueOnce(sfcRow())
    const { sponsorForConference } = await getSponsorForConference('sfc-1')
    expect(sponsorForConference?.conference).toEqual(sanityConf)

    h.fetch.mockResolvedValueOnce(portalRow())
    const { sponsor } = await validateRegistrationToken('tok')
    expect(sponsor?.conferenceName).toBe('Sanity Conf')
    expect(sponsor?.afterSigning?.venueName).toBe('Sanity Hall')
    expect(sponsor?.afterSigning?.ticketUrl).toBe(sanityConf.registrationLink)
    expect(sponsor).not.toHaveProperty('conferenceDoc')
    expect(h.mergeKonfApiConference).not.toHaveBeenCalled()
  })

  it('apiRead: D1 fields win, Sanity-only fields stay', async () => {
    h.rolloutFlags.mockResolvedValue({ apiRead: true })
    h.fetch.mockResolvedValueOnce(sfcRow())
    const { sponsorForConference } = await getSponsorForConference('sfc-1')
    expect(sponsorForConference?.conference).toMatchObject({
      ...d1,
      _id: 'conf-1',
      sponsorEmail: 'sponsor@example.com',
    })

    h.fetch.mockResolvedValueOnce(portalRow())
    const { sponsor } = await validateRegistrationToken('tok')
    expect(sponsor?.conferenceName).toBe('D1 Conf')
    expect(sponsor?.conferenceStartDate).toBe('2026-11-01')
    expect(sponsor?.afterSigning).toMatchObject({
      startDate: '2026-11-01',
      endDate: '2026-11-02',
      venueName: 'D1 Hall',
      venueAddress: 'D1 St 1',
      ticketUrl: 'https://d1.example/tickets',
      sponsorEmail: 'sponsor@example.com',
    })
  })

  it('gateway failure falls back to Sanity', async () => {
    h.rolloutFlags.mockResolvedValue({ apiRead: true })
    h.mergeKonfApiConference.mockRejectedValue(new Error('down'))
    h.fetch.mockResolvedValueOnce(sfcRow())
    const { sponsorForConference } = await getSponsorForConference('sfc-1')
    expect(sponsorForConference?.conference?.title).toBe('Sanity Conf')

    h.fetch.mockResolvedValueOnce(portalRow())
    const { sponsor } = await validateRegistrationToken('tok')
    expect(sponsor?.conferenceName).toBe('Sanity Conf')
    expect(sponsor?.afterSigning?.venueName).toBe('Sanity Hall')
  })
})
