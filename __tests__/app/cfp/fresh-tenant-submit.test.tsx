/**
 * @vitest-environment node
 *
 * THE POINT OF THE STARTER FORMATS, proven end to end: a conference document
 * built by the REAL `buildOnboardingDocuments` takes a proposal from the submit
 * page to `submitted` with NO format configuration by the organizer at all.
 *
 * Deliberately does NOT mock `@/lib/conference/state`: `__tests__/api/trpc/
 * proposal.test.ts` mocks `hasSubmittableFormats` so it can exercise the gate's
 * two branches in isolation, which means it can never tell you whether a REAL
 * provisioned conference passes it. This file runs the real predicates on the
 * real document — the only arrangement that can catch provisioning and the
 * gates drifting apart.
 *
 * WHAT THE ORGANIZER STILL SUPPLIES, and why it is not seeded:
 *   - the CFP window (`isCfpOpen` is a separate, purely date-based gate);
 *   - at least one TOPIC — strict submit validation requires one
 *     (`ProposalInputSchema.topics.min(1)`) and a topic list is far more
 *     conference-specific than a session length, so provisioning leaves it.
 * Both are activation-checklist rows. Everything else is ready.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-url': 'https://conf/cfp' })),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('unexpected redirect')
  }),
  // The submit form is a client component; server-rendering it still runs
  // `useRouter()` on the way to markup.
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  usePathname: vi.fn(() => '/cfp/proposal'),
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(async () => ({
    speaker: { _id: 'speaker-1', email: 'ada@example.com' },
  })),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('@/lib/events/bus', () => ({
  eventBus: { publish: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn(),
    create: vi.fn(),
    getDocument: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  clientReadUncached: {
    // The reference-injection probe counts client-supplied topic refs as ours;
    // the cross-tenant refusals live in `src/server/routers/tenancy.writes.test.ts`.
    fetch: vi.fn(
      async (_query: string, params: Record<string, unknown> = {}) =>
        ((params.ids as string[] | undefined) ?? []).length,
    ),
  },
}))

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

const getSpeakerMock = vi.fn()
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: (...args: unknown[]) => getSpeakerMock(...args),
}))

vi.mock('@/lib/proposal/data/sanity', () => {
  class ProposalDeletionBlockedError extends Error {}
  return {
    getProposal: vi.fn(),
    getProposals: vi.fn(),
    createProposal: vi.fn(),
    updateProposal: vi.fn(),
    deleteProposal: vi.fn(),
    updateProposalStatus: vi.fn(),
    ProposalDeletionBlockedError,
  }
})

vi.mock('@/lib/proposal/server', () => ({
  updateProposalStatus: vi.fn(),
  getProposalSanity: vi.fn(),
}))

vi.mock('@/lib/messaging/sanity', () => ({
  ensureProposalConversation: vi.fn(),
  addMessage: vi.fn(),
}))
vi.mock('@/lib/messaging/notify', () => ({ notifyNewMessage: vi.fn() }))

import { buildOnboardingDocuments } from '@/lib/onboarding/create'
import { normalizeConference } from '@/lib/conference/normalize'
import type { Conference } from '@/lib/conference/types'
import {
  createAuthenticatedCaller,
  speakers,
  TEST_ORG_ID,
} from '../../helpers/trpc'
import { createProposal, getProposals } from '@/lib/proposal/data/sanity'
import { getProposalSanity, updateProposalStatus } from '@/lib/proposal/server'
import {
  Status,
  Action,
  Language,
  Format,
  Level,
  Audience,
} from '@/lib/proposal/types'
import NewProposalPage from '@/app/(cfp)/cfp/proposal/page'

const regularSpeaker = speakers.find((s) => !s.isOrganizer)!

/** An open window around the frozen clock set in each test. */
const OPEN_CFP = { cfpStartDate: '2026-01-01', cfpEndDate: '2026-12-01' }

/** The organizer's own topics — provisioning seeds none, on purpose. */
const ORGANIZER_TOPICS = [
  { _id: 'topic-1', title: 'Platform engineering', _type: 'topic' },
]

/**
 * The conference a concierge provisioning run really writes, through the real
 * boundary normaliser, with only its CFP dates filled in afterwards. The org id
 * is the test org so the tRPC authz waist resolves the request's tenant.
 */
function freshTenantConference(): Conference {
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
      domains: ['brand-new.konf.run'],
    },
    {
      organizationId: TEST_ORG_ID,
      conferenceId: 'conf-fresh',
      speakerId: 'speaker-fresh',
      mintKey: () => `key-${++key}`,
    },
    null,
  )
  return normalizeConference({
    ...conference,
    ...OPEN_CFP,
    topics: ORGANIZER_TOPICS,
  } as unknown as Conference)
}

async function submitPageTree(): Promise<ReactElement> {
  return (await NewProposalPage({
    searchParams: Promise.resolve({}),
  })) as ReactElement
}

/** Static markup of the page. Only safe when the page short-circuits to an
 * error notice — the real form is a client component with tRPC hooks. */
async function renderSubmitPage(): Promise<string> {
  return renderToStaticMarkup(await submitPageTree())
}

