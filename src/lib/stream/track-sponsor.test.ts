import { describe, expect, it } from 'vitest'
import type { ConferenceSchedule, ScheduleTrack } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { roomTrackOn, trackSponsorOf } from './track-sponsor'

const sponsor = (
  _id: string,
  name: string,
  tier: ConferenceSponsor['tier'] = { title: 'Partner', tagline: '' },
): ConferenceSponsor => ({
  sponsor: { _id, name, website: `https://${_id}.example` },
  tier,
})

const track = (sponsorRef?: string): ScheduleTrack => ({
  trackTitle: 'Proact IT - Lillesalen',
  trackDescription: '',
  talks: [],
  sponsor: sponsorRef ? { _ref: sponsorRef } : null,
})

const sponsors = [
  sponsor('proact', 'Proact IT Norge AS'),
  sponsor('sopra', 'Sopra Steria'),
]

describe('trackSponsorOf', () => {
  it("is the public sponsor the track's sponsor field points at", () => {
    expect(trackSponsorOf(track('sopra'), sponsors)?.sponsor.name).toBe(
      'Sopra Steria',
    )
  })

  it('is nobody for a track without a sponsor', () => {
    expect(trackSponsorOf(track(), sponsors)).toBeNull()
  })

  it('is nobody when the sponsor is not among the public sponsors (a lost deal)', () => {
    expect(trackSponsorOf(track('aws'), sponsors)).toBeNull()
  })

  it('is nobody when the sponsor has no tier, so is not shown publicly', () => {
    expect(
      trackSponsorOf(track('proact'), [
        sponsor('proact', 'Proact IT Norge AS', null),
      ]),
    ).toBeNull()
  })
})

describe('roomTrackOn', () => {
  const day = (date: string, sponsorRef?: string): ConferenceSchedule => ({
    _id: date,
    date,
    tracks: [
      { ...track(sponsorRef), trackTitle: 'Hovedsalen' },
      { ...track(), trackTitle: 'Loftet' },
    ],
  })
  // Monday and Tuesday share the room; only Tuesday's track is sponsored.
  const schedules = [day('2026-10-26'), day('2026-10-27', 'proact')]
  const at = (iso: string) => new Date(`${iso}T10:00:00`)

  it("is today's track of that room", () => {
    expect(
      roomTrackOn(schedules, 'Hovedsalen', at('2026-10-27'))?.sponsor,
    ).toEqual({ _ref: 'proact' })
    expect(
      roomTrackOn(schedules, 'Hovedsalen', at('2026-10-26'))?.sponsor,
    ).toBeNull()
  })

  it('is the first day with that room on a day without one', () => {
    expect(
      roomTrackOn(schedules, 'Hovedsalen', at('2026-10-20'))?.sponsor,
    ).toBeNull()
    expect(
      roomTrackOn(
        [day('2026-10-26'), { ...day('2026-10-27', 'proact'), tracks: [] }],
        'Hovedsalen',
        at('2026-10-27'),
      )?.trackTitle,
    ).toBe('Hovedsalen')
  })

  it('is nothing for a room no day has', () => {
    expect(roomTrackOn(schedules, 'Galleriet', at('2026-10-27'))).toBeNull()
  })
})
