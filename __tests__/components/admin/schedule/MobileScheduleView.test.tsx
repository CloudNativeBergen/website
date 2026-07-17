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
  it('renders the selected track agenda', () => {
    setup()
    expect(screen.getByRole('tab', { name: 'Main Stage' })).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Workshop Room' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Scheduled Keynote Talk')).toBeInTheDocument()
    expect(screen.getByText('10:00–10:45')).toBeInTheDocument()
  })

  it('switches the visible agenda when another track tab is selected', () => {
    setup()
    fireEvent.click(screen.getByRole('tab', { name: 'Workshop Room' }))
    expect(
      screen.getByText('Nothing scheduled in this track yet.'),
    ).toBeInTheDocument()
  })

  it('lists unassigned proposals in the assign sheet', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Assign a talk' }))
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByText('Unassigned Lightning Talk'),
    ).toBeInTheDocument()
  })

  it('dispatches moveProposal when assigning a talk', () => {
    const { dispatch } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Assign a talk' }))

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('Unassigned Lightning Talk'))

    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'moveProposal',
        dragItem: expect.objectContaining({
          type: 'proposal',
          proposal: expect.objectContaining({ _id: 'unassigned-1' }),
        }),
        dropPosition: expect.objectContaining({ trackIndex: 0 }),
      }),
    )
  })

  it('dispatches removeTalk from a card action sheet', () => {
    const { dispatch } = setup()
    fireEvent.click(
      screen.getByRole('button', { name: /Scheduled Keynote Talk/ }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: /Remove from schedule/ }),
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: 'removeTalk',
      trackIndex: 0,
      talkIndex: 0,
    })
  })
})
