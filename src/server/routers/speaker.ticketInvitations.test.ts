/**
 * @vitest-environment node
 *
 * `speaker.admin.sendTicketInvitations` — the organizer's manual sweep — calls
 * `handleSpeakerTicket` DIRECTLY rather than through the event bus, so the
 * conference object it passes is the handler's ONLY source of the speaker claim
 * link.
 *
 * `speakerRegistrationLink` is redacted out of the conference read unless the
 * caller opts in (see `__tests__/lib/conference/invite-link-redaction.test.ts`).
 * A caller that forgets the flag therefore hands the handler `undefined` and
 * every swept speaker gets the no-link email even though the organizer
 * configured a working one — with no error anywhere, because `undefined` is a
 * legitimate state for that field.
 *
 * The mock below REPRODUCES THE REDACTION rather than returning the link
 * unconditionally: a fake that always returned it would pass whether or not the
 * router asks for it, which is the whole thing this pins.
 */

const SPEAKER_LINK =
  'https://event.checkin.no/4242?action=invite&category=222222&pass=FAKE-SPEAKER-TOKEN'

const h = vi.hoisted(() => ({
  handleSpeakerTicket: vi.fn(),
  getProposals: vi.fn(),
  conferenceReadOptions: [] as Array<Record<string, unknown> | undefined>,
}))

vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConferenceForCurrentDomain: async (
    opts?: Record<string, unknown>,
  ): Promise<unknown> => {
    h.conferenceReadOptions.push(opts)
    const conference: Record<string, unknown> = {
      _id: 'conf-A',
      title: 'Cloud Native Day 2026',
      organization: { _type: 'reference', _ref: 'org-A' },
    }
    // The real read's guard, reproduced: opt in or the field is gone.
    if (opts?.includeSpeakerRegistrationLink) {
      conference.speakerRegistrationLink = SPEAKER_LINK
    }
    return { conference, domain: 'a.test', error: null, status: 'resolved' }
  },
}))

vi.mock('@/lib/events/handlers/speakerTicket', () => ({
  handleSpeakerTicket: h.handleSpeakerTicket,
}))

vi.mock('@/lib/proposal/data/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getProposals: h.getProposals,
}))

/**
 * Ownership is pinned in `tenancy.writes.test.ts` against a real dataset. Here
 * it is stubbed to GRANT, so the NOT_FOUND below can only come from the
 * proposal lookup — otherwise that case would pass on the ownership guard's
 * identical refusal and prove nothing about the lookup.
 */
