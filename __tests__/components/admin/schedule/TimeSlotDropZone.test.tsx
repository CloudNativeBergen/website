/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react'
import { TimeSlotDropZone } from '@/components/admin/schedule/track/TimeSlotDropZone'
import { ScheduleProvider } from '@/components/admin/schedule/ScheduleContext'
import { ScheduleTrack, ConferenceSchedule } from '@/lib/conference/types'
import { toEditorSchedule, type DragItem } from '@/lib/schedule/types'

// Force `isOver` so the drop indicator classes render without a real dnd-kit
// drag in flight (the unit under test is `canDrop`, not the sensor pipeline).
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    useDroppable: () => ({ setNodeRef: () => {}, isOver: true }),
  }
})

const track: ScheduleTrack = {
  trackTitle: 'Main Stage',
  trackDescription: '',
  talks: [{ placeholder: 'Lunch', startTime: '10:00', endTime: '10:45' }],
}

const schedule: ConferenceSchedule = {
  _id: 'day-1',
  date: '2026-09-01',
  tracks: [track],
}

// A fresh 30-minute service session being dragged from the palette.
const serviceDrag: DragItem = {
  type: 'service-session',
  serviceSession: {
    placeholder: 'Coffee Break',
    startTime: '09:00',
    endTime: '09:30',
  },
}

const renderZone = (time: string) =>
  render(
    <ScheduleProvider
      value={{
        activeDragItem: serviceDrag,
        schedule: toEditorSchedule(schedule),
        otherScheduledProposalIds: new Set(),
        dispatch: () => {},
      }}
    >
      <TimeSlotDropZone
        timeSlot={{ time, displayTime: time }}
        trackIndex={0}
        track={track}
        onCreateServiceSession={vi.fn()}
      />
    </ScheduleProvider>,
  )

describe('TimeSlotDropZone service-drag indicator', () => {
  it('shows the not-allowed indicator over an occupied interval', () => {
    const { container } = renderZone('10:00')
    const zone = container.firstElementChild as HTMLElement
    // canDrop=false + isOver → the red not-allowed classes, not the blue ones.
    expect(zone.className).toContain('bg-red-100')
    expect(zone.className).not.toContain('bg-blue-100')
  })

  it('shows the droppable indicator over a free interval', () => {
    const { container } = renderZone('12:00')
    const zone = container.firstElementChild as HTMLElement
    expect(zone.className).toContain('bg-blue-100')
    expect(zone.className).not.toContain('bg-red-100')
  })
})
