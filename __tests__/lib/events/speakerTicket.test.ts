/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSpeakerTicket } from '@/lib/events/handlers/speakerTicket'
import { Action, Status } from '@/lib/proposal/types'
import type { ProposalStatusChangeEvent } from '@/lib/events/types'
import type { Speaker } from '@/lib/speaker/types'
import type {
  PublicTicketType,
  ResolvedTicketing,
} from '@/lib/tickets/provider'
import { createMockConference } from '../../testdata/conference'

vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingProvider: vi.fn(),
}))

vi.mock('@/lib/speaker/ticket-email', () => ({
  sendSpeakerTicketEmail: vi.fn(),
}))

vi.mock('@/lib/proposal/data/sanity', () => ({
  recordSpeakerTicketEmailed: vi.fn(),
}))

import { resolveTicketingProvider } from '@/lib/tickets/provider'
import { sendSpeakerTicketEmail } from '@/lib/speaker/ticket-email'
import { recordSpeakerTicketEmailed } from '@/lib/proposal/data/sanity'

const mockedResolveProvider = vi.mocked(resolveTicketingProvider)
const mockedSendEmail = vi.mocked(sendSpeakerTicketEmail)
const mockedRecordEmailed = vi.mocked(recordSpeakerTicketEmailed)

const SPEAKER_TICKET_ID = 777

/**
 * The organizer-pasted Checkin "Send invitations" link for the speaker ticket
 * category. It cannot be produced by the API (asking for one makes Checkin send
 * its own invitation), so it is stored on the conference document.
 */
const SPEAKER_INVITE_LINK =
  'https://event.checkin.no/4242?action=invite&category=222222&pass=FAKE-SPEAKER-TOKEN'

/** The invitation-gated speaker ticket the handler looks for. */
function makeTicket(
  overrides: Partial<PublicTicketType> = {},
): PublicTicketType {
  return {
    id: SPEAKER_TICKET_ID,
    name: 'Speaker Ticket',
    type: 'ticket',
    description: null,
    price: [],
    available: null,
    requiresInvitation: true,
    visibleStartsAt: null,
    visibleEndsAt: null,
    position: 1,
    ...overrides,
  }
}

const mockProvider = {
  name: 'Checkin.no',
  isConfigured: vi.fn(() => true),
  fetchPublicTicketTypes: vi.fn(),
  sendTicketInvitation: vi.fn(),
}

function resolvedCheckin(): ResolvedTicketing {
  return {
    configured: true,
    // Only the members the handler touches are mocked.
    provider: mockProvider as never,
    eventRef: { customerId: 99, eventId: 4242 },
  }
}

function makeSpeaker(overrides: Partial<Speaker> = {}): Speaker {
  return {
    _id: 'speaker-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    ...overrides,
  } as Speaker
}

