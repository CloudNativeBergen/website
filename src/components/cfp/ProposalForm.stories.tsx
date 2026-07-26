import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import { http, HttpResponse, delay } from 'msw'
import type { Decorator } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import { ProposalForm } from './ProposalForm'
import {
  Audience,
  Format,
  Language,
  Level,
  ProposalInput,
  Status,
} from '@/lib/proposal/types'
import { SpeakerInput, Speaker } from '@/lib/speaker/types'
import { Conference } from '@/lib/conference/types'
import { Topic } from '@/lib/topic/types'
import { ProfileEmail } from '@/lib/profile/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { mockDateBeforeEach } from '@/lib/storybook'

// ProposalForm is THE speaker submission form. Every data need is met at the
// tRPC HTTP boundary via MSW (the global TRPCDecorator uses `httpLink`, so each
// procedure is its own request at `/api/trpc/<proc>`). The only query that
// fires on mount is `speaker.getEmails` (user mode); the mutations below back
// the submit/draft/withdraw flows exercised by the play functions.

const NOW = new Date('2026-09-01T12:00:00Z')

const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
const trpcError = (message = 'The server ran into a problem. Please retry.') =>
  HttpResponse.json(
    {
      error: { message, code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } },
    },
    { status: 500 },
  )

const mockEmails: ProfileEmail[] = [
  {
    email: 'alice@gmail.com',
    primary: true,
    verified: true,
    visibility: 'public',
  },
  {
    email: 'alice.work@company.io',
    primary: false,
    verified: true,
    visibility: 'private',
  },
]

// A GET catch-all so no on-mount query (currently only `speaker.getEmails`)
// hits the network unhandled. Mutations get their own POST handlers per story.
const queryHandlers = [
  http.get('/api/trpc/:proc', ({ params }) => {
    if (params.proc === 'speaker.getEmails') return trpc(mockEmails)
    // Benign null for procs the form incidentally fires — but SAY SO, so a
    // missing mock surfaces in the story logs instead of silently rendering
    // empty (the catch-all must not hide unmocked queries).
    console.warn(
      `[ProposalForm.stories] unmocked tRPC query: ${String(params.proc)}`,
    )
    return trpc(null)
  }),
]

const okMutationHandlers = [
  http.post('/api/trpc/speaker.update', () => trpc({ _id: 'speaker-1' })),
  http.post('/api/trpc/proposal.create', () => trpc({ _id: 'new-proposal-1' })),
  http.post('/api/trpc/proposal.update', () => trpc({ _id: 'proposal-1' })),
  http.post('/api/trpc/proposal.action', () => trpc({ success: true })),
]

const mockTopics: Topic[] = [
  {
    _id: 'topic-1',
    _type: 'topic',
    title: 'Kubernetes',
    color: '#326CE5',
    slug: { current: 'kubernetes' },
  },
  {
    _id: 'topic-2',
    _type: 'topic',
    title: 'Observability',
    color: '#2A9D8F',
    slug: { current: 'observability' },
  },
]

const baseConference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Days Norway',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-12-01',
  endDate: '2026-12-01',
  cfpStartDate: '2026-06-01',
  cfpEndDate: '2026-12-31',
  cfpNotifyDate: '2026-11-15',
  cfpEmail: 'cfp@cloudnativebergen.no',
  sponsorEmail: 'sponsors@cloudnativebergen.no',
  programDate: '2026-11-01',
  contactEmail: 'info@cloudnativebergen.no',
  registrationEnabled: true,
  domains: ['cloudnativedaybergen.no'],
  formats: [
    Format.lightning_10,
    Format.presentation_25,
    Format.presentation_45,
    Format.workshop_120,
  ],
  topics: mockTopics,
  organizers: [],
} as unknown as Conference

// CFP open, event far off → withdrawals still allowed.
const conferenceCfpOpen = baseConference
// Event within the 14-day withdrawal cutoff.
const conferenceWithdrawClosed = {
  ...baseConference,
  startDate: '2026-09-08',
  endDate: '2026-09-08',
} as unknown as Conference

