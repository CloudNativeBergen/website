import { describe, it, expect } from 'vitest'
import { getSpeakerBriefing } from './briefing'
import { Format, Status, type ProposalExisting } from '@/lib/proposal/types'
import { TravelSupportStatus } from '@/lib/travel-support/types'

const block = {
  _type: 'block',
  _key: 'b1',
  children: [{ _type: 'span', text: 'Bring an HDMI adapter' }],
}
const blankBlock = {
  _type: 'block',
  _key: 'b0',
  children: [{ _type: 'span', text: ' ' }],
}

const proposal = (over: Partial<ProposalExisting>) =>
  ({
    _id: 'p1',
    title: 'Talk',
    status: Status.confirmed,
    format: Format.presentation_25,
    ...over,
  }) as ProposalExisting

describe('getSpeakerBriefing', () => {
  it('falls back to plain speakerDinnerInfo without speakerInfo', () => {
    expect(
      getSpeakerBriefing({ speakerDinnerInfo: ' At the harbour ' }),
    ).toEqual({ dinner: { text: 'At the harbour' } })
  })

  it('prefers the structured dinner over the fallback', () => {
    const b = getSpeakerBriefing({
      speakerDinnerInfo: 'old',
      speakerInfo: {
        dinner: { venueName: 'Bryggen', routes: [{ _key: 'r' }] },
      },
    })
    expect(b.dinner).toEqual({ venueName: 'Bryggen' })
  })

  it('keeps a route with only the map link or departure note', () => {
    const b = getSpeakerBriefing({
      speakerInfo: {
        dinner: {
          rsvpNote: ' On your ticket ',
          routes: [
            { _key: 'a', meetingPointMapUrl: ' https://maps.example.com/x ' },
            { _key: 'b', departsNote: 'After the workshops' },
            { _key: 'c', departsNote: '  ' },
          ],
        },
      },
    })
    expect(b.dinner).toEqual({
      rsvpNote: 'On your ticket',
      routes: [
        { _key: 'a', meetingPointMapUrl: 'https://maps.example.com/x' },
        { _key: 'b', departsNote: 'After the workshops' },
      ],
    })
  })

  it('keeps a route without a _key, and a dinner with routes only', () => {
    const b = getSpeakerBriefing({
      speakerDinnerInfo: 'fallback',
      speakerInfo: { dinner: { routes: [{ label: 'Walk' }] } },
    })
    expect(b.dinner).toEqual({ routes: [{ label: 'Walk' }] })
  })

  it('treats a lone blank paragraph as empty', () => {
    expect(
      getSpeakerBriefing({
        speakerInfo: {
          checkIn: [blankBlock],
          dinner: { description: [blankBlock] },
        },
      }),
    ).toEqual({})
  })

  it('omits empty sections entirely', () => {
    expect(
      getSpeakerBriefing({
        venueName: '  ',
        speakerInfo: {
          dinner: { venueName: '', description: [] },
          checkIn: [],
          onsiteContact: { name: '' },
          equipment: [block],
        },
      }),
    ).toEqual({ equipment: [block] })
  })

  it('lists confirmed talks and the to-dos', () => {
    const b = getSpeakerBriefing(
      {},
      {
        proposals: [
          proposal({
            _id: 'c',
            scheduleInfo: {
              date: '2026-10-27',
              trackTitle: 'Main',
              timeSlot: { startTime: '10:00', endTime: '10:30' },
            },
          }),
          proposal({
            _id: 's',
            attachments: [
              {
                _type: 'urlAttachment',
                _key: 'k',
                url: 'x',
                attachmentType: 'slides',
              },
            ],
          }),
          proposal({ _id: 'a', status: Status.accepted }),
          proposal({ _id: 'r', status: Status.rejected }),
        ],
      },
    )
    expect(b.talks).toEqual([
      {
        proposalId: 'c',
        title: 'Talk',
        format: Format.presentation_25,
        isWorkshop: false,
        date: '2026-10-27',
        startTime: '10:00',
        endTime: '10:30',
        trackTitle: 'Main',
      },
      {
        proposalId: 's',
        title: 'Talk',
        format: Format.presentation_25,
        isWorkshop: false,
      },
    ])
    expect(b.todos).toEqual([
      {
        label: 'Upload your slides',
        kind: 'upload-slides',
        proposalId: 'c',
        title: 'Talk',
      },
      {
        label: 'Confirm your talk',
        kind: 'confirm-talk',
        proposalId: 'a',
        title: 'Talk',
      },
    ])
  })

  it('marks workshops', () => {
    const b = getSpeakerBriefing(
      {},
      { proposals: [proposal({ format: Format.workshop_120 })] },
    )
    expect(b.talks?.[0]).toMatchObject({
      format: Format.workshop_120,
      isWorkshop: true,
    })
  })

  const slides = [
    {
      _type: 'urlAttachment',
      _key: 'k',
      url: 'x',
      attachmentType: 'slides',
    },
  ] as ProposalExisting['attachments']
  const kinds = (data: Parameters<typeof getSpeakerBriefing>[1]) =>
    getSpeakerBriefing({}, data).todos?.map((t) => [t.kind, t.proposalId])

  it('asks only a speaker on the talk to confirm it', () => {
    const accepted = proposal({
      _id: 'a',
      status: Status.accepted,
      speakers: [{ _type: 'reference', _ref: 'me' }],
    })
    expect(kinds({ proposals: [accepted], speakerId: 'me' })).toEqual([
      ['confirm-talk', 'a'],
    ])
    expect(kinds({ proposals: [accepted], speakerId: 'other' })).toBeUndefined()
  })

  it('asks to claim an invited, unredeemed ticket once', () => {
    const issued = (id: string) =>
      proposal({
        _id: id,
        attachments: slides,
        issuedSpeakerTickets: [{ speakerId: 'me', emailedAt: '2026-01-01' }],
      })
    const proposals = [issued('t1'), issued('t2')]
    expect(
      kinds({ proposals, speakerId: 'me', ticketState: 'invited' }),
    ).toEqual([['claim-ticket', 't1']])
    for (const ticketState of ['redeemed', 'unknown', undefined] as const) {
      expect(kinds({ proposals, speakerId: 'me', ticketState })).toBeUndefined()
    }
    expect(
      kinds({ proposals, speakerId: 'other', ticketState: 'invited' }),
    ).toBeUndefined()
  })

  it('flags a pending, unexpired co-speaker invite', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    const invite = (status: 'pending' | 'accepted', expiresAt: string) =>
      proposal({
        _id: `${status}-${expiresAt}`,
        attachments: slides,
        coSpeakerInvitations: [
          { _id: 'i', invitedEmail: 'x@example.com', status, expiresAt },
        ],
      })
    expect(
      kinds({
        now,
        proposals: [
          invite('pending', '2026-07-01T00:00:00Z'),
          invite('pending', '2026-05-01T00:00:00Z'),
          invite('accepted', '2026-07-01T00:00:00Z'),
        ],
      }),
    ).toEqual([['co-speaker-invite-pending', 'pending-2026-07-01T00:00:00Z']])
  })

  it('flags a draft travel support request', () => {
    expect(
      getSpeakerBriefing(
        {},
        {
          proposals: [],
          travelSupport: { status: TravelSupportStatus.DRAFT },
        },
      ).todos,
    ).toEqual([
      { label: 'Submit your travel support request', kind: 'travel-support' },
    ])
    expect(
      kinds({
        proposals: [],
        travelSupport: { status: TravelSupportStatus.SUBMITTED },
      }),
    ).toBeUndefined()
  })
})