function makeEvent(
  overrides: Partial<ProposalStatusChangeEvent> = {},
  speakers: Speaker[] = [makeSpeaker()],
): ProposalStatusChangeEvent {
  return {
    eventType: 'proposal.status.changed',
    timestamp: new Date(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    proposal: { _id: 'proposal-1', title: 'A great talk' } as any,
    previousStatus: Status.accepted,
    newStatus: Status.confirmed,
    action: Action.confirm,
    conference: createMockConference({
      checkinCustomerId: 99,
      checkinEventId: 4242,
      speakerRegistrationLink: SPEAKER_INVITE_LINK,
    }),
    speakers,
    metadata: {
      triggeredBy: { speakerId: 'speaker-1', isOrganizer: false },
      shouldNotify: true,
      domain: '2026.cloudnativedays.no',
    },
    ...overrides,
  }
}

/** Proposal carrying delivery markers for speakers already served. */
function proposalWithMarkers(
  markers: Array<{ speakerId: string; email: string }>,
): Partial<ProposalStatusChangeEvent> {
  return {
    proposal: {
      _id: 'proposal-1',
      title: 'A great talk',
      issuedSpeakerTickets: markers.map((m) => ({
        ...m,
        emailedAt: '2026-01-01T00:00:00Z',
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedResolveProvider.mockResolvedValue(resolvedCheckin())
  mockProvider.isConfigured.mockReturnValue(true)
  mockProvider.fetchPublicTicketTypes.mockResolvedValue({
    event: { id: 4242, name: 'Cloud Native Day 2026' },
    tickets: [
      makeTicket({ id: 1, name: 'Regular', requiresInvitation: false }),
      makeTicket(),
    ],
  })
  mockProvider.sendTicketInvitation.mockResolvedValue(undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedSendEmail.mockResolvedValue({} as any)
  mockedRecordEmailed.mockResolvedValue(undefined)
})

describe('handleSpeakerTicket', () => {
  it('asks the provider to invite the speaker, then emails them the heads-up and records the marker', async () => {
    const speaker = makeSpeaker()
    await handleSpeakerTicket(makeEvent({}, [speaker]))

    // The claim link is delivered by the provider, not by us.
    expect(mockProvider.sendTicketInvitation).toHaveBeenCalledTimes(1)
    expect(mockProvider.sendTicketInvitation).toHaveBeenCalledWith(
      SPEAKER_TICKET_ID,
      [speaker.email],
      expect.stringContaining('Cloud Native Day 2026'),
    )

    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        speaker: { name: speaker.name, email: speaker.email },
        // Exactly the configured invite link — never a computed store URL.
        registrationUrl: SPEAKER_INVITE_LINK,
        eventUrl: 'https://2026.cloudnativedays.no',
      }),
    )
    // No redeemable credential is passed to the email any more.
    expect(mockedSendEmail.mock.calls[0][0]).not.toHaveProperty('discountCode')

    // Delivery marker is written only after a successful send.
    expect(mockedRecordEmailed).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).toHaveBeenCalledWith('proposal-1', {
      speakerId: speaker._id,
      email: 'ada@example.com',
    })
  })

  /**
   * With no link configured the provider invitation is still the real delivery,
   * so both paths must keep running — but our email must not carry a link at
   * all. The old code substituted `https://event.checkin.no/<eventId>?ticket=`,
   * a store deep link with no invitation code, which granted nothing against an
   * invitation-gated ticket type while looking more official than the working
   * Checkin mail.
   */
  it('still sends both, with NO registrationUrl, when the conference has no invite link configured', async () => {
    const event = makeEvent({
      conference: createMockConference({
        checkinCustomerId: 99,
        checkinEventId: 4242,
      }),
    })

    await handleSpeakerTicket(event)

    expect(mockProvider.sendTicketInvitation).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).toHaveBeenCalledTimes(1)

    const params = mockedSendEmail.mock.calls[0][0]
    expect(params.registrationUrl).toBeUndefined()
    // Nothing reconstructs the store deep link from the resolved ticket id.
    expect(JSON.stringify(params)).not.toContain('event.checkin.no')
    expect(JSON.stringify(params)).not.toContain('?ticket=')
  })

  /**
   * tRPC is not the only writer of `speakerRegistrationLink`: the Sanity field
   * is a bare `type: 'string'` and scripts, migrations and imports patch the
   * document directly. A stored `"  "` or `http://…` reaching the template
   * would render `<a href="  ">Claim Your Speaker Ticket</a>` — the exact dead
   * CTA this change removes, arriving through a different door. So the handler
   * re-applies the rule at the point of use and degrades to the no-link email.
   */
  it.each([
    ['whitespace only', '   '],
    ['an empty string', ''],
    ['an http:// link', 'http://event.checkin.no/4242?action=invite&pass=X'],
    ['a relative path', '/tickets'],
    // eslint-disable-next-line no-script-url
    ['a javascript: URL', 'javascript:alert(1)'],
  ])(
    'treats %s as no link and still sends the no-CTA email',
    async (_label, stored) => {
      const event = makeEvent({
        conference: createMockConference({
          checkinCustomerId: 99,
          checkinEventId: 4242,
          speakerRegistrationLink: stored,
        }),
      })

      await handleSpeakerTicket(event)

      expect(mockProvider.sendTicketInvitation).toHaveBeenCalledTimes(1)
      expect(mockedSendEmail).toHaveBeenCalledTimes(1)
      expect(mockedSendEmail.mock.calls[0][0].registrationUrl).toBeUndefined()
      expect(mockedRecordEmailed).toHaveBeenCalledTimes(1)
    },
  )

  it('warns, naming the conference, when a configured link is rejected', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await handleSpeakerTicket(
      makeEvent({
        conference: createMockConference({
          checkinCustomerId: 99,
          checkinEventId: 4242,
          speakerRegistrationLink: 'http://event.checkin.no/4242',
        }),
      }),
    )

    // Silently dropping a pasted link would be its own trap: the operator
    // needs to be able to find out why their link never appears.
    const messages = warn.mock.calls.map((c) => String(c[0]))
    expect(
      messages.some(
        (m) =>
          m.includes('not an absolute https URL') &&
          m.includes('Cloud Native Day 2026'),
      ),
    ).toBe(true)
  })

  it('accepts an uppercase HTTPS:// scheme, which URL normalizes', async () => {
    await handleSpeakerTicket(
      makeEvent({
        conference: createMockConference({
          checkinCustomerId: 99,
          checkinEventId: 4242,
          speakerRegistrationLink: '  HTTPS://event.checkin.no/4242?pass=X  ',
        }),
      }),
    )

    // Trimmed, not reformatted — the stored value is what the speaker clicks.
    expect(mockedSendEmail.mock.calls[0][0].registrationUrl).toBe(
      'HTTPS://event.checkin.no/4242?pass=X',
    )
  })

  it('picks the invitation-gated speaker ticket over other invitation tickets', async () => {
    mockProvider.fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 4242, name: 'Cloud Native Day 2026' },
      tickets: [
        makeTicket({ id: 10, name: 'Sponsor Ticket' }),
        makeTicket({ id: 11, name: 'Speaker Ticket' }),
        makeTicket({
          id: 12,
          name: 'Speaker Ticket (public)',
          requiresInvitation: false,
        }),
      ],
    })

    await handleSpeakerTicket(makeEvent())

    expect(mockProvider.sendTicketInvitation).toHaveBeenCalledWith(
      11,
      ['ada@example.com'],
      expect.any(String),
    )
  })

  it('never logs the recipient email on the success path', async () => {
    const speaker = makeSpeaker()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      await handleSpeakerTicket(makeEvent({}, [speaker]))

      const logged = logSpy.mock.calls.map((call) => call.join(' ')).join('\n')
      // The success line references the speaker by id only.
      expect(logged).toContain(speaker._id)
      expect(logged).not.toContain(speaker.email)
    } finally {
      logSpy.mockRestore()
    }
  })

  it('invites each distinct speaker email on the proposal', async () => {
    const speakers = [
      makeSpeaker({ _id: 'speaker-1', email: 'a@example.com' }),
      makeSpeaker({ _id: 'speaker-2', email: 'b@example.com' }),
    ]

    await handleSpeakerTicket(makeEvent({}, speakers))

    expect(mockProvider.sendTicketInvitation).toHaveBeenCalledTimes(2)
    expect(mockedSendEmail).toHaveBeenCalledTimes(2)
    // The ticket list is fetched once for the whole proposal, not per speaker.
    expect(mockProvider.fetchPublicTicketTypes).toHaveBeenCalledTimes(1)
  })

  it('de-duplicates by email: duplicate speaker docs sharing an address get one invitation and one email', async () => {
    const speakers = [
      makeSpeaker({ _id: 'speaker-1', email: 'ada@example.com' }),
      makeSpeaker({ _id: 'speaker-1-dup', email: 'Ada@Example.com' }),
      makeSpeaker({ _id: 'speaker-1-again', email: ' ada@example.com ' }),
    ]

    await handleSpeakerTicket(makeEvent({}, speakers))

    expect(mockProvider.sendTicketInvitation).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).toHaveBeenCalledTimes(1)
  })

  it('skips a speaker with no email', async () => {
    await handleSpeakerTicket(
      makeEvent({}, [makeSpeaker({ email: undefined })]),
    )

    expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('is idempotent: skips entirely when the speaker was already served', async () => {
    const speaker = makeSpeaker()

    await handleSpeakerTicket(
      makeEvent(
        proposalWithMarkers([
          { speakerId: speaker._id, email: 'ada@example.com' },
        ]),
        [speaker],
      ),
    )

    expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
    expect(mockedRecordEmailed).not.toHaveBeenCalled()
  })

  it('skips a duplicate speaker doc whose email already has a delivery marker under another id', async () => {
    const dupDoc = makeSpeaker({ _id: 'speaker-1-dup' })

    await handleSpeakerTicket(
      makeEvent(
        proposalWithMarkers([
          { speakerId: 'speaker-1', email: 'ada@example.com' },
        ]),
        [dupDoc],
      ),
    )

    expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('does not email the speaker (or mark them done) when the provider invitation fails', async () => {
    mockProvider.sendTicketInvitation.mockRejectedValue(
      new Error('checkin reported success=false'),
    )

    await expect(handleSpeakerTicket(makeEvent())).resolves.toEqual({
      sent: 0,
      failed: 1,
      alreadyInvited: 0,
      blocked: false,
    })

    // Our email promises "an invitation is on its way" — never send it when
    // no invitation went out.
    expect(mockedSendEmail).not.toHaveBeenCalled()
    expect(mockedRecordEmailed).not.toHaveBeenCalled()
  })

  it('keeps going for the remaining speakers when one invitation fails', async () => {
    mockProvider.sendTicketInvitation
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce(undefined)

    await handleSpeakerTicket(
      makeEvent({}, [
        makeSpeaker({ _id: 'speaker-1', email: 'a@example.com' }),
        makeSpeaker({ _id: 'speaker-2', email: 'b@example.com' }),
      ]),
    )

    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).toHaveBeenCalledWith('proposal-1', {
      speakerId: 'speaker-2',
      email: 'b@example.com',
    })
  })

  it('does not record a delivery marker and stays recoverable when the heads-up email fails', async () => {
    mockedSendEmail.mockRejectedValue(new Error('resend down'))

    await expect(handleSpeakerTicket(makeEvent())).resolves.toEqual({
      sent: 0,
      failed: 1,
      alreadyInvited: 0,
      blocked: false,
    })

    // The invitation went out, but because our email failed we must NOT mark
    // the speaker as done — a re-trigger has to be able to resend.
    expect(mockProvider.sendTicketInvitation).toHaveBeenCalledTimes(1)
    expect(mockedRecordEmailed).not.toHaveBeenCalled()
  })

  it('still succeeds (invitation + email delivered) even if recording the marker fails', async () => {
    mockedRecordEmailed.mockRejectedValue(new Error('sanity write failed'))

    // Counted as sent: the speaker really has their invitation, even though
    // the marker write failed.
    await expect(handleSpeakerTicket(makeEvent())).resolves.toEqual({
      sent: 1,
      failed: 0,
      alreadyInvited: 0,
      blocked: false,
    })

    expect(mockProvider.sendTicketInvitation).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
  })

  it('aborts without emailing when no invitation-gated speaker ticket exists', async () => {
    mockProvider.fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 4242, name: 'Cloud Native Day 2026' },
      tickets: [makeTicket({ name: 'Regular Ticket' })],
    })

    // `blocked`, not a plain zero: issuance cannot run for this conference at
    // all, and the preview must not report that as "nobody is waiting".
    await expect(handleSpeakerTicket(makeEvent())).resolves.toEqual({
      sent: 0,
      failed: 0,
      alreadyInvited: 0,
      blocked: true,
    })

    expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('aborts when the speaker ticket exists but does not require an invitation', async () => {
    mockProvider.fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 4242, name: 'Cloud Native Day 2026' },
      tickets: [makeTicket({ requiresInvitation: false })],
    })

    await handleSpeakerTicket(makeEvent())

    expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('aborts without emailing when the ticket-type lookup fails', async () => {
    mockProvider.fetchPublicTicketTypes.mockRejectedValue(
      new Error('lookup failed'),
    )

    // `blocked`, not a plain zero: issuance cannot run for this conference at
    // all, and the preview must not report that as "nobody is waiting".
    await expect(handleSpeakerTicket(makeEvent())).resolves.toEqual({
      sent: 0,
      failed: 0,
      alreadyInvited: 0,
      blocked: true,
    })

    expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('sends nothing when the provider cannot send ticket invitations', async () => {
    // A provider without `sendTicketInvitation` cannot deliver the claim link,
    // so the speaker must not get an email telling them to look for one.
    mockedResolveProvider.mockResolvedValue({
      configured: true,
      provider: {
        name: 'Checkin.no',
        isConfigured: mockProvider.isConfigured,
        fetchPublicTicketTypes: mockProvider.fetchPublicTicketTypes,
      } as never,
      eventRef: { customerId: 99, eventId: 4242 },
    })

    await handleSpeakerTicket(makeEvent())

    expect(mockedSendEmail).not.toHaveBeenCalled()
    expect(mockProvider.fetchPublicTicketTypes).not.toHaveBeenCalled()
    expect(mockedRecordEmailed).not.toHaveBeenCalled()
  })

  it('no-ops when the conference has no ticketing binding', async () => {
    mockedResolveProvider.mockResolvedValue({
      configured: false,
      provider: null,
      eventRef: null,
    })

    await handleSpeakerTicket(makeEvent())

    expect(mockProvider.fetchPublicTicketTypes).not.toHaveBeenCalled()
    expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('no-ops (no lookups) when the provider has no API credentials', async () => {
    mockProvider.isConfigured.mockReturnValue(false)

    await handleSpeakerTicket(makeEvent())

    expect(mockProvider.fetchPublicTicketTypes).not.toHaveBeenCalled()
    expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('no-ops for a provider without an invitation surface (Tito)', async () => {
    mockedResolveProvider.mockResolvedValue({
      configured: true,
      provider: { ...mockProvider, name: 'Tito' } as never,
      eventRef: { provider: 'tito', accountSlug: 'acct', eventSlug: 'evt' },
    })

    await handleSpeakerTicket(makeEvent())

    expect(mockProvider.fetchPublicTicketTypes).not.toHaveBeenCalled()
    expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  /**
   * THE PREVIEW AND THE SEND MUST AGREE.
   *
   * The confirmation an organizer sees before the bulk sweep is this same
   * function with `dryRun`, so these cases drive BOTH modes against ONE fixture
   * and assert the counts are identical. A preview computed some other way
   * would be free to disagree with the handler's dedupe and guards — and a
   * number you cannot trust is worse than no number.
   */
  describe('dry run', () => {
    const cases: Array<{
      name: string
      speakers: Speaker[]
      overrides: Partial<ProposalStatusChangeEvent>
      expected: { sent: number; alreadyInvited: number }
    }> = [
      {
        name: 'nobody invited yet',
        speakers: [
          makeSpeaker(),
          makeSpeaker({ _id: 'speaker-2', email: 'grace@example.com' }),
        ],
        overrides: {},
        expected: { sent: 2, alreadyInvited: 0 },
      },
      {
        name: 'one already carries a marker',
        speakers: [
          makeSpeaker(),
          makeSpeaker({ _id: 'speaker-2', email: 'grace@example.com' }),
        ],
        overrides: proposalWithMarkers([
          { speakerId: 'speaker-1', email: 'ada@example.com' },
        ]),
        expected: { sent: 1, alreadyInvited: 1 },
      },
      {
        name: 'duplicate speaker documents sharing an address',
        speakers: [
          makeSpeaker(),
          makeSpeaker({ _id: 'speaker-dup', email: 'ADA@example.com' }),
        ],
        overrides: {},
        expected: { sent: 1, alreadyInvited: 0 },
      },
      {
        name: 'a speaker with no email',
        speakers: [makeSpeaker(), makeSpeaker({ _id: 'speaker-2', email: '' })],
        overrides: {},
        expected: { sent: 1, alreadyInvited: 0 },
      },
    ]

    it.each(cases)(
      'previews exactly what the send does: $name',
      async ({ speakers, overrides, expected }) => {
        const previewed = await handleSpeakerTicket(
          makeEvent(overrides, speakers),
          { dryRun: true },
        )
        expect(previewed).toEqual({ ...expected, failed: 0, blocked: false })
        // A dry run touches nothing.
        expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
        expect(mockedSendEmail).not.toHaveBeenCalled()
        expect(mockedRecordEmailed).not.toHaveBeenCalled()

        const sent = await handleSpeakerTicket(makeEvent(overrides, speakers))
        expect(sent).toEqual(previewed)
        expect(mockProvider.sendTicketInvitation).toHaveBeenCalledTimes(
          expected.sent,
        )
      },
    )

    it('previews zero when the provider cannot be read, matching the send', async () => {
      mockProvider.fetchPublicTicketTypes.mockRejectedValue(new Error('boom'))

      const previewed = await handleSpeakerTicket(makeEvent(), { dryRun: true })
      const sent = await handleSpeakerTicket(makeEvent())

      expect(previewed).toEqual({
        sent: 0,
        failed: 0,
        alreadyInvited: 0,
        blocked: true,
      })
      expect(sent).toEqual(previewed)
      expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    })
  })

  describe('result counts', () => {
    it('reports invitations sent, not speakers swept', async () => {
      const result = await handleSpeakerTicket(
        makeEvent(
          proposalWithMarkers([
            { speakerId: 'speaker-1', email: 'ada@example.com' },
          ]),
          [
            makeSpeaker(),
            makeSpeaker({ _id: 'speaker-2', email: 'grace@example.com' }),
          ],
        ),
      )

      expect(result).toEqual({
        sent: 1,
        failed: 0,
        alreadyInvited: 1,
        blocked: false,
      })
    })

    it('counts a failed provider invitation as failed, never as sent', async () => {
      mockProvider.sendTicketInvitation.mockRejectedValue(new Error('nope'))

      const result = await handleSpeakerTicket(makeEvent())

      expect(result).toEqual({
        sent: 0,
        failed: 1,
        alreadyInvited: 0,
        blocked: false,
      })
    })

    it('counts a failed heads-up email as failed, never as sent', async () => {
      mockedSendEmail.mockRejectedValue(new Error('nope'))

      const result = await handleSpeakerTicket(makeEvent())

      expect(result).toEqual({
        sent: 0,
        failed: 1,
        alreadyInvited: 0,
        blocked: false,
      })
    })
  })

  describe('per-speaker issuance', () => {
    const two = () => [
      makeSpeaker(),
      makeSpeaker({ _id: 'speaker-2', email: 'grace@example.com' }),
    ]

    it('invites only the named speaker', async () => {
      const result = await handleSpeakerTicket(makeEvent({}, two()), {
        speakerIds: ['speaker-2'],
      })

      expect(result.sent).toBe(1)
      expect(mockProvider.sendTicketInvitation).toHaveBeenCalledTimes(1)
      expect(mockProvider.sendTicketInvitation).toHaveBeenCalledWith(
        SPEAKER_TICKET_ID,
        ['grace@example.com'],
        expect.any(String),
      )
    })

    it('re-sends over an existing marker when asked, and only for that speaker', async () => {
      const event = makeEvent(
        proposalWithMarkers([
          { speakerId: 'speaker-1', email: 'ada@example.com' },
          { speakerId: 'speaker-2', email: 'grace@example.com' },
        ]),
        two(),
      )

      const result = await handleSpeakerTicket(event, {
        speakerIds: ['speaker-1'],
        resend: true,
      })

      expect(result).toEqual({
        sent: 1,
        failed: 0,
        alreadyInvited: 0,
        blocked: false,
      })
      expect(mockProvider.sendTicketInvitation).toHaveBeenCalledTimes(1)
      expect(mockProvider.sendTicketInvitation).toHaveBeenCalledWith(
        SPEAKER_TICKET_ID,
        ['ada@example.com'],
        expect.any(String),
      )
    })

    /**
     * `speakerTicketStatus` keys "Invited" on the speaker ID, so a DUPLICATE
     * speaker document for an already-invited address renders as "Not invited"
     * — the row an organizer is most likely to click. Honouring the button
     * there would mail the same person a second time.
     */
    it('refuses to re-send to an address already invited under another speaker document', async () => {
      const result = await handleSpeakerTicket(
        makeEvent(
          proposalWithMarkers([
            { speakerId: 'speaker-1', email: 'ada@example.com' },
          ]),
          [makeSpeaker({ _id: 'speaker-dup', email: 'ADA@example.com' })],
        ),
        { speakerIds: ['speaker-dup'], resend: true },
      )

      expect(result).toEqual({
        sent: 0,
        failed: 0,
        alreadyInvited: 1,
        blocked: false,
      })
      expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    })

    it('leaves the sweep dedupe alone: without resend a marked speaker is skipped', async () => {
      const result = await handleSpeakerTicket(
        makeEvent(
          proposalWithMarkers([
            { speakerId: 'speaker-1', email: 'ada@example.com' },
          ]),
          two(),
        ),
        { speakerIds: ['speaker-1'] },
      )

      expect(result).toEqual({
        sent: 0,
        failed: 0,
        alreadyInvited: 1,
        blocked: false,
      })
      expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    })
  })

  it('ignores non-confirm actions', async () => {
    await handleSpeakerTicket(makeEvent({ action: Action.accept }))

    expect(mockedResolveProvider).not.toHaveBeenCalled()
    expect(mockProvider.sendTicketInvitation).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })

  it('no-ops when the proposal has no speakers', async () => {
    await handleSpeakerTicket(makeEvent({}, []))

    expect(mockedResolveProvider).not.toHaveBeenCalled()
    expect(mockedSendEmail).not.toHaveBeenCalled()
  })
})
