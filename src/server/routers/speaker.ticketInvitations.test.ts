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
  h.handleSpeakerTicket.mockResolvedValue(undefined)
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
})