/**
 * The `ProposalForm` element the page decided to render, or null. Found by its
 * `allowedFormats` prop rather than by rendering: the form is a client
 * component whose hooks (`useRouter`, tRPC's `useQuery`) need providers this
 * server-side test has no business standing up. The prop IS the decision under
 * test — it is what scopes the format picker.
 */
function findProposalForm(node: unknown): { allowedFormats?: unknown } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProposalForm(child)
      if (found) return found
    }
    return null
  }
  if (!node || typeof node !== 'object') return null
  const element = node as { props?: Record<string, unknown> }
  if (!element.props) return null
  if ('allowedFormats' in element.props) {
    return element.props as { allowedFormats?: unknown }
  }
  return findProposalForm(element.props.children)
}

const proposalOnAStarterFormat = {
  title: 'Shipping on day one',
  description: [
    { _type: 'block', children: [{ _type: 'span', text: 'A description' }] },
  ],
  language: Language.english,
  // One of the three formats provisioning seeded — nothing else is on offer.
  format: Format.presentation_25,
  level: Level.intermediate,
  audiences: [Audience.developer],
  // The organizer's topic — required by strict validation, never seeded.
  topics: [{ _type: 'reference' as const, _ref: 'topic-1' }],
  tos: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
  getConferenceMock.mockResolvedValue({
    conference: freshTenantConference(),
    domain: 'brand-new.konf.run',
    error: null,
  })
  getSpeakerMock.mockResolvedValue({
    speaker: {
      _id: regularSpeaker._id,
      name: 'Ada',
      email: 'ada@example.com',
    },
    err: null,
  })
  vi.mocked(getProposals).mockResolvedValue({
    proposals: [],
    proposalsError: null,
  })
})

describe('the submit page on a freshly provisioned tenant', () => {
  it('is still held back until the organizer picks topics', async () => {
    // The pre-topics state, from the SAME real builder: the format half is
    // done, the topic half is not, so the page apologises rather than render a
    // form whose required topic field has nothing to choose.
    const withoutTopics = freshTenantConference()
    ;(withoutTopics as unknown as { topics: unknown[] }).topics = []
    getConferenceMock.mockResolvedValue({
      conference: withoutTopics,
      domain: 'brand-new.konf.run',
      error: null,
    })

    const html = await renderSubmitPage()

    expect(html).toContain('Submissions Not Open Yet')
    expect(findProposalForm(await submitPageTree())).toBeNull()
  })

  it('renders the form instead of a "not open yet" apology', async () => {
    const tree = await submitPageTree()

    expect(findProposalForm(tree)).not.toBeNull()
  })

  it('scopes the format picker to exactly the starter formats', async () => {
    const form = findProposalForm(await submitPageTree())

    // Not the whole vocabulary — the picker offers what this conference
    // configured, and provisioning does not sign a new tenant up for workshops.
    expect(form?.allowedFormats).toEqual([
      'lightning_10',
      'presentation_25',
      'presentation_45',
    ])
  })
})

describe('submitting on a freshly provisioned tenant', () => {
  it('accepts a proposal through proposal.create', async () => {
    vi.mocked(createProposal).mockResolvedValue({
      proposal: { _id: 'proposal-1', status: Status.submitted } as never,
      err: null,
    })

    const caller = createAuthenticatedCaller(regularSpeaker._id)
    const result = await caller.proposal.create({
      data: proposalOnAStarterFormat,
      status: Status.submitted,
    })

    expect(result.status).toBe(Status.submitted)
    expect(createProposal).toHaveBeenCalled()
  })

  it('accepts the draft → submitted transition through proposal.action', async () => {
    // The OTHER submit route, carrying the same gate.
    vi.mocked(getProposalSanity).mockResolvedValue({
      proposal: {
        _id: 'proposal-1',
        status: Status.draft,
        speakers: [{ _id: regularSpeaker._id }],
        conference: { _id: 'conf-fresh' },
        ...proposalOnAStarterFormat,
      } as never,
      proposalError: null,
    })
    vi.mocked(updateProposalStatus).mockResolvedValue({
      proposal: { _id: 'proposal-1', status: Status.submitted } as never,
      err: null,
    })

    const caller = createAuthenticatedCaller(regularSpeaker._id)
    const result = await caller.proposal.action({
      id: 'proposal-1',
      action: Action.submit,
    })

    expect(result.proposalStatus).toBe(Status.submitted)
  })

  it('does NOT let the two-step path smuggle a topic-less proposal through', async () => {
    // THE QA PROBE, encoded. Seeding formats removes the accidental shield the
    // formats gate gave fresh tenants, exposing that `action` ran no content
    // validation at all: `create({ status: draft })` accepts anything, and this
    // promoted it. A topics-less fresh tenant is exactly where it showed up.
    vi.mocked(getProposalSanity).mockResolvedValue({
      proposal: {
        _id: 'proposal-1',
        status: Status.draft,
        speakers: [{ _id: regularSpeaker._id }],
        conference: { _id: 'conf-fresh' },
        ...proposalOnAStarterFormat,
        topics: [],
        tos: false,
      } as never,
      proposalError: null,
    })
    vi.mocked(updateProposalStatus).mockClear()

    const caller = createAuthenticatedCaller(regularSpeaker._id)
    await expect(
      caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(updateProposalStatus).not.toHaveBeenCalled()
  })
})
