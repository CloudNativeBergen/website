import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn, userEvent, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ProposalCoSpeaker } from './ProposalCoSpeaker'
import { Format } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'

const FIXED_NOW = new Date('2026-05-12T09:00:00Z')

const speaker = (id: string, name: string, email: string, title?: string) =>
  ({
    _id: id,
    _rev: 'rev1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    name,
    email,
    title,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
  }) as Speaker

const alice = speaker(
  'sp-1',
  'Alice Johnson',
  'alice@example.com',
  'Platform Engineer',
)
const erik = speaker('sp-2', 'Erik Larsen', 'erik@example.com', 'SRE at Acme')
const kari = speaker('sp-3', 'Kari Moen', 'kari@example.com')

const invitation = (
  over: Partial<CoSpeakerInvitationMinimal> &
    Pick<CoSpeakerInvitationMinimal, '_id' | 'invitedEmail' | 'status'>,
): CoSpeakerInvitationMinimal => ({
  invitedName: undefined,
  expiresAt: '2026-05-21T09:00:00Z',
  ...over,
})

const pending = invitation({
  _id: 'inv-pending',
  invitedEmail: 'sofia@example.com',
  invitedName: 'Sofia Berg',
  status: 'pending',
})

// Sanity still stores "pending" for this one — nobody clicked a dead link —
// but the read paths map `effectiveInvitationStatus`, so it arrives as expired.
const lapsed = invitation({
  _id: 'inv-expired',
  invitedEmail: 'bjorn@example.com',
  invitedName: 'Bjørn Hansen',
  status: 'expired',
  expiresAt: '2026-05-04T09:00:00Z',
})

/** Reminded three hours ago: inside the 24h cooldown. */
const remindedRecently = invitation({
  _id: 'inv-reminded',
  invitedEmail: 'sofia@example.com',
  invitedName: 'Sofia Berg',
  status: 'pending',
  lastRemindedAt: '2026-05-12T06:00:00Z',
})

const declined = invitation({
  _id: 'inv-declined',
  invitedEmail: 'magnus@example.com',
  invitedName: 'Magnus Olsen',
  status: 'declined',
  expiresAt: '2026-05-02T09:00:00Z',
  declineReason: 'Schedule conflict',
})

// Not rendered: an accepted invitee is already a speaker row, and a canceled
// invitation has no ongoing meaning.
const noise = [
  invitation({
    _id: 'inv-accepted',
    invitedEmail: 'erik@example.com',
    status: 'accepted',
  }),
  invitation({
    _id: 'inv-canceled',
    invitedEmail: 'gone@example.com',
    status: 'canceled',
  }),
]

