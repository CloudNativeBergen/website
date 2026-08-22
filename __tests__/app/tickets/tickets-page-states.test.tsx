/**
 * @vitest-environment node
 *
 * #846. `/tickets` had ONE fallback — "Tickets for X are not yet available" —
 * and it fired for four unrelated worlds. Three of them were false while
 * registration was open, and the falsehood was cached for hours
 * (`cacheLife('hours')`).
 *
 * Every case below runs the REAL page against a real `getPublicTicketTypes`,
 * varying only what the ticket vendor and the conference document say. Each is
 * asserted against the others: if the four worlds rendered the same screen the
 * suite would be worthless, so each test also names the sentence it must NOT
 * produce.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const sanityFetch = vi.fn()
const fetchPublicTicketTypes = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientReadCached: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientRead: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => sanityFetch(...a) },
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: 'live-tenant.example' })),
}))
vi.mock('@/lib/domain-verification/routing', () => ({
  isHostRoutable: vi.fn(async () => true),
}))
vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: vi.fn(async () => []),
  getFeaturedGalleryImages: vi.fn(async () => []),
}))
vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getPublicSponsorsForConference: vi.fn(async () => []),
}))
// Only the vendor call is stubbed; `hasTicketingBinding` / `ticketingBinding`
// stay real so the page's own gating is under test.
vi.mock('@/lib/tickets/provider', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveTicketingProvider: vi.fn(async () => ({
    configured: true,
    provider: { fetchPublicTicketTypes },
    eventRef: { customerId: 42, eventId: 7 },
  })),
}))

import TicketsPage from '@/app/(main)/tickets/page'

const COMING_SOON = 'Tickets Coming Soon'
const NOT_YET_AVAILABLE = 'are not yet available'

function conference(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'conf-1',
    title: 'Cloud Native Days',
    domains: ['live-tenant.example'],
    contactEmail: 'hello@live-tenant.example',
    startDate: '2026-09-01',
    endDate: '2026-09-02',
    checkinCustomerId: 42,
    checkinEventId: 7,
    ...overrides,
  }
}

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Conference',
    type: 'standard',
    description: null,
    price: [{ price: '1000', vat: '25', description: null, key: null }],
    available: null,
    requiresInvitation: false,
    visibleStartsAt: null,
    visibleEndsAt: null,
    position: 0,
    ...over,
  }
}

/** The page returns a nested async component; flush it to markup. */
async function renderPage(): Promise<string> {
  const outer = (await TicketsPage()) as ReactElement<{ domain: string }>
  const inner = await (
    outer.type as (p: { domain: string }) => Promise<ReactElement>
  )(outer.props)
  return renderToStaticMarkup(inner)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
})

describe('a free-to-attend event can show its tickets', () => {
  it('renders the ticket grid, marked Free, instead of "coming soon"', async () => {
    // The free plan's entire constituency: every type costs nothing, so the
    // old `price > 0` filter emptied the list and the page announced that
    // tickets were not yet available while registration was open.
    sanityFetch.mockResolvedValue(
      conference({
        registrationEnabled: true,
        registrationLink: 'https://register.example/free-event',
      }),
    )
    fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 7, name: 'Event', currencies: ['NOK'] },
      tickets: [
        ticket({ id: 1, name: 'Conference', price: [] }),
        ticket({
          id: 2,
          name: 'Workshop day',
          position: 1,
          price: [{ price: '0', vat: '0', description: null, key: null }],
        }),
      ],
    })

    const html = await renderPage()

    expect(html).toContain('Conference')
    expect(html).toContain('Workshop day')
    expect(html).toContain('Free')
    expect(html).toContain('This event is free to attend')
    // Never the VAT footnote, which is meaningless over free tickets.
    expect(html).not.toContain('excl. 25% VAT')
    expect(html).not.toContain(COMING_SOON)
    expect(html).not.toContain(NOT_YET_AVAILABLE)
  })

  it('does not publish a PAID event’s free types (crew, organizer)', async () => {
    // The deliberate limit on the fix. A zero-priced type on a paid event is
    // overwhelmingly internal; the public subset reaches the page through
    // `extractComplimentaryTickets` instead.
    sanityFetch.mockResolvedValue(conference())
    fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 7, name: 'Event', currencies: ['NOK'] },
      tickets: [
        ticket({ id: 1, name: 'Conference' }),
        ticket({ id: 2, name: 'Crew', position: 1, price: [] }),
      ],
    })

    const html = await renderPage()

    expect(html).toContain('Conference')
    expect(html).not.toContain('Crew')
    expect(html).toContain('excl. 25% VAT')
  })
})

