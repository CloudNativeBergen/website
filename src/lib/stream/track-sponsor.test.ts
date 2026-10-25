import { describe, expect, it } from 'vitest'
import type { ScheduleTrack } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { trackSponsorOf } from './track-sponsor'

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
  sponsor: sponsorRef ? { _ref: sponsorRef } : undefined,
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
