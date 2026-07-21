/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { Widget } from '@/lib/dashboard/types'
import type { Conference } from '@/lib/conference/types'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  loadDashboardConfig,
  saveDashboardConfig,
} from '@/app/(admin)/admin/actions'
import { AdminDashboard } from './AdminDashboard'

vi.mock('@/app/(admin)/admin/actions', () => ({
  loadDashboardConfig: vi.fn(),
  saveDashboardConfig: vi.fn(),
}))

// The widget renderer transitively imports every widget implementation
// (charts, data fetching, …); none of that matters for persistence behavior.
vi.mock('@/components/admin/dashboard/widget-renderer', () => ({
  renderWidgetContent: () => null,
}))

// Replace the dnd-kit grid with a button that simulates the grid reporting a
// completed user drag — the only code path that calls onWidgetsChange in the
// real DashboardGrid.
vi.mock('@/components/admin/dashboard/DashboardGrid', () => ({
  DashboardGrid: ({
    widgets,
    onWidgetsChange,
  }: {
    widgets: Widget[]
    onWidgetsChange: (widgets: Widget[]) => void
  }) => (
    <button
      onClick={() =>
        onWidgetsChange(
          widgets.map((w, i) =>
            i === 0
              ? { ...w, position: { ...w.position, row: w.position.row + 1 } }
              : w,
          ),
        )
      }
    >
      simulate-drag
    </button>
  ),
}))

const conference = { _id: 'conf-1', title: 'Test Conf' } as Conference

const savedWidgets = [
  {
    id: 'review-progress-1',
    type: 'review-progress',
    title: 'Review Progress',
    position: { row: 0, col: 0, rowSpan: 3, colSpan: 3 },
    config: undefined,
  },
]

function renderDashboard() {
  return render(
    <NotificationProvider>
      <AdminDashboard conference={conference} />
    </NotificationProvider>,
  )
}

/** Flush the pending loadDashboardConfig promise chain. */
async function flushLoad() {
  await act(async () => {
    await Promise.resolve()
  })
}

/** Advance past the save debounce and flush any save promise. */
async function advancePastDebounce(ms = 3000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function simulateDrag() {
  await act(async () => {
    fireEvent.click(screen.getByText('simulate-drag'))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(saveDashboardConfig).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('AdminDashboard persistence', () => {
  it('load failure: performs NO save without user action and warns the user', async () => {
    // Regression: the load .catch used to enable persistence, which made the
    // widgets-change effect auto-save DEFAULT_WIDGETS over the stored config.
    vi.mocked(loadDashboardConfig).mockRejectedValue(new Error('offline'))

    renderDashboard()
    await flushLoad()

    expect(
      screen.getByText("Couldn't load your dashboard layout"),
    ).toBeInTheDocument()

    await advancePastDebounce()
    expect(saveDashboardConfig).not.toHaveBeenCalled()
  })

  it('load failure: a user drag STILL performs no save (session persistence disabled)', async () => {
    vi.mocked(loadDashboardConfig).mockRejectedValue(new Error('offline'))

    renderDashboard()
    await flushLoad()

    await simulateDrag()
    await advancePastDebounce()

    expect(saveDashboardConfig).not.toHaveBeenCalled()
  })

  it('load success: no echo-write of the freshly loaded layout', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    renderDashboard()
    await flushLoad()
    await advancePastDebounce()

    expect(saveDashboardConfig).not.toHaveBeenCalled()
  })

  it('load success + user drag: exactly one debounced save', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    renderDashboard()
    await flushLoad()

    await simulateDrag()
    // Not yet — the save is debounced
    expect(saveDashboardConfig).not.toHaveBeenCalled()

    await advancePastDebounce()
    expect(saveDashboardConfig).toHaveBeenCalledTimes(1)
    expect(saveDashboardConfig).toHaveBeenCalledWith(
      'conf-1',
      expect.arrayContaining([
        expect.objectContaining({ id: 'review-progress-1' }),
      ]),
    )
  })

  it('save failure: surfaces an error toast while keeping local state', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)
    vi.mocked(saveDashboardConfig).mockRejectedValue(new Error('offline'))

    renderDashboard()
    await flushLoad()

    await simulateDrag()
    await advancePastDebounce()

    expect(saveDashboardConfig).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText("Couldn't save your dashboard layout"),
    ).toBeInTheDocument()
  })

  it('reset requires confirmation; cancelling neither resets nor saves', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    renderDashboard()
    await flushLoad()

    // Enter edit mode (jsdom innerWidth 1024 → desktop controls visible)
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Reset$/ }))

    expect(screen.getByText('Reset dashboard layout?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await advancePastDebounce()
    expect(saveDashboardConfig).not.toHaveBeenCalled()
  })

  it('confirming reset applies the default layout and persists it', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    renderDashboard()
    await flushLoad()

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Reset$/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }))
    })

    await advancePastDebounce()
    expect(saveDashboardConfig).toHaveBeenCalledTimes(1)
  })
})
