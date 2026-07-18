/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import { UnassignedDrawer } from '@/components/admin/schedule/mobile/sheets/UnassignedDrawer'
import { ScheduleTrack } from '@/lib/conference/types'

const track: ScheduleTrack = {
  trackTitle: 'Main Stage',
  trackDescription: '',
  talks: [
    // The tapped gap is 10:00–10:04 (a sub-5-minute sliver before this talk).
    { placeholder: 'Standup', startTime: '10:04', endTime: '10:30' },
  ],
}

describe('UnassignedDrawer service creation', () => {
  it('falls back to the exact available minutes when no standard duration fits a sub-5-min gap', () => {
    render(
      <UnassignedDrawer
        proposals={[]}
        context={{ trackIndex: 0, startTime: '10:00', maxDurationMin: 4 }}
        track={track}
        dispatch={vi.fn()}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Create service session here/ }),
    )

    // No standard SERVICE_DURATION_OPTIONS entry (5..90) fits 4 free minutes,
    // so the dropdown must offer the exact gap instead of a dead-end form.
    const select = screen.getByLabelText('Duration (minutes)')
    const options = within(select as HTMLElement)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toContain('4 minutes')
    expect(options).not.toContain('5 minutes')
  })
})
