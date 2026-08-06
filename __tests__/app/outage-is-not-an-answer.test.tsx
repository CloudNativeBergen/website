/**
 * @vitest-environment node
 *
 * #848. A failed read must never be rendered as a confident negative.
 *
 * These tests do NOT stub the conference loader — they make the Sanity client
 * itself THROW, exactly as a total outage does, and then assert on the markup
 * the real page produces. That is the whole point: `getConferenceForDomain`
 * answers a thrown read with a TRUTHY `{} as Conference`, so every downstream
 * `if (conference)` succeeded and reasoned about an empty conference. The
 * regression these lock down is a *rendered sentence*, not a helper's return
 * value.
 *
 * Each surface is asserted in BOTH directions — outage and genuine absence —
 * because a test that only proves "the outage copy appears" would also pass if
 * the outage copy appeared for a host that really has no conference.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const sanityFetch = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientRead: { fetch: (...a: unknown[]) => sanityFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => sanityFetch(...a) },
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: vi.fn(
    async () =>
      new Headers({ host: 'live-tenant.example', 'x-url': 'https://x/cfp' }),
  ),
}))
vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect')
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/cfp/proposal',
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

// The tenant chrome is a large tree with its own data needs; a probe is enough
// to prove the layout got as far as rendering the site.
vi.mock('@/components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tenant-chrome">{children}</div>
  ),
}))

// The form itself is a tRPC/react-query client tree; a probe is enough to
// prove the page reached the submit branch rather than an error branch.
vi.mock('@/components/cfp/ProposalForm', () => ({
  ProposalForm: () => <div data-testid="proposal-form" />,
}))

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(async () => ({
    speaker: { _id: 'speaker-1', email: 'ada@example.com' },
  })),
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: vi.fn(async () => ({
    speaker: { _id: 'speaker-1', name: 'Ada', email: 'ada@example.com' },
    err: null,
  })),
}))
vi.mock('@/lib/proposal/data/sanity', () => ({
  getProposals: vi.fn(async () => ({ proposals: [], proposalsError: null })),
}))

import MainLayout from '@/app/(main)/layout'
import NewProposalPage from '@/app/(cfp)/cfp/proposal/page'

/** A live tenant with an OPEN call for papers. */
const LIVE_CONFERENCE = {
  _id: 'conf-1',
  title: 'Cloud Native Days',
  domains: ['live-tenant.example'],
  contactEmail: 'hello@live-tenant.example',
  formats: ['lightning_10'],
  topics: [{ _id: 'topic-1', title: 'Platform engineering' }],
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-12-01',
}

async function renderLayout(): Promise<string> {
  return renderToStaticMarkup(
    (await MainLayout({ children: null })) as ReactElement,
  )
}

async function renderProposalPage(): Promise<string> {
  return renderToStaticMarkup(
    (await NewProposalPage({
      searchParams: Promise.resolve({}),
    })) as ReactElement,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
})

describe('a Sanity outage does not put a live tenant up for sale', () => {
  it('renders "temporarily unavailable" — NOT the claim-this-domain landing', async () => {
    sanityFetch.mockRejectedValue(new Error('ECONNREFUSED sanity.io'))

    const html = await renderLayout()

    expect(html).toContain('Temporarily unavailable')
    // The three sentences that used to greet a paying customer's visitors
    // during an outage.
    expect(html).not.toContain('No conference here yet')
    expect(html).not.toContain('No conference is configured for this domain')
    expect(html).not.toContain('Claim it')
  })

  it('keeps a crawler from banking the outage page as the tenant content', async () => {
    sanityFetch.mockRejectedValue(new Error('ECONNREFUSED sanity.io'))

    expect(await renderLayout()).toContain('noindex')
  })

  it('STILL offers the domain when the read succeeded and matched nothing', async () => {
    // The other direction. If this went green on an outage too, the test above
    // would prove nothing: both worlds would render the same screen.
    sanityFetch.mockResolvedValue(null)

    const html = await renderLayout()

    expect(html).toContain('No conference here yet')
    expect(html).not.toContain('Temporarily unavailable')
  })

  it('renders the tenant site when the conference resolves', async () => {
    sanityFetch.mockResolvedValue(LIVE_CONFERENCE)

    const html = await renderLayout()

    expect(html).toContain('tenant-chrome')
    expect(html).not.toContain('Temporarily unavailable')
    expect(html).not.toContain('No conference here yet')
  })
})

describe('a failed conference read does not close an open CFP', () => {
  it('tells a speaker the page is temporarily unavailable, not that the CFP is closed', async () => {
    sanityFetch.mockRejectedValue(new Error('ECONNREFUSED sanity.io'))

    const html = await renderProposalPage()

    expect(html).toContain('Temporarily Unavailable')
    // The old bug verbatim: the Server Error was set, then `if (conference)`
    // (always true) re-entered and overwrote it, because `isCfpOpen({})` is
    // false. A speaker was turned away from a call that was OPEN.
    expect(html).not.toContain('The Call for Papers is currently closed')
    expect(html).not.toContain('CFP Closed')
  })

  it('STILL reports a genuinely closed CFP as closed', async () => {
    sanityFetch.mockResolvedValue({
      ...LIVE_CONFERENCE,
      cfpStartDate: '2025-01-01',
      cfpEndDate: '2025-02-01',
    })

    const html = await renderProposalPage()

    expect(html).toContain('CFP Closed')
    expect(html).not.toContain('Temporarily Unavailable')
  })

  it('STILL renders the submission form when the CFP is open', async () => {
    sanityFetch.mockResolvedValue(LIVE_CONFERENCE)

    const html = await renderProposalPage()

    expect(html).toContain('proposal-form')
    expect(html).not.toContain('CFP Closed')
    expect(html).not.toContain('Temporarily Unavailable')
    expect(html).not.toContain('Submissions Not Open Yet')
  })
})
