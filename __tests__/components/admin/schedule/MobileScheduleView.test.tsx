/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MobileScheduleView } from '@/components/admin/schedule/MobileScheduleView'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { ConferenceSchedule } from '@/lib/conference/types'

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
  speakers: [
    {
      _id: `speaker-${overrides._id}`,
      _rev: '1',
      _createdAt: '2024-01-01T00:00:00Z',
      _updatedAt: '2024-01-01T00:00:00Z',
      name: 'Jane Doe',
      email: 'jane@example.com',
      slug: 'jane-doe',
    },
  ],
  conference: { _type: 'reference', _ref: 'conf-1' },
  attachments: [],
  ...overrides,
})

const scheduledProposal = makeProposal({
  _id: 'scheduled-1',
  title: 'Scheduled Keynote Talk',
})

const unassignedProposal = makeProposal({
  _id: 'unassigned-1',
  title: 'Unassigned Lightning Talk',
  format: Format.lightning_10,
  level: Level.beginner,
})

const schedule: ConferenceSchedule = {
  _id: 'day-1',
  date: '2026-09-01',
  tracks: [
    {
      trackTitle: 'Main Stage',
      trackDescription: '',
      talks: [
        {
          talk: scheduledProposal,
          startTime: '10:00',
          endTime: '10:45',
        },
      ],
    },
    {
      trackTitle: 'Workshop Room',
      trackDescription: '',
      talks: [],
    },
  ],
}

const setup = () => {
  const dispatch = vi.fn()
  render(
    <MobileScheduleView
      schedules={[schedule]}
      currentDayIndex={0}
      unassignedProposals={[unassignedProposal]}
      dispatch={dispatch}
      onDayChange={vi.fn()}
      onSave={vi.fn()}
      onAddTrack={vi.fn()}
      isSaving={false}
      saveSuccess={false}
      error={null}
    />,
  )
  return { dispatch }
}

describe('MobileScheduleView', () => {
  it('renders track tabs and the current track rail with a talk card', () => {
    setup()
    expect(screen.getByRole('tab', { name: 'Main Stage' })).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Workshop Room' }),
    ).toBeInTheDocument()
    // Talk card: title, gutter start time, and clamp-proof duration chip.
    expect(screen.getByText('Scheduled Keynote Talk')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('45m')).toBeInTheDocument()
  })

  it('selects another track when its tab is tapped', () => {
    setup()
    const workshop = screen.getByRole('tab', { name: 'Workshop Room' })
    expect(workshop).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(workshop)
    expect(workshop).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Main Stage' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('picks up a talk into placing mode and removes it', () => {
    const { dispatch } = setup()
    fireEvent.click(
      screen.getByRole('button', { name: 'Move Scheduled Keynote Talk' }),
    )
    // The placing banner appears as a live region.
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent(/Moving/)
    expect(banner).toHaveTextContent(/Scheduled Keynote Talk/)

    fireEvent.click(within(banner).getByRole('button', { name: /Remove/ }))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'removeTalk',
      trackIndex: 0,
      talkIndex: 0,
    })
  })

  it('swaps two talks: pick one up, tap the other', () => {
    const dispatch = vi.fn()
    const talkB = makeProposal({
      _id: 'scheduled-2',
      title: 'Second Talk',
      format: Format.presentation_25,
    })
    const twoTalkSchedule: ConferenceSchedule = {
      _id: 'day-1',
      date: '2026-09-01',
      tracks: [
        {
          trackTitle: 'Main Stage',
          trackDescription: '',
          talks: [
            { talk: scheduledProposal, startTime: '10:00', endTime: '10:45' },
            { talk: talkB, startTime: '11:00', endTime: '11:25' },
          ],
        },
      ],
    }
    render(
      <MobileScheduleView
        schedules={[twoTalkSchedule]}
        currentDayIndex={0}
        unassignedProposals={[]}
        dispatch={dispatch}
        onDayChange={vi.fn()}
        onSave={vi.fn()}
        onAddTrack={vi.fn()}
        isSaving={false}
        saveSuccess={false}
        error={null}
      />,
    )

    // Pick up the keynote, then tap the second talk to swap.
    fireEvent.click(
      screen.getByRole('button', { name: 'Move Scheduled Keynote Talk' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Swap with Second Talk' }),
    )

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'moveProposal',
        dragItem: expect.objectContaining({
          type: 'scheduled-talk',
          proposal: expect.objectContaining({ _id: 'scheduled-1' }),
          sourceTrackIndex: 0,
          sourceTimeSlot: '10:00',
        }),
        dropPosition: { trackIndex: 0, timeSlot: '11:00' },
      }),
    )
  })

  it('assigns a fitting proposal by tapping an open slot', () => {
    const { dispatch } = setup()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Assign to open slot 08:00 to 10:00',
      }),
    )

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('Unassigned Lightning Talk'))

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'moveProposal',
        dragItem: expect.objectContaining({
          type: 'proposal',
          proposal: expect.objectContaining({ _id: 'unassigned-1' }),
        }),
        dropPosition: { trackIndex: 0, timeSlot: '08:00' },
      }),
    )
  })
})
