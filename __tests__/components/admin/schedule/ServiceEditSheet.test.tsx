/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ServiceEditSheet } from '@/components/admin/schedule/mobile/sheets/ServiceEditSheet'
import { ScheduleTrack, TrackTalk } from '@/lib/conference/types'

const session: TrackTalk = {
  placeholder: 'Coffee Break',
  startTime: '10:00',
  endTime: '10:15',
}

const trackWith = (
  blockerStart: string,
  blockerEnd: string,
): ScheduleTrack => ({
  trackTitle: 'Main Stage',
  trackDescription: '',
  talks: [
    session,
    { placeholder: 'Blocker', startTime: blockerStart, endTime: blockerEnd },
  ],
})

describe('ServiceEditSheet rename mode', () => {
  const renameProps = {
    trackIndex: 0,
    talkIndex: 0,
    track: trackWith('11:00', '11:30'),
    mode: 'rename' as const,
  }

  it('disables Save while the title is empty and never dispatches an empty rename', () => {
    const dispatch = vi.fn()
    const onClose = vi.fn()
    render(
      <ServiceEditSheet
        {...renameProps}
        talk={{ ...session, placeholder: '' }}
        dispatch={dispatch}
        onClose={onClose}
      />,
    )

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    // Even a forced click must not commit an empty title or close the sheet.
    fireEvent.click(save)
    expect(dispatch).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('enables Save once the title has non-whitespace text and commits it trimmed', () => {
    const dispatch = vi.fn()
    const onClose = vi.fn()
    render(
      <ServiceEditSheet
        {...renameProps}
        talk={{ ...session, placeholder: '' }}
        dispatch={dispatch}
        onClose={onClose}
      />,
    )

    const input = screen.getByLabelText('Session title')
    const save = screen.getByRole('button', { name: 'Save' })

    // Whitespace-only keeps it disabled…
    fireEvent.change(input, { target: { value: '   ' } })
    expect(save).toBeDisabled()

    // …real text enables it, and the committed title is trimmed.
    fireEvent.change(input, { target: { value: '  Lunch  ' } })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'renameService', title: 'Lunch' }),
    )
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ServiceEditSheet duration mode', () => {
  it('filters options to the surrounding gap and keeps a non-standard current duration selectable', () => {
    render(
      <ServiceEditSheet
        talk={{
          placeholder: 'Odd Break',
          startTime: '10:00',
          endTime: '10:25',
        }}
        trackIndex={0}
        talkIndex={0}
        track={{
          trackTitle: 'Main Stage',
          trackDescription: '',
          talks: [
            { placeholder: 'Odd Break', startTime: '10:00', endTime: '10:25' },
            { placeholder: 'Blocker', startTime: '10:30', endTime: '11:00' },
          ],
        }}
        mode="duration"
        dispatch={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const select = screen.getByLabelText('Duration (minutes)')
    const options = within(select as HTMLElement)
      .getAllByRole('option')
      .map((o) => o.textContent)
    // 25 is not a standard option but is the session's CURRENT duration.
    expect(options).toContain('25 minutes')
    // 30 ends exactly at the 10:30 blocker (legal); 45 would overlap it.
    expect(options).toContain('30 minutes')
    expect(options).not.toContain('45 minutes')
  })

  it('shows an inline error and does not close when the chosen duration no longer fits', () => {
    const dispatch = vi.fn()
    const onClose = vi.fn()
    const props = {
      talk: session,
      trackIndex: 0,
      talkIndex: 0,
      mode: 'duration' as const,
      dispatch,
      onClose,
    }
    const { rerender } = render(
      <ServiceEditSheet {...props} track={trackWith('11:00', '11:30')} />,
    )

    // 45 minutes fits while the blocker sits at 11:00…
    fireEvent.change(screen.getByLabelText('Duration (minutes)'), {
      target: { value: '45' },
    })

    // …but the schedule changes underneath the open sheet (blocker → 10:30).
    rerender(
      <ServiceEditSheet {...props} track={trackWith('10:30', '11:00')} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // The rejected resize surfaces inline instead of closing as if it worked.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That duration no longer fits',
    )
    expect(dispatch).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