describe('an external-registration tenant is not told tickets are unavailable', () => {
  it('sends the visitor to register instead', async () => {
    // Registration is on with a link, but nothing is bound to a ticket vendor.
    // The homepage offered registration while /tickets denied it existed.
    sanityFetch.mockResolvedValue(
      conference({
        checkinCustomerId: undefined,
        checkinEventId: undefined,
        registrationEnabled: true,
        registrationLink: 'https://register.example/tickets',
      }),
    )

    const html = await renderPage()

    expect(html).toContain('Registration Is Open')
    expect(html).toContain('https://register.example/tickets')
    expect(html).not.toContain(COMING_SOON)
    expect(html).not.toContain(NOT_YET_AVAILABLE)
    // No vendor is bound, so none may be called.
    expect(fetchPublicTicketTypes).not.toHaveBeenCalled()
  })
})

describe('a ticket-provider outage is reported as an outage', () => {
  it('says ticket information could not be loaded, not that there are none', async () => {
    sanityFetch.mockResolvedValue(
      conference({
        registrationEnabled: true,
        registrationLink: 'https://register.example/tickets',
      }),
    )
    fetchPublicTicketTypes.mockRejectedValue(new Error('checkin.no 503'))

    const html = await renderPage()

    expect(html).toContain('Ticket Information Unavailable')
    expect(html).not.toContain(COMING_SOON)
    expect(html).not.toContain(NOT_YET_AVAILABLE)
    // Registration came from the conference document, which we DID read, so
    // the CTA is still supportable.
    expect(html).toContain('https://register.example/tickets')
  })

  it('is DISTINGUISHABLE from a vendor that genuinely lists nothing', async () => {
    // The pair that proves the union earns its keep. Same conference, same
    // page; only the vendor's answer differs.
    sanityFetch.mockResolvedValue(conference())

    fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 7, name: 'Event', currencies: ['NOK'] },
      tickets: [],
    })
    const empty = await renderPage()

    fetchPublicTicketTypes.mockRejectedValue(new Error('checkin.no 503'))
    const failed = await renderPage()

    expect(empty).toContain(COMING_SOON)
    expect(empty).not.toContain('Ticket Information Unavailable')
    expect(failed).toContain('Ticket Information Unavailable')
    expect(failed).not.toContain(COMING_SOON)
  })
})

describe('the honest "coming soon" survives', () => {
  it('still fires when the read succeeded, there are no tickets, and registration is closed', async () => {
    sanityFetch.mockResolvedValue(conference({ registrationEnabled: false }))
    fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 7, name: 'Event', currencies: ['NOK'] },
      tickets: [],
    })

    const html = await renderPage()

    expect(html).toContain(COMING_SOON)
    expect(html).toContain(NOT_YET_AVAILABLE)
    expect(html).not.toContain('Registration Is Open')
    expect(html).not.toContain('Ticket Information Unavailable')
  })

  it('still renders the priced grid for an ordinary paid event', async () => {
    sanityFetch.mockResolvedValue(
      conference({
        registrationEnabled: true,
        registrationLink: 'https://register.example/tickets',
      }),
    )
    fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 7, name: 'Event', currencies: ['NOK'] },
      tickets: [ticket()],
    })

    const html = await renderPage()

    // nb-NO groups with a non-breaking space.
    expect(html).toMatch(/NOK\s1\s000/)
    expect(html).toContain('Buy ticket')
    expect(html).not.toContain('Free')
    expect(html).not.toContain(COMING_SOON)
    expect(html).not.toContain('This event is free to attend')
  })
})
