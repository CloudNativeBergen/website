/**
 * @vitest-environment node
 *
 * Drives the REAL matching logic of `scripts/backfill-speaker-ticket-markers.ts`
 * — the planner, plus the shared category/redemption helpers it is fed from
 * (`redeemedSpeakerEmails` / `findSpeakerTicketType`), so the "which ticket
 * counts" rule under test is the one issuance actually uses rather than a
 * restatement of it.
 *
 * The case that matters most is "an existing marker is left alone": its failure
 * mode is not a missing backfill, it is `recordSpeakerTicketEmailed` upserting
 * over a real delivery record on live data.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  planSpeakerTicketBackfill,
  type BackfillTalk,
} from '../../scripts/backfill-speaker-ticket-markers'
import {
  findSpeakerTicketType,
  redeemedSpeakerEmails,
} from '../../src/lib/tickets/speakerStatus'
import type { EventTicket } from '../../src/lib/tickets/types'

const SPEAKER_TYPE = { name: 'Speaker ticket', requiresInvitation: true }
const REGULAR_TYPE = { name: 'Regular ticket', requiresInvitation: false }

/** The redeemed set exactly as the script builds it: shared helpers, one fetch. */
function redeemedFrom(tickets: Partial<EventTicket>[]): Set<string> {
  const speakerType = findSpeakerTicketType([SPEAKER_TYPE, REGULAR_TYPE])
  expect(speakerType).toBeDefined()
  return redeemedSpeakerEmails(tickets as EventTicket[], [
    speakerType!.name,
    'Speaker ticket',
  ])
}

const ticket = (category: string, email: string) =>
  ({ category, crm: { email } }) as Partial<EventTicket>

describe('planSpeakerTicketBackfill', () => {
  it('backfills a speaker with a claimed speaker ticket and no marker', () => {
    const talks: BackfillTalk[] = [
      {
        _id: 'talk-1',
        title: 'Observability',
        speakers: [{ _id: 'spk-1', name: 'Ada', email: 'Ada@Example.com' }],
      },
    ]

    const plan = planSpeakerTicketBackfill(
      talks,
      redeemedFrom([ticket('Speaker ticket', 'ada@example.com')]),
    )

    expect(plan.planned).toEqual([
      {
        proposalId: 'talk-1',
        proposalTitle: 'Observability',
        speakerId: 'spk-1',
        speakerName: 'Ada',
        email: 'ada@example.com',
        matchedEmail: 'ada@example.com',
        matchedVia: 'email',
      },
    ])
    expect(plan.alreadyMarked).toBe(0)
  })

  it('leaves an existing marker alone', () => {
    const talks: BackfillTalk[] = [
      {
        _id: 'talk-1',
        title: 'Observability',
        speakers: [{ _id: 'spk-1', name: 'Ada', email: 'ada@example.com' }],
        issuedSpeakerTickets: [
          {
            _key: 'speaker-ticket-spk-1',
            speakerId: 'spk-1',
            email: 'ada@example.com',
          },
        ],
      },
    ]

    const plan = planSpeakerTicketBackfill(
      talks,
      redeemedFrom([ticket('Speaker ticket', 'ada@example.com')]),
    )

    // A VALUE assertion, not an absence: the speaker was counted as already
    // marked, so the zero below is the skip rule firing and not an empty input.
    expect(plan.alreadyMarked).toBe(1)
    expect(plan.planned).toHaveLength(0)
  })

  it('leaves a marker written under a different speaker document alone', () => {
    // Duplicate speaker docs for one person are the common dirty-data shape
    // here; the handler skips on the marker EMAIL too, so the backfill must.
    const talks: BackfillTalk[] = [
      {
        _id: 'talk-1',
        title: 'Observability',
        speakers: [{ _id: 'spk-dupe', name: 'Ada', email: 'ada@example.com' }],
        issuedSpeakerTickets: [
          {
            _key: 'speaker-ticket-spk-1',
            speakerId: 'spk-1',
            email: 'ada@example.com',
          },
        ],
      },
    ]

    const plan = planSpeakerTicketBackfill(
      talks,
      redeemedFrom([ticket('Speaker ticket', 'ada@example.com')]),
    )

    expect(plan.alreadyMarked).toBe(1)
    expect(plan.planned).toHaveLength(0)
  })

  it('does not treat an ordinary-category ticket as proof of an invitation', () => {
    const talks: BackfillTalk[] = [
      {
        _id: 'talk-1',
        title: 'Observability',
        speakers: [{ _id: 'spk-1', name: 'Ada', email: 'ada@example.com' }],
      },
    ]

    const plan = planSpeakerTicketBackfill(
      talks,
      // Same address, same person — but they BOUGHT a ticket. That says nothing
      // about whether anyone invited them to the comp.
      redeemedFrom([ticket('Regular ticket', 'ada@example.com')]),
    )

    expect(plan.noClaimedTicket).toBe(1)
    expect(plan.planned).toHaveLength(0)
  })

  it('backfills a speaker matched only through knownEmails', () => {
    const talks: BackfillTalk[] = [
      {
        _id: 'talk-2',
        title: 'Platforms',
        speakers: [
          {
            _id: 'spk-2',
            name: 'Grace',
            email: 'grace@work.example',
            knownEmails: ['grace@personal.example'],
          },
        ],
      },
    ]

    const plan = planSpeakerTicketBackfill(
      talks,
      redeemedFrom([ticket('Speaker ticket', 'Grace@Personal.Example')]),
    )

    expect(plan.planned).toHaveLength(1)
    expect(plan.planned[0]).toMatchObject({
      speakerId: 'spk-2',
      matchedVia: 'knownEmails',
      matchedEmail: 'grace@personal.example',
      // The marker carries the DISPLAY address, which is what the live handler
      // compares against on the next sweep.
      email: 'grace@work.example',
    })
  })

  it('is idempotent: re-planning against the markers it would write is a no-op', () => {
    const talks: BackfillTalk[] = [
      {
        _id: 'talk-1',
        title: 'Observability',
        speakers: [{ _id: 'spk-1', name: 'Ada', email: 'ada@example.com' }],
      },
    ]
    const redeemed = redeemedFrom([ticket('Speaker ticket', 'ada@example.com')])

    const first = planSpeakerTicketBackfill(talks, redeemed)
    expect(first.planned).toHaveLength(1)

    const committed: BackfillTalk[] = [
      {
        ...talks[0],
        issuedSpeakerTickets: first.planned.map((m) => ({
          _key: `speaker-ticket-${m.speakerId}`,
          speakerId: m.speakerId,
          email: m.email,
        })),
      },
    ]
    expect(planSpeakerTicketBackfill(committed, redeemed).planned).toHaveLength(
      0,
    )
  })
})

