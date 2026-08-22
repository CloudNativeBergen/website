/**
 * @vitest-environment jsdom
 */
import { render, screen, act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScheduleEditor } from '@/components/admin/schedule/ScheduleEditor'
import { ConferenceSchedule, Conference } from '@/lib/conference/types'
import { toEditorSchedule, ScheduleStatus } from '@/lib/schedule/types'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'

/* -------------------------------------------------------------------------- */
/* tRPC / router mocks                                                        */
/* -------------------------------------------------------------------------- */

const {
  saveMutateAsync,
  actionMutateAsync,
  pollInvalidate,
  pollSetData,
  pollData,
  routerRefresh,
} = vi.hoisted(() => ({
  saveMutateAsync: vi.fn(),
  actionMutateAsync: vi.fn(),
  pollInvalidate: vi.fn(),
  pollSetData: vi.fn(),
  // Mutable box so a test can decide what the poll query "returns".
  pollData: { current: undefined as unknown },
  routerRefresh: vi.fn(),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      schedule: {
        admin: {
          pollExternalChanges: {
            invalidate: pollInvalidate,
            setData: pollSetData,
          },
        },
      },
    }),
    schedule: {
      save: { useMutation: () => ({ mutateAsync: saveMutateAsync }) },
      action: { useMutation: () => ({ mutateAsync: actionMutateAsync }) },
      admin: {
        // The single poll: schedule revisions plus a fingerprint of the talk
        // set. `pollData` holds the SCHEDULES half so these cases read as they
        // did before the merge.
        pollExternalChanges: {
          useQuery: () => ({
            data: pollData.current
              ? {
                  schedules: pollData.current,
                  proposalsFingerprint: 'fp-1',
                }
              : undefined,
          }),
        },
        proposalsStatus: { useQuery: () => ({ data: undefined }) },
      },
    },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}))

// The unassigned sidebar's filter bar observes intersections; jsdom has no
// IntersectionObserver.
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  },
)

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const proposal: ProposalExisting = {
  _id: 'talk-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title: 'Keynote',
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
}

const draftDay: ConferenceSchedule = {
  _id: 'draft-1',
  _rev: 'rev-1',
  date: '2026-09-01',
  status: 'draft',
  tracks: [
    {
      trackTitle: 'Main Stage',
      trackDescription: '',
      talks: [{ talk: proposal, startTime: '10:00', endTime: '10:45' }],
    },
  ],
} as ConferenceSchedule

const officialDay: ConferenceSchedule = {
  ...draftDay,
  _id: 'official-1',
  _rev: 'official-rev-1',
  status: ScheduleStatus.Official,
}

const conference = { _id: 'conf-1' } as Conference

const renderEditor = () =>
  render(
    <ScheduleEditor
      officialSchedules={[toEditorSchedule(officialDay)]}
      draftSchedules={[toEditorSchedule(draftDay)]}
      conference={conference}
      initialProposals={[proposal]}
    />,
  )

/** The per-talk remove button (title="Remove from schedule"). */
const removeButtons = () =>
  screen.queryAllByRole('button', { name: 'Remove from schedule' })

const modeSwitch = () => screen.getByRole('switch')

const EXTERNAL_BANNER = /new external changes/i

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  pollData.current = undefined
  saveMutateAsync.mockReset()
  actionMutateAsync.mockReset()
  pollSetData.mockReset()
  pollInvalidate.mockReset()
  routerRefresh.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Let the 3s autosave debounce fire and its promise settle. */
