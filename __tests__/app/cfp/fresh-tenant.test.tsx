/**
 * @vitest-environment node
 *
 * THE DAY-ONE SCENARIO. `@/lib/onboarding/create.ts` now provisions every new
 * tenant WITH a starter set of session formats, so the CFP a brand-new organizer
 * shares actually accepts proposals instead of waiting on them to find a
 * checklist row. This suite is the guard on that: it builds the conference
 * document EXACTLY the way provisioning builds it — no fixture that "looks
 * fresh", the real `buildOnboardingDocuments` — pushes it through the real
 * `getConferenceForDomain` boundary, and walks the public CFP page.
 *
 * It ALSO keeps the crash-safety half of #824 alive: the boundary normalisation
 * and the empty-formats copy still have to work, because an organizer can empty
 * the list from admin at any time and every conference created before this
 * change still has none. Those cases now strip the field explicitly rather than
 * relying on provisioning to produce it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const conferenceFetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: (...args: unknown[]) => conferenceFetchMock(...args) },
  clientReadCached: {
    fetch: (...args: unknown[]) => conferenceFetchMock(...args),
  },
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
import type { Conference } from '@/lib/conference/types'
import {
  canAcceptProposals,
  hasSubmittableFormats,
} from '@/lib/conference/state'
import CFPPage from '@/app/(main)/cfp/page'

const FRESH_HOST = 'brand-new.konf.run'

/** What an organizer picks for themselves — provisioning seeds no topics. */
const ORGANIZER_TOPICS = [
  { _id: 'topic-1', title: 'Platform engineering', _type: 'topic' },
]

/**
 * The conference document a concierge provisioning run actually writes. Built by
 * the real `buildOnboardingDocuments` so this fixture can never drift away from
 * what production creates.
 */
function provisionedConferenceDocument(domains: string[] = [FRESH_HOST]) {
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
      domains,
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

/** The same document with its formats taken away: a pre-existing tenant, or one
 * whose organizer emptied the list. */
function conferenceWithoutFormats(domains: string[] = [FRESH_HOST]) {
  const doc = provisionedConferenceDocument(domains)
  delete doc.formats
  return doc
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

describe('a freshly provisioned tenant', () => {
  it('is provisioned WITH the starter formats and WITHOUT topics', () => {
    // Guards the premise of everything below.
    const doc = provisionedConferenceDocument()
    expect(doc.formats).toEqual([
      'lightning_10',
      'presentation_25',
      'presentation_45',
    ])
    expect(doc.topics).toBeUndefined()
  })

  it('passes the submittable-formats gate straight out of provisioning', async () => {
    // The REAL predicate, on the REAL document, through the REAL boundary —
    // this is the fact both submit routes key off (`proposal.create`,
    // `proposal.action`). Before starter formats it was false on day one.
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())

    const { conference } = await getConferenceForDomain(FRESH_HOST)

    expect(hasSubmittableFormats(conference)).toBe(true)
  })

  it('renders the public CFP page WITHOUT throwing', async () => {
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())

    const html = await renderCfpPage()

    expect(html).toContain('Call for Presentations')
    expect(html).toContain('Brand New Conf')
  })

  it('STILL cannot accept a proposal — starter formats are not the whole job', () => {
    // The day-one truth, stated once so nobody reads the starter formats as
    // "the CFP works now". Strict submit validation also requires at least one
    // TOPIC, and provisioning deliberately seeds none (topics are far more
    // conference-specific than session lengths). One of the two day-one
    // blockers is gone; the other is the organizer's to clear.
    const conference = provisionedConferenceDocument() as unknown as Conference
    expect(hasSubmittableFormats(conference)).toBe(true)
    expect(canAcceptProposals(conference)).toBe(false)
  })

  it('does not invite a submission it cannot complete', async () => {
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())

    const html = await renderCfpPage()

    expect(html).not.toContain('Submit your proposal')
    expect(html).not.toContain('href="/cfp/proposal"')
    expect(html).toContain('Submissions are not open yet')
  })

  it('invites submissions as soon as the organizer adds topics', async () => {
    // NOTHING else needed: no format work, no other configuration. This is what
    // the starter formats buy — one step instead of two.
    conferenceFetchMock.mockResolvedValue({
      ...provisionedConferenceDocument(),
      topics: ORGANIZER_TOPICS,
    })

    const html = await renderCfpPage()

    expect(html).toContain('Submit your proposal')
    expect(html).toContain('href="/cfp/proposal"')
    expect(html).not.toContain('Submissions are not open yet')
  })

  it('advertises the starter formats by their human titles', async () => {
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())

    const html = await renderCfpPage()

    expect(html).toContain('Presentation formats')
    expect(html).toContain('Lightning Talk (10 min)')
    expect(html).toContain('Presentation (25 min)')
    expect(html).toContain('Presentation (45 min)')
  })

  it('does not promise workshops nobody has planned', async () => {
    // The starter set is talks only, so the page must not raise the
    // "Hands-on Workshops" section or its heading over an empty list.
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())

    const html = await renderCfpPage()

    expect(html).not.toContain('Workshop formats')
    expect(html).not.toContain('Hands-on Workshops')
  })

  it('still shows placeholder topics rather than crashing on an absent list', async () => {
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument())

    const html = await renderCfpPage()

    expect(html).toContain('Engineering practice')
  })

  it('provisioning omits domains when the operator supplies none', () => {
    // `create.ts` writes `domains` conditionally, so an operator-created tenant
    // with no domain yet produces a document missing a non-optional array
    // field — the #824 crash class, one field over.
    expect(provisionedConferenceDocument([]).domains).toBeUndefined()
  })

  it('the boundary normalises a document with no domains end to end', async () => {
    conferenceFetchMock.mockResolvedValue(provisionedConferenceDocument([]))

    const { conference } = await getConferenceForDomain(FRESH_HOST)

    expect(conference.domains).toEqual([])
    expect(conference.formats).toHaveLength(3)
  })
})

describe('a conference with no formats (pre-existing, or emptied by its organizer)', () => {
  it('the conference boundary hands out arrays, not undefined', async () => {
    conferenceFetchMock.mockResolvedValue(conferenceWithoutFormats())

    const { conference } = await getConferenceForDomain(FRESH_HOST, {
      topics: true,
    })

    expect(Array.isArray(conference.formats)).toBe(true)
    expect(conference.formats).toHaveLength(0)
    expect(Array.isArray(conference.topics)).toBe(true)
    expect(conference.topics).toHaveLength(0)
    expect(Array.isArray(conference.domains)).toBe(true)
  })

  it('renders the public CFP page WITHOUT throwing', async () => {
    conferenceFetchMock.mockResolvedValue(conferenceWithoutFormats())

    const html = await renderCfpPage()

    expect(html).toContain('Call for Presentations')
  })

  it('does not invite a submission it cannot accept', async () => {
    conferenceFetchMock.mockResolvedValue(conferenceWithoutFormats())

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
})

describe('a tenant that has added workshops', () => {
  it('advertises them in their own section', async () => {
    conferenceFetchMock.mockResolvedValue({
      ...provisionedConferenceDocument(),
      formats: ['lightning_10', 'presentation_25', 'workshop_120'],
      topics: ORGANIZER_TOPICS,
    })

    const html = await renderCfpPage()

    expect(html).toContain('Submit your proposal')
    expect(html).toContain('Presentation formats')
    expect(html).toContain('Workshop formats')
    expect(html).not.toContain('Submissions are not open yet')
  })
})
