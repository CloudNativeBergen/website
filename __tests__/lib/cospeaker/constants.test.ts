import { describe, it, expect } from 'vitest'
import {
  getCoSpeakerLimit,
  getTotalSpeakerLimit,
  allowsCoSpeakers,
} from '@/lib/cospeaker/constants'
import { Format } from '@/lib/proposal/types'

describe('getCoSpeakerLimit', () => {
  it('returns the per-format limit for mapped formats', () => {
    expect(getCoSpeakerLimit(Format.lightning_10)).toBe(0)
    expect(getCoSpeakerLimit(Format.presentation_25)).toBe(1)
    expect(getCoSpeakerLimit(Format.presentation_40)).toBe(2)
    expect(getCoSpeakerLimit(Format.workshop_240)).toBe(3)
  })

  it('fails closed (0) for an unmapped/legacy format', () => {
    expect(getCoSpeakerLimit('some-legacy-format' as Format)).toBe(0)
    expect(getCoSpeakerLimit(undefined as unknown as Format)).toBe(0)
  })

  it('allowsCoSpeakers is false for an unmapped format', () => {
    expect(allowsCoSpeakers('unknown' as Format)).toBe(false)
    expect(allowsCoSpeakers(Format.lightning_10)).toBe(false)
    expect(allowsCoSpeakers(Format.presentation_25)).toBe(true)
  })

  it('getTotalSpeakerLimit is the co-speaker limit plus the primary speaker', () => {
    expect(getTotalSpeakerLimit(Format.presentation_40)).toBe(3)
    expect(getTotalSpeakerLimit('unknown' as Format)).toBe(1)
  })
})
