import { describe, it, expect } from 'vitest'
import { getSpeakerInfoGaps } from './briefing-checklist'

describe('getSpeakerInfoGaps', () => {
  it('lists every gap', () => {
    expect(
      getSpeakerInfoGaps({
        dinner: {
          rsvpNote: 'On your ticket',
          routes: [
            { _key: 'a', label: 'Taxi' },
            { _key: 'b', details: [], departsNote: 'After talks' },
          ],
        },
      }),
    ).toEqual([
      'The dinner has no start time.',
      'The dinner has no venue.',
      'Taxi has no departure time or note.',
      'Taxi has no meeting point.',
      'Route 2 has no meeting point.',
      'There is no on-site contact.',
    ])
  })

  it('skips dinner checks without a dinner, and is empty when complete', () => {
    expect(getSpeakerInfoGaps(undefined)).toEqual([
      'There is no on-site contact.',
    ])
    expect(
      getSpeakerInfoGaps({
        onsiteContact: { phone: '+47 1' },
        dinner: {
          startsAt: '2026-10-27T18:00:00Z',
          venueName: 'Bryggen',
          routes: [{ _key: 'a', departsAt: '17:30', meetingPoint: 'Lobby' }],
        },
      }),
    ).toEqual([])
  })
})
