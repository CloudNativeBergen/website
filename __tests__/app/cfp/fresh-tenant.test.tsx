/**
 * @vitest-environment node
 *
 * THE DAY-ONE SCENARIO. `@/lib/onboarding/create.ts` provisions a brand-new
 * tenant with NO `formats` and NO `topics` on the reasoning that "the admin
 * surfaces are empty-safe". The PUBLIC surfaces were not: the conference
 * projection is a bare `...` spread, so both fields come back `undefined`, and
 * `/cfp` did `conference.formats.filter(...)` unguarded. With no `error.tsx`
 * anywhere under `src/app`, that is a bare 500 on the first CFP link a new
 * organizer shares with speakers.
 *
 * This suite builds the conference document EXACTLY the way provisioning builds
 * it — no fixture that "looks fresh", the real builder — pushes it through the
 * real `getConferenceForDomain` boundary, and walks the public CFP page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const conferenceFetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: (...args: unknown[]) => conferenceFetchMock(...args) },
  clientReadUncached: {
    fetch: (...args: unknown[]) => conferenceFetchMock(...args),
  },
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: FRESH_HOST })),
}))

vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: vi.fn(async () => []),
  getFeaturedGalleryImages: vi.fn(async () => []),
}))

vi.mock('@/lib/sponsor-crm/sanity', () => ({
  getPublicSponsorsForConference: vi.fn(async () => []),
}))

import { buildOnboardingDocuments } from '@/lib/onboarding/create'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import CFPPage from '@/app/(main)/cfp/page'

const FRESH_HOST = 'brand-new.konf.run'

/**
 * The conference document a concierge provisioning run actually writes. Built
 * by the real `buildOnboardingDocuments` so this fixture can never drift away
 * from what production creates — if provisioning starts seeding formats, this
 * test stops being about an empty tenant and should be updated deliberately.
 */
function provisionedConferenceDocument() {
  let key = 0
  const { conference } = buildOnboardingDocuments(
    {
      organization: {
        name: 'Brand New Events',
        slug: 'brand-new-events',
        contactEmail: 'hello@brand-new.example',
      },
      conference: {
        title: 'Brand New Conf',
        city: 'Bergen',
        country: 'Norway',
      },
      organizer: { name: 'Ada Organizer', email: 'ada@brand-new.example' },
      domains: [FRESH_HOST],
    },
    {
      organizationId: 'org-fresh',
      conferenceId: 'conf-fresh',
      speakerId: 'speaker-fresh',
      mintKey: () => `key-${++key}`,
    },
    null,
  )
  return conference
}

/**
 * `/cfp` is a server component wrapping ONE async child (`CachedCFPContent`).
 * Awaiting the page yields that child's element; awaiting the child gives a
 * tree of ordinary components that `renderToStaticMarkup` can finish. Anything
 * that throws while dereferencing the conference throws right here — which is
 * the whole point of the test.
 */
async function renderCfpPage(): Promise<string> {
  const pageElement = (await CFPPage()) as ReactElement<{ domain: string }>
  const inner = await (
    pageElement.type as (props: {
      domain: string
    }) => Promise<ReactElement | null>
  )(pageElement.props)
  return inner === null ? '' : renderToStaticMarkup(inner)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a freshly provisioned tenant (no formats, no topics)', () => {
  it('provisioning really does omit formats and topics', () => {
    // Guards the premise: if this ever fails, the rest of the suite is
    // testing a scenario that no longer exists.
    const doc = provisionedConferenceDocument()
    expect(doc.formats).toBeUndefined()
    expect(doc.topics).toBeUndefined()
  })

  it('the conference boundary hands out arrays, not undefined', async () => {
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())

    const { conference } = await getConferenceForDomain(FRESH_HOST, {
      topics: true,
    })

    expect(Array.isArray(conference.formats)).toBe(true)
    expect(conference.formats).toHaveLength(0)
    expect(Array.isArray(conference.topics)).toBe(true)
    expect(conference.topics).toHaveLength(0)
    // `domains` is also optional at provisioning time (an operator may create a
    // tenant with none) and is typed non-optional — same crash class.
    expect(Array.isArray(conference.domains)).toBe(true)
  })

  it('renders the public CFP page WITHOUT throwing', async () => {
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())

    const html = await renderCfpPage()

    expect(html).toContain('Call for Presentations')
    expect(html).toContain('Brand New Conf')
  })

  it('does not invite a submission it cannot accept', async () => {
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())

    const html = await renderCfpPage()

    // No trap: a proposal REQUIRES a format (`validateProposalForm`) and this
    // conference offers none, so the CTA must not be there.
    expect(html).not.toContain('Submit your proposal')
    expect(html).not.toContain('href="/cfp/proposal"')
    expect(html).toContain('Submissions are not open yet')
    // Honest copy points at the organizers, which provisioning defaults to the
    // org contact address.
    expect(html).toContain('hello@brand-new.example')
    // And no heading over an empty list.
    expect(html).not.toContain('Presentation formats')
    expect(html).not.toContain('Workshop formats')
  })

  it('still shows placeholder topics rather than crashing on an absent list', async () => {
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())

    const html = await renderCfpPage()

    expect(html).toContain('Engineering practice')
  })
})

describe('a configured tenant keeps the submit CTA', () => {
  it('advertises formats and links to the proposal form', async () => {
    conferenceFetchMock.mockResolvedValue({
      ...provisionedConferenceDocument(),
      cfpStartDate: '2026-01-01',
      cfpEndDate: '2026-12-01',
      formats: ['lightning_10', 'presentation_25', 'workshop_120'],
    })

    const html = await renderCfpPage()

    expect(html).toContain('Submit your proposal')
    expect(html).toContain('href="/cfp/proposal"')
    expect(html).toContain('Presentation formats')
    expect(html).toContain('Workshop formats')
    expect(html).not.toContain('Submissions are not open yet')
  })
})
