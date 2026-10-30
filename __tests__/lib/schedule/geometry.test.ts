import { calculateTalkPosition } from '@/lib/schedule/geometry'
import type { TrackTalk } from '@/lib/conference/types'

describe('calculateTalkPosition', () => {
  it('never returns a negative height for an inverted slot', () => {
    const talk = { startTime: '15:00', endTime: '14:00' } as TrackTalk
    expect(calculateTalkPosition(talk).height).toBe(0)
  })
})