vi.mock('@/server/tenancy', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireSpeakerInCurrentOrg: vi.fn(async () => 'org-A'),
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { speakerRouter } from './speaker'

function makeCaller() {
  const speaker = {
    _id: 'admin-1',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: ['org-A'],
  }
  return speakerRouter.createCaller({
    session: { speaker, user: { name: 'Admin' } },
    speaker,
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  h.conferenceReadOptions.length = 0
  h.getProposals.mockResolvedValue({
    proposals: [
      {
        _id: 'proposal-1',
        title: 'A great talk',
        speakers: [
          { _id: 'speaker-1', name: 'Ada Lovelace', email: 'ada@example.com' },
        ],
      },
    ],
    proposalsError: null,
  })
  h.handleSpeakerTicket.mockResolvedValue({
    sent: 1,
    failed: 0,
    alreadyInvited: 0,
    blocked: false,
  })
})

describe('speaker.admin.sendTicketInvitations', () => {
  it('hands the handler a conference that still carries the speaker claim link', async () => {
    await makeCaller().admin.sendTicketInvitations()

    expect(h.handleSpeakerTicket).toHaveBeenCalledTimes(1)
    const event = h.handleSpeakerTicket.mock.calls[0][0]
    expect(event.conference.speakerRegistrationLink).toBe(SPEAKER_LINK)
  })

  // The procedure is not the only thing that resolves the conference on this
  // path (the admin middleware does too), so this asserts that ONE of the reads
  // opts in — not that the first one does.
  it('asks the conference read for the link explicitly', async () => {
    await makeCaller().admin.sendTicketInvitations()

    expect(
      h.conferenceReadOptions.some(
        (opts) => opts?.includeSpeakerRegistrationLink === true,
      ),
    ).toBe(true)
  })

  /**
   * The headline number used to be `processedProposals` — talks fed to the
   * handler. A sweep of 36 talks that sent nothing reported "36".
   */
  it('reports invitations sent, not proposals swept', async () => {
    h.getProposals.mockResolvedValue({
      proposals: [
        { _id: 'p-1', speakers: [{ _id: 's-1' }] },
        { _id: 'p-2', speakers: [{ _id: 's-2' }] },
        { _id: 'p-3', speakers: [{ _id: 's-3' }] },
      ],
      proposalsError: null,
    })
    h.handleSpeakerTicket.mockResolvedValue({
      sent: 0,
      failed: 0,
      alreadyInvited: 1,
      blocked: false,
    })

    const res = await makeCaller().admin.sendTicketInvitations()

    expect(res.sent).toBe(0)
    expect(res.alreadyInvited).toBe(3)
    expect(res.sweptProposals).toBe(3)
    expect(res.message).toBe('0 invitations sent, 3 already invited.')
    expect(res.message).not.toContain('3 invitations')
  })

  it('sums failures separately from sends', async () => {
    h.handleSpeakerTicket.mockResolvedValue({
      sent: 2,
      failed: 1,
      alreadyInvited: 0,
      blocked: false,
    })

    const res = await makeCaller().admin.sendTicketInvitations()

    expect(res.message).toBe('2 invitations sent, 1 failed.')
  })

  it('sends for real: no dry run on the mutation path', async () => {
    await makeCaller().admin.sendTicketInvitations()

    expect(h.handleSpeakerTicket.mock.calls[0][1]?.dryRun).toBeFalsy()
  })
})

describe('speaker.admin.ticketInvitationPreview', () => {
  it('counts through the same issuance path, in dry-run mode', async () => {
    h.handleSpeakerTicket.mockResolvedValue({
      sent: 2,
      failed: 0,
      alreadyInvited: 3,
      blocked: false,
    })

    const res = await makeCaller().admin.ticketInvitationPreview()

    expect(h.handleSpeakerTicket).toHaveBeenCalledTimes(1)
    expect(h.handleSpeakerTicket.mock.calls[0][1]).toMatchObject({
      dryRun: true,
    })
    expect(res.toSend).toBe(2)
    expect(res.alreadyInvited).toBe(3)
    expect(res.conferenceTitle).toBe('Cloud Native Day 2026')
  })

  it('reports that the email will carry a claim link when one is configured', async () => {
    const res = await makeCaller().admin.ticketInvitationPreview()

    expect(res.hasRegistrationLink).toBe(true)
    // The link itself must never reach the client.
    expect(JSON.stringify(res)).not.toContain('FAKE-SPEAKER-TOKEN')
  })

  /**
   * "Nobody is waiting" and "we could not work out who is waiting" are the same
   * zero. Reporting the second as the first tells an organizer during an outage
   * that there is nobody left to chase.
   */
  it('surfaces a blocked sweep instead of reporting zero waiting speakers', async () => {
    h.handleSpeakerTicket.mockResolvedValue({
      sent: 0,
      failed: 0,
      alreadyInvited: 0,
      blocked: true,
    })

    const res = await makeCaller().admin.ticketInvitationPreview()

    expect(res.blocked).toBe(true)
    expect(res.toSend).toBe(0)
  })
})

/**
 * A speaker on two confirmed talks used to be invited TWICE — the handler
 * de-duplicates by email within one proposal, and its delivery marker is
 * written on the proposal it ran for, so the second talk saw a clean slate.
 * The sweep now carries the addresses it has covered across proposals.
 */
describe('the sweep invites each person once across the whole programme', () => {
  beforeEach(() => {
    h.getProposals.mockResolvedValue({
      proposals: [
        {
          _id: 'p-1',
          speakers: [
            { _id: 'speaker-1', email: 'ada@example.com' },
            { _id: 'speaker-2', email: 'grace@example.com' },
          ],
        },
        // The same person, a second confirmed talk — and a duplicate speaker
        // document for Ada under a differently-cased address.
        {
          _id: 'p-2',
          speakers: [
            { _id: 'speaker-1', email: 'ada@example.com' },
            { _id: 'speaker-dup', email: 'ADA@example.com' },
            { _id: 'speaker-3', email: 'linus@example.com' },
          ],
        },
      ],
      proposalsError: null,
    })
  })

  it('hands each proposal only the speakers nobody has covered yet', async () => {
    await makeCaller().admin.sendTicketInvitations()

    const perProposal = h.handleSpeakerTicket.mock.calls.map(
      ([event, options]) => [event.proposal._id, options.speakerIds],
    )
    expect(perProposal).toEqual([
      ['p-1', ['speaker-1', 'speaker-2']],
      // Ada is gone from the second talk, under both of her documents.
      ['p-2', ['speaker-3']],
    ])
  })

  it('counts each person once in the preview too', async () => {
    h.handleSpeakerTicket.mockImplementation(
      async (_event: unknown, options: { speakerIds: string[] }) => ({
        sent: options.speakerIds.length,
        failed: 0,
        alreadyInvited: 0,
        blocked: false,
      }),
    )

    const res = await makeCaller().admin.ticketInvitationPreview()

    // Three people, five speaker entries across two talks.
    expect(res.toSend).toBe(3)
  })
})

describe('speaker.admin.sendTicketInvitation (one speaker)', () => {
  beforeEach(() => {
    h.getProposals.mockResolvedValue({
      proposals: [
        { _id: 'p-1', speakers: [{ _id: 'speaker-9' }] },
        { _id: 'p-2', speakers: [{ _id: 'speaker-1' }, { _id: 'speaker-2' }] },
        { _id: 'p-3', speakers: [{ _id: 'speaker-1' }] },
      ],
      proposalsError: null,
    })
  })

  it('issues through the shared handler, scoped to that speaker, allowing a re-send', async () => {
    await makeCaller().admin.sendTicketInvitation({ speakerId: 'speaker-1' })

    // One invitation per person, not per talk: speaker-1 is on two proposals.
    expect(h.handleSpeakerTicket).toHaveBeenCalledTimes(1)
    const [event, options] = h.handleSpeakerTicket.mock.calls[0]
    expect(event.proposal._id).toBe('p-2')
    expect(options).toEqual({ speakerIds: ['speaker-1'], resend: true })
  })

  it('refuses a speaker with no confirmed talk at this conference', async () => {
    await expect(
      makeCaller().admin.sendTicketInvitation({ speakerId: 'stranger' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(h.handleSpeakerTicket).not.toHaveBeenCalled()
  })

  it('fails loudly when nothing was actually sent', async () => {
    h.handleSpeakerTicket.mockResolvedValue({
      sent: 0,
      failed: 1,
      alreadyInvited: 0,
      blocked: false,
    })

    await expect(
      makeCaller().admin.sendTicketInvitation({ speakerId: 'speaker-1' }),
    ).rejects.toThrow(/failed/i)
  })
})
