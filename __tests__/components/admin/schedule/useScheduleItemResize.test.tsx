/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { useScheduleItemResize } from '@/components/admin/schedule/track/useScheduleItemResize'
import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import { PIXELS_PER_MINUTE } from '@/lib/schedule/geometry'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'

const makeProposal = (
  overrides: Partial<ProposalExisting> & { _id: string; title: string },
): ProposalExisting => ({
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  description: [],
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status: Status.confirmed,
  outline: '',
  topics: [],
  tos: true,
  speakers: [],
  conference: { _type: 'reference', _ref: 'conf-1' },
  attachments: [],
  ...overrides,
})

// A 240-minute workshop, scheduled for its full length.
const workshop = makeProposal({
  _id: 'workshop-1',
  title: 'All-day Workshop',
  format: Format.workshop_240,
})

const workshopSlot: TrackTalk = {
  talk: workshop,
  startTime: '09:00',
  endTime: '13:00',
}

const serviceSlot: TrackTalk = {
  placeholder: 'Lunch',
  startTime: '09:00',
  endTime: '09:30',
}

const trackWith = (talks: TrackTalk[]): ScheduleTrack => ({
  trackTitle: 'Main Stage',
  trackDescription: '',
  talks,
})

/**
 * Minimal stand-in for the React pointer event the handle receives. The hook
 * only touches these members (plus the pointer-capture API on the target).
 */
const pointerEvent = (clientY: number) => {
  const target = {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  }
  return {
    clientY,
    pointerId: 1,
    currentTarget: target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent
}

const setup = (talk: TrackTalk, track = trackWith([talk])) => {
  const onUpdateDuration = vi.fn()
  const durationMin =
    (Number(talk.endTime.slice(0, 2)) - Number(talk.startTime.slice(0, 2))) *
      60 +
    (Number(talk.endTime.slice(3)) - Number(talk.startTime.slice(3)))
  const { result } = renderHook(() =>
    useScheduleItemResize({
      talk,
      talkIndex: 0,
      track,
      height: durationMin * PIXELS_PER_MINUTE,
      onUpdateDuration,
    }),
  )
  return { result, onUpdateDuration, height: durationMin * PIXELS_PER_MINUTE }
}

describe('useScheduleItemResize duration cap', () => {
  it('does not shrink a talk that is longer than the legacy 180-minute cap', () => {
    const { result, onUpdateDuration, height } = setup(workshopSlot)

    act(() => {
      result.current.handlePointerDown(pointerEvent(0))
    })
    // Move by a single pixel: the pointer barely moves, so the duration must not
    // change. The old flat MAX_DURATION = 180 clamped the 240-minute workshop
    // the instant the handle was grabbed.
    act(() => {
      result.current.handlePointerMove(pointerEvent(1))
    })

    expect(onUpdateDuration).not.toHaveBeenCalled()

    // Dragging the handle further DOWN cannot shorten it either — the cap is
    // the item's own length, so the worst case is "no change".
    act(() => {
      result.current.handlePointerMove(pointerEvent(30 * PIXELS_PER_MINUTE))
    })
    expect(onUpdateDuration).not.toHaveBeenCalled()

    // Dragging UP is a deliberate shrink and still works.
    act(() => {
      result.current.handlePointerMove(pointerEvent(-60 * PIXELS_PER_MINUTE))
    })
    expect(onUpdateDuration).toHaveBeenLastCalledWith(0, 180)
    void height
  })

  it('still lets a talk be dragged back out to its full format duration', () => {
    // A 240-minute workshop currently scheduled as a 60-minute part (the rest
    // sits in the unassigned list as a split remainder).
    const partial: TrackTalk = {
      talk: workshop,
      startTime: '09:00',
      endTime: '10:00',
    }
    const { result, onUpdateDuration } = setup(partial)

    act(() => {
      result.current.handlePointerDown(pointerEvent(0))
    })
    // Ask for far more than the format length — it clamps to 240, not 180.
    act(() => {
      result.current.handlePointerMove(pointerEvent(400 * PIXELS_PER_MINUTE))
    })
    expect(onUpdateDuration).toHaveBeenLastCalledWith(0, 240)
  })

  it('keeps the 180-minute default ceiling for service sessions', () => {
    const { result, onUpdateDuration } = setup(serviceSlot)

    act(() => {
      result.current.handlePointerDown(pointerEvent(0))
    })
    act(() => {
      result.current.handlePointerMove(pointerEvent(600 * PIXELS_PER_MINUTE))
    })
    expect(onUpdateDuration).toHaveBeenLastCalledWith(0, 180)
  })

  it('still clamps against the next item in the track', () => {
    const next: TrackTalk = {
      placeholder: 'Lunch',
      startTime: '11:00',
      endTime: '11:30',
    }
    const talk: TrackTalk = {
      talk: workshop,
      startTime: '09:00',
      endTime: '10:00',
    }
    const { result, onUpdateDuration } = setup(talk, trackWith([talk, next]))

    act(() => {
      result.current.handlePointerDown(pointerEvent(0))
    })
    act(() => {
      result.current.handlePointerMove(pointerEvent(400 * PIXELS_PER_MINUTE))
    })
    // 09:00 → 11:00 is the largest interval that stays free.
    expect(onUpdateDuration).toHaveBeenLastCalledWith(0, 120)
  })
})