const handlers = [
  http.get('/api/trpc/speaker.admin.list', () =>
    HttpResponse.json({
      result: {
        data: [
          {
            _id: 'sp-9',
            name: 'Ingrid Nilsen',
            email: 'ingrid@example.com',
            title: 'Staff Engineer',
            image: null,
            slug: 'ingrid-nilsen',
          },
        ],
      },
    }),
  ),
  http.post('/api/trpc/proposal.invitation.send', () =>
    HttpResponse.json({
      result: {
        data: {
          _id: 'inv-new',
          invitedEmail: 'new@example.com',
          invitedName: 'New Speaker',
          status: 'pending',
          expiresAt: '2026-05-26T09:00:00Z',
        },
      },
    }),
  ),
  http.post('/api/trpc/proposal.invitation.cancel', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
  http.post('/api/trpc/proposal.invitation.remind', () =>
    HttpResponse.json({
      result: { data: { success: true, expiresAt: '2026-05-21T09:00:00Z' } },
    }),
  ),
  http.post('/api/trpc/proposal.invitation.resend', () =>
    HttpResponse.json({
      result: { data: { success: true, expiresAt: '2026-05-26T09:00:00Z' } },
    }),
  ),
]

/** What `resend` returns when the seat was filled while the invitation lapsed. */
const resendRefused = http.post('/api/trpc/proposal.invitation.resend', () =>
  HttpResponse.json(
    {
      error: {
        message:
          'This person is already a speaker on this proposal and does not need an invitation.',
        code: -32600,
        data: {
          code: 'BAD_REQUEST',
          httpStatus: 400,
          path: 'proposal.invitation.resend',
        },
      },
    },
    { status: 400 },
  ),
)

const common = {
  format: Format.presentation_40,
  proposalId: 'proposal-1',
  onSpeakersChange: fn(),
  onRemoveSpeaker: fn(),
  onInvitationSent: fn(),
  onInvitationCanceled: fn(),
  onSpeakerCreated: fn(),
}

const adminOnly = {
  allowPickExisting: true,
  allowDirectProfileCreation: true,
  enforceFormatLimit: false,
}

const meta: Meta<typeof ProposalCoSpeaker> = {
  title: 'Systems/Proposals/ProposalCoSpeaker',
  component: ProposalCoSpeaker,
  tags: ['autodocs'],
  // Pin the clock: pills read "9 days left" and "Expired 4. mai 2026" off
  // `new Date()`, so an unpinned clock would thrash visual diffs.
  beforeEach: () => {
    const OriginalDate = globalThis.Date
    const fixedTime = FIXED_NOW.getTime()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(fixedTime)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => fixedTime
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate

    return () => {
      globalThis.Date = OriginalDate
    }
  },
  parameters: {
    msw: { handlers },
    docs: {
      description: {
        component:
          'The Speakers list on a proposal: the primary first and marked, confirmed co-speakers, and open invitations as rows in the same list with a computed status pill. One "Add speaker" action opens a panel that searches existing speakers first (organizers), falls back to inviting by email, and — for organizers only — to creating the profile directly.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalCoSpeaker>

/** A CFP submitter who has not invited anyone yet. */
export const SpeakerEmpty: Story = {
  args: { ...common, speakers: [alice], currentUserSpeakerId: alice._id },
}

export const SpeakerOnePending: Story = {
  args: {
    ...common,
    speakers: [alice],
    currentUserSpeakerId: alice._id,
    invitations: [pending, ...noise],
  },
}

/** At the format limit: the Add button is replaced by one sentence. */
export const SpeakerAllConfirmed: Story = {
  args: {
    ...common,
    speakers: [alice, erik, kari],
    currentUserSpeakerId: alice._id,
    invitations: noise,
  },
}

/** The production failure: a confirmed talk one accepted speaker short. */
export const SpeakerExpired: Story = {
  args: {
    ...common,
    speakers: [alice],
    currentUserSpeakerId: alice._id,
    invitations: [lapsed],
  },
}

export const SpeakerDeclined: Story = {
  args: {
    ...common,
    speakers: [alice],
    currentUserSpeakerId: alice._id,
    invitations: [declined],
  },
}

/** A speaker's Add panel opens straight into the invite step. */
export const SpeakerAddPanel: Story = {
  args: { ...common, speakers: [alice], currentUserSpeakerId: alice._id },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add speaker' }))
  },
}

/**
 * A proposal that does not exist yet: existing speakers can be picked (they
 * are saved with the proposal), but there is nothing to hang an invitation or
 * a new profile on, so those steps are replaced by one sentence.
 */
export const AdminEmpty: Story = {
  args: { ...common, ...adminOnly, speakers: [], proposalId: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add speaker' }))
  },
}

export const AdminExpired: Story = {
  args: { ...common, ...adminOnly, speakers: [alice], invitations: [lapsed] },
}

export const AdminMixed: Story = {
  args: {
    ...common,
    ...adminOnly,
    speakers: [alice, erik],
    invitations: [pending, lapsed, declined, ...noise],
  },
}

export const AdminAllConfirmed: Story = {
  args: {
    ...common,
    ...adminOnly,
    speakers: [alice, erik, kari],
    invitations: noise,
  },
}

/** Organizers may exceed the format limit; the notice says by how much. */
export const AdminOverLimit: Story = {
  args: {
    ...common,
    ...adminOnly,
    format: Format.presentation_20,
    speakers: [alice, erik, kari],
  },
}

/** Inside the 24h cooldown: Remind is replaced by when it can be sent again. */
export const AdminRemindCooldown: Story = {
  args: {
    ...common,
    ...adminOnly,
    speakers: [alice],
    invitations: [remindedRecently],
  },
}

/** Resend refused: the seat was filled while the invitation sat lapsed. */
export const AdminResendRefused: Story = {
  args: { ...common, ...adminOnly, speakers: [alice], invitations: [lapsed] },
  // First match wins in msw, so the refusal must precede the base handlers.
  parameters: { msw: { handlers: [resendRefused, ...handlers] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Resend the invitation to bjorn@example.com',
      }),
    )
    await canvas.findByRole('alert')
  },
}

/** Search found nothing, so the invite step appears with the address carried over. */
export const AdminAddPanelNoMatch: Story = {
  args: { ...common, ...adminOnly, speakers: [alice] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add speaker' }))
    await userEvent.type(
      canvas.getByLabelText('Search by name or email'),
      'bjorn@example.com',
    )
  },
}
