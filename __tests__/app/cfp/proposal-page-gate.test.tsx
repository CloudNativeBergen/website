/**
 * @vitest-environment node
 *
 * The SUBMIT page's honesty gate. A conference whose CFP window is open but
 * which has configured NO session formats cannot accept a proposal — a proposal
 * must carry a format (`validateProposalForm`) and the form only offers the
 * formats the conference configured. Provisioning creates every new tenant in
 * exactly that state (`@/lib/onboarding/create.ts`), so a speaker following the
 * CFP link must be told that, not handed a form with an empty dropdown.
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

describe('the CFP submit page with no configured formats', () => {
  it('explains that submissions are not open yet instead of rendering the form', async () => {
    getConferenceMock.mockResolvedValue({
      conference: conference(),
      error: null,
    })

    const html = await renderPage()

    expect(html).toContain('Submissions Not Open Yet')
    expect(html).toContain('session formats have not been announced')
    expect(html).toContain('hello@brand-new.example')
    // Not the pre-existing closed-window message — the window IS open.
    expect(html).not.toContain('The Call for Papers is currently closed')
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
