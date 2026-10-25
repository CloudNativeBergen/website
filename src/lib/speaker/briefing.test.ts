import { describe, it, expect } from 'vitest'
import { getSpeakerBriefing } from './briefing'
import { Status, type ProposalExisting } from '@/lib/proposal/types'

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
        date: '2026-10-27',
        startTime: '10:00',
        endTime: '10:30',
        trackTitle: 'Main',
      },
      { proposalId: 's', title: 'Talk' },
    ])
    expect(b.todos).toEqual([
      { kind: 'upload-slides', proposalId: 'c', title: 'Talk' },
      { kind: 'confirm-talk', proposalId: 'a', title: 'Talk' },
    ])
  })
})
