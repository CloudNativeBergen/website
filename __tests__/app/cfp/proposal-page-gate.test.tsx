/**
 * @vitest-environment node
 *
 * The SUBMIT page's honesty gate. A conference whose CFP window is open but
 * which is missing a piece a proposal cannot be submitted without cannot accept
 * one: strict validation requires BOTH a format and a topic
 * (`validateProposalForm`), and each picker is populated purely from the
 * conference's own list. A speaker following the CFP link must be told that,
 * not handed a form with an empty dropdown over a required field.
 *
 * A freshly provisioned tenant has the starter formats but no topics
 * (`@/lib/onboarding/create.ts`), so it lands in the second case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const getConferenceMock = vi.fn()
const getSpeakerMock = vi.fn()
const getProposalsMock = vi.fn()

vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-url': 'https://conf/cfp' })),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect')
  }),
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(async () => ({
    speaker: { _id: 'speaker-1', email: 'ada@example.com' },
  })),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: (...args: unknown[]) => getSpeakerMock(...args),
}))
vi.mock('@/lib/proposal/data/sanity', () => ({
  getProposals: (...args: unknown[]) => getProposalsMock(...args),
}))

import NewProposalPage from '@/app/(cfp)/cfp/proposal/page'

/** An open window around the frozen clock set in each test. */
const OPEN_CFP = { cfpStartDate: '2026-01-01', cfpEndDate: '2026-12-01' }

function conference(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'conf-1',
    title: 'Brand New Conf',
    contactEmail: 'hello@brand-new.example',
    // The provisioned shape: normalised to `[]` by the conference boundary.
    formats: [],
    topics: [],
    ...OPEN_CFP,
    ...overrides,
  }
}

async function renderPage(): Promise<string> {
  const element = (await NewProposalPage({
    searchParams: Promise.resolve({}),
  })) as ReactElement
  return renderToStaticMarkup(element)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
  getSpeakerMock.mockResolvedValue({
    speaker: { _id: 'speaker-1', name: 'Ada', email: 'ada@example.com' },
    err: null,
  })
  getProposalsMock.mockResolvedValue({ proposals: [], proposalsError: null })
})

describe('the CFP submit page with an incomplete configuration', () => {
  it('explains that submissions are not open yet instead of rendering the form', async () => {
    getConferenceMock.mockResolvedValue({
      conference: conference(),
      error: null,
    })

    const html = await renderPage()

    expect(html).toContain('Submissions Not Open Yet')
    expect(html).toContain('still setting up the Call for Papers')
    expect(html).toContain('hello@brand-new.example')
    // Not the pre-existing closed-window message — the window IS open.
    expect(html).not.toContain('The Call for Papers is currently closed')
  })

  it('refuses a freshly provisioned tenant: formats yes, topics no', async () => {
    // The remaining day-one blocker. Starter formats fill the format picker,
    // but the topic picker would still be empty over a required field.
    getConferenceMock.mockResolvedValue({
      conference: conference({
        formats: ['lightning_10', 'presentation_25', 'presentation_45'],
        topics: [],
      }),
      error: null,
    })

    const html = await renderPage()

    expect(html).toContain('Submissions Not Open Yet')
  })

  it('refuses topics-but-no-formats too', async () => {
    getConferenceMock.mockResolvedValue({
      conference: conference({
        formats: [],
        topics: [{ _id: 'topic-1', title: 'Platform engineering' }],
      }),
      error: null,
    })

    const html = await renderPage()

    expect(html).toContain('Submissions Not Open Yet')
  })

  it('still reports a genuinely closed CFP as closed', async () => {
    getConferenceMock.mockResolvedValue({
      conference: conference({
        cfpStartDate: '2025-01-01',
        cfpEndDate: '2025-02-01',
        formats: ['lightning_10'],
      }),
      error: null,
    })

    const html = await renderPage()

    expect(html).toContain('CFP Closed')
    expect(html).not.toContain('Submissions Not Open Yet')
  })
})
