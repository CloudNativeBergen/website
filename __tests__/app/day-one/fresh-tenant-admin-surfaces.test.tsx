/**
 * @vitest-environment jsdom
 *
 * DAY ONE, ADMIN SIDE — the counterpart to `fresh-tenant-public-pages.test.tsx`
 * (#830), which covered the public half of the same class of bug.
 *
 * `@/lib/onboarding/create.ts` provisions a tenant with a title, an org
 * reference, a city/country, contact addresses and a starter format list —
 * and NO dates of any kind: no `startDate`/`endDate`, no `cfpStartDate`/
 * `cfpEndDate`. Four admin surfaces responded to that silence by stating
 * something false rather than nothing (#838):
 *
 *   - the CFP Health widget subtracted an absent `cfpStartDate` from now and
 *     printed the result, so its tiles read "Opens In: NaNd" / "Duration: NaNd";
 *   - the Proposal Pipeline widget derived CFP status from the same absent
 *     dates, and because `NaN > 0` is false it reported the CFP as **Open** on a
 *     conference whose CFP had never been configured;
 *   - `/admin/schedule` offered "Create First Track", took a track name, and
 *     dropped it — with zero conference dates there are zero days, so the
 *     reducer had nothing to attach it to and returned state unchanged;
 *   - `/admin/marketing` printed a hardcoded 'June 15, 2025' on a DOWNLOADABLE
 *     share graphic, so the invented date could leave the product entirely.
 *
 * Every conference here is built by the REAL `buildOnboardingDocuments`, so if
 * provisioning ever starts seeding dates the premise guard below fails loudly
 * instead of this suite quietly testing a scenario that no longer exists.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'

/* -------------------------------------------------------------------------- */
/* Module boundaries                                                          */
/* -------------------------------------------------------------------------- */

const fetchCFPHealthMock = vi.fn()
const fetchProposalPipelineMock = vi.fn()
vi.mock('@/lib/dashboard/fetchers', () => ({
  fetchCFPHealth: () => fetchCFPHealthMock(),
  fetchProposalPipeline: () => fetchProposalPipelineMock(),
}))

const {
  saveMutateAsync,
  actionMutateAsync,
  pollInvalidate,
  pollSetData,
  routerRefresh,
} = vi.hoisted(() => ({
  saveMutateAsync: vi.fn(),
  actionMutateAsync: vi.fn(),
  pollInvalidate: vi.fn(),
  pollSetData: vi.fn(),
  routerRefresh: vi.fn(),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      schedule: {
        admin: {
          pollExternalChanges: {
            invalidate: pollInvalidate,
            setData: pollSetData,
          },
        },
      },
    }),
    schedule: {
      save: { useMutation: () => ({ mutateAsync: saveMutateAsync }) },
      action: { useMutation: () => ({ mutateAsync: actionMutateAsync }) },
      admin: {
        pollExternalChanges: { useQuery: () => ({ data: undefined }) },
        proposalsStatus: { useQuery: () => ({ data: undefined }) },
      },
    },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}))

/* Marketing page boundaries. */
const getConferenceForCurrentDomainMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceForCurrentDomainMock(...args),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => ({})) }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: vi.fn(async () => true),
}))
vi.mock('@/lib/gallery/sanity', () => ({
  getFeaturedGalleryImages: vi.fn(async () => []),
}))
vi.mock('@/lib/proposal/server', () => ({
  getProposals: vi.fn(async () => ({ proposals: [], proposalsError: null })),
}))
vi.mock('@/components/CloudNativePattern', () => ({
  CloudNativePattern: () => <div data-testid="pattern" />,
}))
vi.mock('@/components/admin/MemeGeneratorWithDownload', () => ({
  MemeGeneratorWithDownload: () => <div data-testid="meme-generator" />,
}))
vi.mock('@/components/admin/PhotoGalleryWithDownload', () => ({
  PhotoGalleryWithDownload: () => <div data-testid="photo-gallery" />,
}))
vi.mock('@/components/common/DownloadableImage', () => ({
  DownloadableImage: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="downloadable">{children}</div>
  ),
}))

