/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MobileScheduleView } from '@/components/admin/schedule/mobile'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { ConferenceSchedule } from '@/lib/conference/types'
import { toEditorSchedule } from '@/lib/schedule/types'

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
      schedules={[toEditorSchedule(schedule)]}
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

  it('opens the card action sheet and removes a talk', () => {
    const { dispatch } = setup()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Options for Scheduled Keynote Talk',
      }),
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Remove from schedule/ }),
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: 'removeTalk',
      trackIndex: 0,
      talkIndex: 0,
    })
  })

  it('exposes Rename / Change duration for a service and dispatches rename', () => {
    const dispatch = vi.fn()
    const withService: ConferenceSchedule = {
      _id: 'day-1',
      date: '2026-09-01',
      tracks: [
        {
          trackTitle: 'Main Stage',
          trackDescription: '',
          talks: [
            {
              placeholder: 'Coffee Break',
              startTime: '10:00',
              endTime: '10:15',
            },
          ],
        },
      ],
    }
    render(
      <MobileScheduleView
        schedules={[toEditorSchedule(withService)]}
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Options for Coffee Break' }),
    )
    const dialog = screen.getByRole('dialog')
    // The service actions are discoverable in the sheet.
    expect(
      within(dialog).getByRole('button', { name: 'Rename' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Change duration' }),
    ).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    const renameSheet = screen.getByRole('dialog')
    fireEvent.change(within(renameSheet).getByLabelText('Session title'), {
      target: { value: 'Lunch' },
    })
    fireEvent.click(within(renameSheet).getByRole('button', { name: 'Save' }))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'renameService',
      trackIndex: 0,
      talkIndex: 0,
      title: 'Lunch',
    })
  })

  it('creates a service session from within the slot-tap sheet (merged add flow)', () => {
    const { dispatch } = setup()
    // Tap an open slot → the unified "assign a talk OR create a service" sheet.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Assign to open slot 08:00 to 10:00',
      }),
    )
    const dialog = screen.getByRole('dialog')
    // Service creation now lives INSIDE the talk-selection sheet (no separate
    // per-track "Service" button anymore).
    expect(
      screen.queryByRole('button', { name: 'Service' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /Create service session here/,
      }),
    )
    // The service form fixes the start time to the tapped slot (08:00).
    const form = screen.getByRole('dialog')
    fireEvent.change(within(form).getByLabelText('Session title'), {
      target: { value: 'Coffee Break' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Add session' }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'addService',
        trackIndex: 0,
        title: 'Coffee Break',
        startTime: '08:00',
      }),
    )
  })

  it('swaps two talks: options → move or swap → tap the other', () => {
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
        schedules={[toEditorSchedule(twoTalkSchedule)]}
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

    // Open the keynote's sheet, choose Move or swap, then tap the second talk.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Options for Scheduled Keynote Talk',
      }),
    )
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Move or swap',
      }),
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

  it('renames a track (preserving its talks) via track options', () => {
    const { dispatch } = setup()
    fireEvent.click(screen.getAllByRole('button', { name: 'Track options' })[0])
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Rename track',
      }),
    )
    const sheet = screen.getByRole('dialog')
    fireEvent.change(within(sheet).getByLabelText('Track name'), {
      target: { value: 'Keynote Hall' },
    })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'updateTrack',
        trackIndex: 0,
        track: expect.objectContaining({
          trackTitle: 'Keynote Hall',
          // talks must be preserved on rename
          talks: expect.arrayContaining([
            expect.objectContaining({
              talk: expect.objectContaining({ _id: 'scheduled-1' }),
            }),
          ]),
        }),
      }),
    )
  })

  it('removes a track only after the confirm step', () => {
    const { dispatch } = setup()
    fireEvent.click(screen.getAllByRole('button', { name: 'Track options' })[0])
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Remove track',
      }),
    )
    // No removal yet — the menu button only opens the confirm step.
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'removeTrack' }),
    )
    // Confirm.
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Remove',
      }),
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: 'removeTrack',
      trackIndex: 0,
    })
  })

  it('duplicates a service to all tracks from the card sheet', () => {
    const dispatch = vi.fn()
    const withService: ConferenceSchedule = {
      _id: 'day-1',
      date: '2026-09-01',
      tracks: [
        {
          trackTitle: 'Main Stage',
          trackDescription: '',
          talks: [
            {
              placeholder: 'Coffee Break',
              startTime: '10:00',
              endTime: '10:15',
            },
          ],
        },
      ],
    }
    render(
      <MobileScheduleView
        schedules={[toEditorSchedule(withService)]}
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Options for Coffee Break' }),
    )
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Duplicate to all tracks',
      }),
    )
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'duplicateService',
        sourceTrackIndex: 0,
        serviceSession: expect.objectContaining({
          placeholder: 'Coffee Break',
        }),
      }),
    )
  })
})