/**
 * The dry-run gate, driven through `main()` with the Sanity and provider
 * boundaries mocked. The `--apply` case is the POSITIVE CONTROL: without it a
 * green "dry run wrote nothing" would also pass if the write were unreachable.
 */
const recordSpeakerTicketEmailed = vi.fn(async () => {})
const fetch = vi.fn()

vi.mock('../../src/lib/proposal/data/sanity', () => ({
  recordSpeakerTicketEmailed: (...args: unknown[]) =>
    recordSpeakerTicketEmailed(...(args as [])),
}))

vi.mock('../../src/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetch(...args) },
}))

vi.mock('../../src/lib/tickets/provider', () => ({
  ticketingBinding: (c: unknown) => c,
  resolveTicketingProvider: async () => ({
    configured: true,
    eventRef: { customerId: 1, eventId: 2 },
    provider: {
      fetchPublicTicketTypes: async () => ({
        tickets: [SPEAKER_TYPE, REGULAR_TYPE],
      }),
      fetchEventTickets: async () => [
        ticket('Speaker ticket', 'ada@example.com'),
      ],
    },
  }),
}))

describe('backfill script write gate', () => {
  const argv = process.argv

  beforeEach(() => {
    recordSpeakerTicketEmailed.mockClear()
    fetch.mockReset()
    fetch
      .mockResolvedValueOnce([
        {
          _id: 'conf-1',
          title: 'Konf',
          startDate: '2026-01-01',
          checkinCustomerId: 1,
          checkinEventId: 2,
          organization: { _ref: 'org-1' },
        },
      ])
      .mockResolvedValueOnce([
        {
          _id: 'talk-1',
          title: 'Observability',
          speakers: [{ _id: 'spk-1', name: 'Ada', email: 'ada@example.com' }],
        },
      ])
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = argv
    vi.restoreAllMocks()
  })

  it('writes nothing without --apply', async () => {
    process.argv = ['node', 'backfill-speaker-ticket-markers.ts']
    const { main } =
      await import('../../scripts/backfill-speaker-ticket-markers')
    await main()
    expect(recordSpeakerTicketEmailed).not.toHaveBeenCalled()
  })

  it('writes the marker with --apply (positive control for the gate above)', async () => {
    process.argv = ['node', 'backfill-speaker-ticket-markers.ts', '--apply']
    const { main } =
      await import('../../scripts/backfill-speaker-ticket-markers')
    await main()
    expect(recordSpeakerTicketEmailed).toHaveBeenCalledTimes(1)
    expect(recordSpeakerTicketEmailed).toHaveBeenCalledWith('talk-1', {
      speakerId: 'spk-1',
      email: 'ada@example.com',
    })
  })
})