import { buildOnboardingDocuments } from '@/lib/onboarding/create'
import type { Conference } from '@/lib/conference/types'
import { CFPHealthWidget } from '@/components/admin/dashboard/widgets/CFPHealthWidget'
import { ProposalPipelineWidget } from '@/components/admin/dashboard/widgets/ProposalPipelineWidget'
import { ScheduleEditor } from '@/components/admin/schedule/ScheduleEditor'
import {
  scheduleReducer,
  initScheduleEditorState,
  NO_SCHEDULE_DAY_ERROR,
} from '@/lib/schedule/reducer'
import MarketingPage from '@/app/(admin)/admin/marketing/page'

/* -------------------------------------------------------------------------- */
/* The document provisioning actually writes                                  */
/* -------------------------------------------------------------------------- */

const FRESH_HOST = 'brand-new.konf.run'

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

/** The same document, typed the way every admin surface consumes it. */
const freshConference = () =>
  provisionedConferenceDocument() as unknown as Conference

beforeEach(() => {
  vi.clearAllMocks()
  fetchCFPHealthMock.mockResolvedValue(null)
  fetchProposalPipelineMock.mockResolvedValue(null)
  getConferenceForCurrentDomainMock.mockResolvedValue({
    conference: { ...freshConference(), sponsors: [] },
    error: null,
  })
})

afterEach(cleanup)

describe('what provisioning actually writes', () => {
  it('omits every date and the whole CFP window, but does seed formats', () => {
    // Guards the premise of this entire suite: if it fails, the surfaces below
    // are no longer being tested against an unconfigured conference and the
    // suite should be rewritten, not patched.
    const doc = provisionedConferenceDocument()
    expect(doc.startDate).toBeUndefined()
    expect(doc.endDate).toBeUndefined()
    expect(doc.cfpStartDate).toBeUndefined()
    expect(doc.cfpEndDate).toBeUndefined()
    expect(doc.cfpNotifyDate).toBeUndefined()
    expect(doc.programDate).toBeUndefined()
    // #833 DID start seeding session formats, so an "everything is absent"
    // premise would be wrong today. Formats are present; dates are not.
    expect(doc.formats).toEqual([
      'lightning_10',
      'presentation_25',
      'presentation_45',
    ])
    expect(doc.title).toBe('Brand New Conf')
  })
})

/**
 * The icons in all three new day-one states are decorative: the heading, the
 * message and the link already carry the meaning, so an exposed icon is pure
 * screen-reader noise. `WidgetEmptyState` hides its icon slot structurally;
 * the schedule editor's state leans on the `aria-hidden="true"` Heroicons emit
 * by default. This asserts the OUTCOME, so either mechanism changing is caught.
 */
function assertNoExposedDecorativeIcon() {
  const svgs = Array.from(document.querySelectorAll('svg'))
  expect(svgs.length).toBeGreaterThan(0)
  for (const svg of svgs) {
    const hidden =
      svg.getAttribute('aria-hidden') === 'true' ||
      svg.closest('[aria-hidden="true"]') !== null
    expect(hidden).toBe(true)
  }
}

describe('CFP Health widget on an unconfigured conference', () => {
  it('renders no NaN countdown', async () => {
    render(<CFPHealthWidget conference={freshConference()} />)

    expect(await screen.findByText(/No CFP dates set yet/i)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/NaN/)
    // The countdown tiles must be gone entirely, not merely blanked.
    expect(screen.queryByText(/Opens In/i)).toBeNull()
    expect(screen.queryByText(/Duration/i)).toBeNull()
  })

  it('points at the setting that would fill the gap', async () => {
    render(<CFPHealthWidget conference={freshConference()} />)

    const link = await screen.findByRole('link', { name: /Set CFP dates/i })
    expect(link.getAttribute('href')).toBe('/admin/settings')
  })

  it('does not announce its decorative icon', async () => {
    render(<CFPHealthWidget conference={freshConference()} />)

    await screen.findByText(/No CFP dates set yet/i)
    assertNoExposedDecorativeIcon()
  })
})