const runAutosave = async () => {
  await act(async () => {
    vi.advanceTimersByTime(3100)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

describe('ScheduleEditor — external-change detection', () => {
  it('does not flag the user’s OWN save as an external change (stale poll cache)', async () => {
    // The poll cache still holds the revision that the save is about to
    // replace — this is the normal state for most of the poll interval.
    pollData.current = [{ _id: 'draft-1', _rev: 'rev-1', version: 1 }]
    saveMutateAsync.mockResolvedValue({
      schedule: { ...draftDay, _rev: 'rev-2' },
    })

    renderEditor()
    act(() => {
      removeButtons()[0].click()
    })
    await runAutosave()

    expect(saveMutateAsync).toHaveBeenCalledTimes(1)
    // Local _rev is now rev-2, the polled one is still rev-1 — but rev-1 is a
    // revision WE held, so it is not a foreign change.
    expect(screen.queryByText(EXTERNAL_BANNER)).not.toBeInTheDocument()
    // The polled baseline was advanced rather than left stale.
    expect(pollSetData).toHaveBeenCalled()
  })

  it('still flags a revision this client has never held', () => {
    pollData.current = [
      { _id: 'draft-1', _rev: 'somebody-elses-rev', version: 9 },
    ]
    renderEditor()
    expect(screen.getByText(EXTERNAL_BANNER)).toBeInTheDocument()
  })
})

describe('ScheduleEditor — autosave failure handling', () => {
  it('stops retrying a failing save until the user changes something', async () => {
    saveMutateAsync.mockRejectedValue(new Error('Double booking'))

    renderEditor()
    act(() => {
      removeButtons()[0].click()
    })

    await runAutosave()
    expect(saveMutateAsync).toHaveBeenCalledTimes(1)

    // Ten more autosave windows: the same rejected payload must NOT be replayed.
    for (let i = 0; i < 10; i++) {
      await runAutosave()
    }
    expect(saveMutateAsync).toHaveBeenCalledTimes(1)

    // The edit is kept, not dropped, and the pause is surfaced.
    expect(screen.getByText(/autosave is paused/i)).toBeInTheDocument()
  })

  it('re-arms autosave as soon as the user edits again', async () => {
    saveMutateAsync.mockRejectedValue(new Error('Double booking'))

    // Two talks so a second edit is available after the first failure.
    const twoTalkDraft: ConferenceSchedule = {
      ...draftDay,
      tracks: [
        {
          trackTitle: 'Main Stage',
          trackDescription: '',
          talks: [
            { talk: proposal, startTime: '10:00', endTime: '10:45' },
            {
              talk: { ...proposal, _id: 'talk-2', title: 'Second' },
              startTime: '11:00',
              endTime: '11:45',
            },
          ],
        },
      ],
    } as ConferenceSchedule

    render(
      <ScheduleEditor
        officialSchedules={[toEditorSchedule(officialDay)]}
        draftSchedules={[toEditorSchedule(twoTalkDraft)]}
        conference={conference}
        initialProposals={[proposal]}
      />,
    )

    act(() => {
      removeButtons()[0].click()
    })
    await runAutosave()
    expect(saveMutateAsync).toHaveBeenCalledTimes(1)

    await runAutosave()
    expect(saveMutateAsync).toHaveBeenCalledTimes(1)

    // A new edit invalidates the parked payload → autosave tries once more.
    act(() => {
      removeButtons()[0].click()
    })
    await runAutosave()
    expect(saveMutateAsync).toHaveBeenCalledTimes(2)
  })
})

describe('ScheduleEditor — live (read-only) mode', () => {
  it('removes every editing affordance when showing the live schedule', () => {
    renderEditor()
    // Draft: editable.
    expect(removeButtons().length).toBe(1)
    expect(
      screen.getAllByRole('button', { name: /^Drag / }).length,
    ).toBeGreaterThan(0)

    act(() => {
      modeSwitch().click()
    })

    // Live: no remove, no drag handles, no save, no track add.
    expect(removeButtons().length).toBe(0)
    expect(screen.queryByRole('button', { name: /^Drag / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
    expect(
      (screen.getByRole('button', { name: /Track/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('asks before a mode switch would discard unsaved changes, and keeps them on cancel', async () => {
    // Autosave never completes here (the save hangs), so the day stays dirty.
    saveMutateAsync.mockImplementation(() => new Promise(() => {}))
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockImplementation(() => false)

    renderEditor()
    act(() => {
      removeButtons()[0].click()
    })
    expect(removeButtons().length).toBe(0) // the talk is gone locally

    act(() => {
      modeSwitch().click()
    })

    expect(confirmSpy).toHaveBeenCalled()
    // Cancelled → still in draft mode and the local edit survives (the talk is
    // still unscheduled; it went back to the unassigned sidebar).
    expect(modeSwitch()).toHaveAttribute('aria-checked', 'true')
    expect(removeButtons().length).toBe(0)

    confirmSpy.mockRestore()
  })
})
