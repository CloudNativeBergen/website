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
  /** What the conference document stores in `speakerRegistrationLink`. */
  storedLink: undefined as string | undefined,
  getProposals: vi.fn(),
  fetchRedeemedSpeakerEmails: vi.fn(),
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
      conference.speakerRegistrationLink = h.storedLink
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

/**
 * The sweep asks who already HOLDS a ticket, so it does not mail an invitation
 * to someone the status column shows as "Claimed". Default: nobody, so the
 * cases below are about markers unless they say otherwise.
 */
vi.mock('@/lib/tickets/speakerStatus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRedeemedSpeakerEmails: h.fetchRedeemedSpeakerEmails,
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
  h.storedLink = SPEAKER_LINK
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
  h.fetchRedeemedSpeakerEmails.mockResolvedValue(new Set())
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
    expect(res.message).toBe(
      '0 invitations sent, 3 skipped as already handled.',
    )
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

  /**
   * FIX 4. If the ticket-type memo lapses mid-sweep and the re-fetch fails,
   * every remaining proposal comes back `blocked` — 10 sent, 25 never
   * attempted. A green "10 invitations sent." would read as a complete run.
   */
  it('does not report a partially blocked sweep as a success', async () => {
    h.getProposals.mockResolvedValue({
      proposals: [
        { _id: 'p-1', speakers: [{ _id: 's-1', email: 'a@e.com' }] },
        { _id: 'p-2', speakers: [{ _id: 's-2', email: 'b@e.com' }] },
      ],
      proposalsError: null,
    })
    h.handleSpeakerTicket
      .mockResolvedValueOnce({
        sent: 1,
        failed: 0,
        alreadyInvited: 0,
        blocked: false,
      })
      .mockResolvedValueOnce({
        sent: 0,
        failed: 0,
        alreadyInvited: 0,
        blocked: true,
      })

    const res = await makeCaller().admin.sendTicketInvitations()

    expect(res.success).toBe(false)
    expect(res.blocked).toBe(true)
    expect(res.sent).toBe(1)
    expect(res.message).toContain('1 invitation sent')
    expect(res.message).toMatch(/never attempted/i)
  })

  /** A throw mid-sweep must still say how many invitations already went out. */
  it('reports what was already sent when the run dies part-way', async () => {
    h.getProposals.mockResolvedValue({
      proposals: [
        { _id: 'p-1', speakers: [{ _id: 's-1', email: 'a@e.com' }] },
        { _id: 'p-2', speakers: [{ _id: 's-2', email: 'b@e.com' }] },
      ],
      proposalsError: null,
    })
    h.handleSpeakerTicket
      .mockResolvedValueOnce({
        sent: 1,
        failed: 0,
        alreadyInvited: 0,
        blocked: false,
      })
      .mockRejectedValueOnce(new Error('credentials vanished'))

    await expect(makeCaller().admin.sendTicketInvitations()).rejects.toThrow(
      /1 invitation sent/,
    )
  })

  /**
   * A speaker who already HOLDS a speaker-category ticket reads as "Claimed" in
   * the status column, which offers no action — the sweep must not disagree
   * with that and mail them an invitation for a ticket they have. (A ticket
   * issued by hand in the provider leaves no marker here.)
   */
  it('skips a speaker who already holds a ticket, marker or not', async () => {
    h.fetchRedeemedSpeakerEmails.mockResolvedValue(new Set(['ada@example.com']))

    const res = await makeCaller().admin.sendTicketInvitations()

    expect(h.handleSpeakerTicket).not.toHaveBeenCalled()
    expect(res.sent).toBe(0)
    expect(res.alreadyInvited).toBe(1)
  })

  /**
   * The status column joins the display address, the verified `knownEmails`
   * and the marker address. Matching only the display one here would sweep and
   * mail someone who claimed under another of their addresses and whose row
   * already reads "Claimed".
   */
  it('recognises a ticket claimed under a non-display address', async () => {
    h.getProposals.mockResolvedValue({
      proposals: [
        {
          _id: 'p-1',
          speakers: [
            {
              _id: 'speaker-1',
              email: 'ada@work.example',
              knownEmails: ['ada@home.example'],
            },
          ],
        },
      ],
      proposalsError: null,
    })
    h.fetchRedeemedSpeakerEmails.mockResolvedValue(
      new Set(['ada@home.example']),
    )

    const res = await makeCaller().admin.sendTicketInvitations()

    expect(h.handleSpeakerTicket).not.toHaveBeenCalled()
    expect(res.alreadyInvited).toBe(1)
  })

  /** An unreadable provider skips nobody — it must not silently stop a sweep. */
  it('skips nobody when the provider cannot say who has claimed', async () => {
    h.fetchRedeemedSpeakerEmails.mockResolvedValue(null)

    const res = await makeCaller().admin.sendTicketInvitations()

    expect(h.handleSpeakerTicket).toHaveBeenCalledTimes(1)
    expect(res.sent).toBe(1)
  })
})

/**
 * FIX 2. The marker lives on the one talk issuance ran for. A speaker with two
 * confirmed talks reached through the talk that does NOT carry it read as never
 * invited and was mailed again — while the status column, which unions markers
 * across talks, already said "Invited".
 */