const allowedFormats = [
  Format.lightning_10,
  Format.presentation_25,
  Format.presentation_45,
]

const emptyProposal: ProposalInput = {
  title: '',
  language: Language.norwegian,
  description: [],
  format: Format.lightning_10,
  level: Level.beginner,
  audiences: [],
  outline: '',
  topics: [],
  tos: false,
}

const filledProposal: ProposalInput = {
  title: 'Building Scalable Kubernetes Applications',
  language: Language.english,
  description: convertStringToPortableTextBlocks(
    'This talk explores modern approaches to building and deploying scalable applications on Kubernetes using platform engineering principles.',
  ),
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer, Audience.operator],
  outline:
    '1. Introduction (5 min)\n2. Challenges at Scale (10 min)\n3. Golden Paths (15 min)\n4. Demo (10 min)\n5. Q&A (5 min)',
  topics: [mockTopics[0], mockTopics[1]],
  tos: true,
}

const emptySpeaker: SpeakerInput = { name: '' }

const consentedSpeaker: SpeakerInput = {
  name: 'Alice Johnson',
  title: 'Senior Platform Engineer',
  bio: 'Cloud native advocate with a decade in distributed systems.',
  consent: {
    dataProcessing: { granted: true, grantedAt: '2026-01-01T00:00:00Z' },
    marketing: { granted: false },
    publicProfile: { granted: true, grantedAt: '2026-01-01T00:00:00Z' },
    photography: { granted: true, grantedAt: '2026-01-01T00:00:00Z' },
  },
}

const makeSpeaker = (id: string, name: string, email: string): Speaker =>
  ({
    _id: id,
    _rev: 'rev1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    name,
    email,
    title: 'Engineer at TechCorp',
    slug: name.toLowerCase().replace(/\s+/g, '-'),
  }) as Speaker

const currentUserSpeaker = makeSpeaker(
  'speaker-1',
  'Alice Johnson',
  'alice@gmail.com',
)
const coSpeaker = makeSpeaker('speaker-2', 'Erik Larsen', 'erik@techcorp.no')

// Proposal that already has a primary + co-speaker (edit view).
const proposalWithSpeakers = {
  ...filledProposal,
  speakers: [currentUserSpeaker, coSpeaker],
} as unknown as ProposalInput

/**
 * Wraps the story in an explicit theme so light/dark captures are deterministic
 * (via `parameters.dark`), and mirrors `.dark` onto `<html>` so the withdraw
 * ConfirmationModal — which portals to `document.body` — also themes correctly.
 * A component (not the bare decorator closure) so `useEffect` is rules-of-hooks
 * clean.
 */
function ThemeFrame({
  dark,
  children,
}: {
  dark: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return (
    <div className={dark ? 'dark' : ''}>
      <div className={dark ? 'bg-gray-950 p-4' : 'bg-white p-4'}>
        <div className="mx-auto max-w-3xl">{children}</div>
      </div>
    </div>
  )
}

const withTheme: Decorator = (Story, ctx) => (
  <ThemeFrame dark={!!ctx.parameters.dark}>
    <Story />
  </ThemeFrame>
)

const meta = {
  title: 'Systems/CFP/ProposalForm',
  component: ProposalForm,
  beforeEach: mockDateBeforeEach(NOW),
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: [...queryHandlers, ...okMutationHandlers] },
    docs: {
      description: {
        component:
          'The speaker CFP submission form. Stories cover the create / edit / draft / read-only variants and the validation, server-error, and in-flight submit surfaces. tRPC is mocked at the HTTP boundary via MSW.',
      },
    },
  },
  args: {
    userEmail: 'alice@gmail.com',
    conference: conferenceCfpOpen,
    allowedFormats,
    currentUserSpeaker,
  },
  decorators: [withTheme],
} satisfies Meta<typeof ProposalForm>

export default meta
type Story = StoryObj<typeof meta>

/** New submission: empty proposal + speaker, Save Draft + Submit actions. */
export const NewSubmission: Story = {
  args: {
    initialProposal: emptyProposal,
    initialSpeaker: emptySpeaker,
    mode: 'user',
  },
}