describe('Proposal Pipeline widget on an unconfigured conference', () => {
  it('does not claim the CFP is open', async () => {
    render(<ProposalPipelineWidget conference={freshConference()} />)

    expect(await screen.findByText(/No CFP dates set yet/i)).toBeTruthy()
    // "Open" was an affirmative false statement about a CFP nobody configured.
    expect(screen.queryByText('Open')).toBeNull()
    expect(document.body.textContent).not.toMatch(/NaN/)
  })

  it('points at the setting that would fill the gap', async () => {
    render(<ProposalPipelineWidget conference={freshConference()} />)

    const link = await screen.findByRole('link', { name: /Set CFP dates/i })
    expect(link.getAttribute('href')).toBe('/admin/settings')
  })

  it('does not announce its decorative icon', async () => {
    render(<ProposalPipelineWidget conference={freshConference()} />)

    await screen.findByText(/No CFP dates set yet/i)
    assertNoExposedDecorativeIcon()
  })
})

describe('/admin/schedule on an unconfigured conference', () => {
  // `getScheduleData()` builds one editor day per date between the conference
  // start and end, so no dates means no days at all.
  const noDays = {
    officialSchedules: [],
    draftSchedules: [],
    conference: freshConference(),
    initialProposals: [],
  }

  it('never offers a track creation that has nowhere to land', () => {
    render(<ScheduleEditor {...noDays} />)

    expect(screen.queryByRole('button', { name: /Create First Track/i })).toBe(
      null,
    )
    expect(screen.queryByRole('button', { name: /Create first track/i })).toBe(
      null,
    )
    expect(screen.queryByText(/No tracks created yet/i)).toBeNull()
  })

  it('says which setting is missing and links to it', () => {
    render(<ScheduleEditor {...noDays} />)

    expect(screen.getByText(/Set your conference dates first/i)).toBeTruthy()
    const link = screen.getByRole('link', {
      name: /conference settings/i,
    })
    expect(link.getAttribute('href')).toBe('/admin/settings')
  })

  it('does not announce its decorative icons', () => {
    render(<ScheduleEditor {...noDays} />)

    assertNoExposedDecorativeIcon()
  })

  it('surfaces an edit that cannot be applied instead of swallowing it', () => {
    // Last line of defence: even if some path did dispatch an edit with no day
    // loaded, the reducer must not silently discard it.
    const state = initScheduleEditorState({ schedules: [], proposals: [] })
    const next = scheduleReducer(state, {
      type: 'addTrack',
      track: { trackTitle: 'Main Stage', trackDescription: '', talks: [] },
    })

    expect(next.ui.error).toBe(NO_SCHEDULE_DAY_ERROR)
    expect(next.ui.error).toMatch(/no dates yet/i)
    expect(next.schedules).toHaveLength(0)
  })
})

describe('/admin/marketing share assets on an unconfigured conference', () => {
  /** Render the page, then switch to the downloadable conference promo tab. */
  async function renderPromoTab() {
    render((await MarketingPage()) as ReactElement)
    fireEvent.click(screen.getByRole('tab', { name: /Conference Promo/i }))
  }

  it('never prints an invented date on a downloadable graphic', async () => {
    await renderPromoTab()

    expect(document.body.textContent).not.toContain('June 15, 2025')
    expect(document.body.textContent).not.toMatch(/2025/)
  })

  it('omits the date line rather than leaving it blank', async () => {
    await renderPromoTab()

    // The promo card's metadata row is a date chip and a location chip sharing
    // one span style. With no start date the card must carry the location chip
    // ALONE — a share graphic with an empty date slot is its own defect.
    const chips = Array.from(
      document.querySelectorAll('span.font-inter.text-lg'),
    )
    expect(chips).toHaveLength(1)
    expect(chips[0].textContent).toBe('Bergen, Norway')
  })
})