describe('the sweep sees markers across all of a speaker talks', () => {
  beforeEach(() => {
    h.getProposals.mockResolvedValue({
      proposals: [
        // Reached first, carries no marker.
        { _id: 'p-1', speakers: [{ _id: 'speaker-1', email: 'ada@e.com' }] },
        // The invitation was actually recorded here.
        {
          _id: 'p-2',
          speakers: [{ _id: 'speaker-1', email: 'ada@e.com' }],
          issuedSpeakerTickets: [
            {
              speakerId: 'speaker-1',
              email: 'ada@e.com',
              emailedAt: '2026-01-01T00:00:00Z',
            },
          ],
        },
      ],
      proposalsError: null,
    })
  })

  it('hands the other talks markers to the proposal being processed', async () => {
    await makeCaller().admin.sendTicketInvitations()

    const [, options] = h.handleSpeakerTicket.mock.calls[0]
    expect(options.knownMarkers).toEqual([
      expect.objectContaining({ speakerId: 'speaker-1', email: 'ada@e.com' }),
    ])
  })

  /**
   * A proposal's own markers reach the handler on the event, so passing them
   * again as `knownMarkers` would double them. Two DIFFERENT speakers here, so
   * both proposals are processed and the `other._id !== proposal._id` filter is
   * the only thing under test — the shared-address dedupe cannot mask it.
   */
  it('hands a proposal only the OTHER talks markers, never its own', async () => {
    h.getProposals.mockResolvedValue({
      proposals: [
        {
          _id: 'p-1',
          speakers: [{ _id: 'speaker-1', email: 'ada@e.com' }],
          issuedSpeakerTickets: [
            { speakerId: 'speaker-1', email: 'ada@e.com', emailedAt: 'x' },
          ],
        },
        {
          _id: 'p-2',
          speakers: [{ _id: 'speaker-2', email: 'grace@e.com' }],
          issuedSpeakerTickets: [
            { speakerId: 'speaker-2', email: 'grace@e.com', emailedAt: 'x' },
          ],
        },
      ],
      proposalsError: null,
    })

    await makeCaller().admin.sendTicketInvitations()

    const byProposal = h.handleSpeakerTicket.mock.calls.map(
      ([event, options]) => [
        event.proposal._id,
        options.knownMarkers.map((m: { speakerId: string }) => m.speakerId),
      ],
    )
    expect(byProposal).toEqual([
      ['p-1', ['speaker-2']],
      ['p-2', ['speaker-1']],
    ])
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
    expect(options).toMatchObject({
      speakerIds: ['speaker-1'],
      resend: true,
    })
  })

  it('refuses a speaker with no confirmed talk at this conference', async () => {
    await expect(
      makeCaller().admin.sendTicketInvitation({ speakerId: 'stranger' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(h.handleSpeakerTicket).not.toHaveBeenCalled()
  })

  /**
   * The per-row action refuses through the same handler guard; the router's job
   * is to report WHY, so the organizer sees the setting to fix rather than
   * "check the ticketing configuration".
   */
  it('names the missing invite link when the row action is refused', async () => {
    h.handleSpeakerTicket.mockResolvedValue({
      sent: 0,
      failed: 0,
      alreadyInvited: 0,
      blocked: true,
      blockedReason: 'no-registration-link',
    })

    await expect(
      makeCaller().admin.sendTicketInvitation({ speakerId: 'speaker-1' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('no speaker invite link'),
    })
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

/**
 * THE PRODUCTION INCIDENT. A sweep of 35 speakers had every invitation accepted
 * by the provider and none of them delivered, while our own email — shipped
 * with no CTA because this conference has no `speakerRegistrationLink` — told
 * each speaker to look for the invitation that never came.
 *
 * The sweep now refuses before ticketing is touched at all. The provider read on
 * this path is `fetchRedeemedSpeakerEmails`, which runs before the first
 * proposal reaches the handler, so asserting it never ran is the proof that no
 * invitation could have been minted.
 */
describe('a conference with no speaker invite link cannot sweep', () => {
  it.each([
    ['unset', undefined],
    ['whitespace only', '   '],
    ['an http:// link', 'http://event.checkin.no/4242?action=invite'],
  ])('refuses the sweep when the link is %s', async (_label, stored) => {
    h.storedLink = stored

    const res = await makeCaller().admin.sendTicketInvitations()

    // ZERO provider contact: nothing read, nothing minted. Asserted FIRST, so
    // this is the assertion that fails if the guard is removed.
    expect(h.fetchRedeemedSpeakerEmails).not.toHaveBeenCalled()
    expect(h.handleSpeakerTicket).not.toHaveBeenCalled()
    expect(res.success).toBe(false)
    expect(res.sent).toBe(0)
    // The refusal names the cause and the fix, not a generic failure.
    expect(res.message).toContain('no speaker invite link')
    expect(res.message).toContain('Settings')
  })

  it('sweeps exactly as before when the link is configured', async () => {
    const res = await makeCaller().admin.sendTicketInvitations()

    expect(res.success).toBe(true)
    expect(res.sent).toBe(1)
    expect(h.fetchRedeemedSpeakerEmails).toHaveBeenCalledTimes(1)
    expect(h.handleSpeakerTicket).toHaveBeenCalledTimes(1)
    expect(res.message).toBe('1 invitation sent.')
  })

  it('tells the preview why, so the modal can name the cause', async () => {
    h.storedLink = undefined

    const res = await makeCaller().admin.ticketInvitationPreview()

    expect(res.blocked).toBe(true)
    expect(res.blockedReason).toBe('no-registration-link')
    expect(res.hasRegistrationLink).toBe(false)
    expect(res.toSend).toBe(0)
    expect(h.fetchRedeemedSpeakerEmails).not.toHaveBeenCalled()
  })

  it('reports the row action as unavailable, without asking the provider', async () => {
    h.storedLink = '   '

    const res = await makeCaller().admin.ticketInvitationConfig()

    expect(res.hasRegistrationLink).toBe(false)
    expect(h.fetchRedeemedSpeakerEmails).not.toHaveBeenCalled()
  })
})