export const NewSubmissionDark: Story = {
  args: NewSubmission.args,
  parameters: { dark: true },
}

/** Editing a submitted proposal: shows the Unsubmit action + a co-speaker. */
export const EditSubmitted: Story = {
  args: {
    initialProposal: proposalWithSpeakers,
    initialSpeaker: consentedSpeaker,
    proposalId: 'proposal-1',
    initialStatus: Status.submitted,
    mode: 'user',
  },
}

export const EditSubmittedDark: Story = {
  args: EditSubmitted.args,
  parameters: { dark: true },
}

/** An existing draft: Delete Draft + Save Draft + Submit are all available. */
export const ExistingDraft: Story = {
  args: {
    initialProposal: filledProposal,
    initialSpeaker: consentedSpeaker,
    proposalId: 'proposal-1',
    initialStatus: Status.draft,
    mode: 'user',
  },
}

/** Accepted proposal outside the cutoff: the Withdraw action is offered. */
export const AcceptedWithdrawable: Story = {
  args: {
    initialProposal: filledProposal,
    initialSpeaker: consentedSpeaker,
    proposalId: 'proposal-1',
    initialStatus: Status.accepted,
    mode: 'user',
  },
}

/** Accepted proposal inside the 14-day cutoff: withdrawal is closed (notice). */
export const WithdrawalClosed: Story = {
  args: {
    initialProposal: filledProposal,
    initialSpeaker: consentedSpeaker,
    proposalId: 'proposal-1',
    initialStatus: Status.accepted,
    conference: conferenceWithdrawClosed,
    mode: 'user',
  },
}

/** Read-only view (e.g. an organizer inspecting): speakers list, no actions. */
export const ReadOnly: Story = {
  args: {
    initialProposal: proposalWithSpeakers,
    initialSpeaker: consentedSpeaker,
    proposalId: 'proposal-1',
    initialStatus: Status.submitted,
    mode: 'readOnly',
  },
}

/** Admin edit: no speaker/co-speaker sections, Update saves the proposal. */
export const AdminEdit: Story = {
  args: {
    initialProposal: filledProposal,
    initialSpeaker: consentedSpeaker,
    proposalId: 'proposal-1',
    initialStatus: Status.submitted,
    mode: 'admin',
  },
}

/**
 * Submitting an empty form surfaces the consent validation error box
 * (missing data-processing + public-profile consents).
 */
export const ValidationError: Story = {
  args: {
    initialProposal: { ...emptyProposal, title: 'My Talk' },
    initialSpeaker: emptySpeaker,
    mode: 'user',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^submit$/i }))
    await canvas.findByText(/Submission failed/i)
    await canvas.findByText(/required consents/i)
  },
}

/**
 * The server rejects the create: the red "Submission failed" box shows the
 * mutation error message.
 */
export const ServerError: Story = {
  args: {
    initialProposal: { ...filledProposal, title: 'Talk That Fails To Save' },
    initialSpeaker: consentedSpeaker,
    mode: 'user',
  },
  parameters: {
    msw: {
      handlers: [
        ...queryHandlers,
        http.post('/api/trpc/speaker.update', () => trpc({ _id: 'speaker-1' })),
        http.post('/api/trpc/proposal.create', () => trpcError()),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^submit$/i }))
    await canvas.findByText(/Submission failed/i)
  },
}

/**
 * In-flight submit: the update never resolves, so the primary button reads
 * "Updating…" and every action is disabled.
 */
export const SubmittingPending: Story = {
  args: {
    initialProposal: filledProposal,
    initialSpeaker: consentedSpeaker,
    proposalId: 'proposal-1',
    initialStatus: Status.submitted,
    mode: 'admin',
  },
  parameters: {
    msw: {
      handlers: [
        ...queryHandlers,
        http.post('/api/trpc/proposal.update', async () => {
          await delay('infinite')
          return trpc({})
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^update$/i }))
    await canvas.findByRole('button', { name: /updating/i })
  },
}
