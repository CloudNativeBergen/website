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

// No real widget type sets hideInIrrelevantPhases yet; fabricate one so the
// phase-filter → merge-by-id interaction can be exercised.
vi.mock('@/lib/dashboard/widget-registry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/dashboard/widget-registry')>()
  return {
    ...actual,
    getWidgetMetadata: (type: string) => {
      if (type === 'phase-hidden-widget') {
        return {
          ...actual.getWidgetMetadata('review-progress')!,
          type: 'phase-hidden-widget',
          // Relevant in NO phase + hide → always filtered from the grid
          phaseConfig: { relevantPhases: [], hideInIrrelevantPhases: true },
        }
      }
      return actual.getWidgetMetadata(type)
    },
  }
})

// Replace the dnd-kit grid with a button that simulates the grid reporting a
// completed user drag — the only code path that calls onWidgetsChange in the
// real DashboardGrid. The children render prop is still invoked so the real
// WidgetContainer (edit controls incl. the remove button) is exercised.
vi.mock('@/components/admin/dashboard/DashboardGrid', () => ({
  DashboardGrid: ({
    widgets,
    onWidgetsChange,
    children,
  }: {
    widgets: Widget[]
    onWidgetsChange: (widgets: Widget[]) => void
    children: (
      widget: Widget,
      isDragging: boolean,
      cellWidth: number,
    ) => React.ReactNode
  }) => (
    <div>
      <div data-testid="widget-count">{widgets.length}</div>
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
      {widgets.map((w) => children(w, false, 96))}
    </div>
  ),
}))

// HeadlessUI's Menu (used by the PresetMenu layout picker) requires
// ResizeObserver, which jsdom does not implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

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
      expect.arrayContaining([
        expect.objectContaining({ id: 'review-progress-1' }),
      ]),
    )
  })

  it('empty-array load renders an EMPTY dashboard (no defaults) and no save', async () => {
    // An existing personal doc with widgets: [] means the user deliberately
    // cleared their dashboard — defaults apply only on a null load.
    vi.mocked(loadDashboardConfig).mockResolvedValue([])

    renderDashboard()
    await flushLoad()

    expect(screen.getByTestId('widget-count').textContent).toBe('0')

    await advancePastDebounce()
    expect(saveDashboardConfig).not.toHaveBeenCalled()
  })

  it('null load falls back to the default preset widgets', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(null)

    renderDashboard()
    await flushLoad()

    expect(
      Number(screen.getByTestId('widget-count').textContent),
    ).toBeGreaterThan(0)

    await advancePastDebounce()
    expect(saveDashboardConfig).not.toHaveBeenCalled()
  })

  it('unmount with a pending debounced edit FLUSHES the save immediately', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    const { unmount } = renderDashboard()
    await flushLoad()

    await simulateDrag()
    // Still inside the debounce window — nothing sent yet
    expect(saveDashboardConfig).not.toHaveBeenCalled()

    await act(async () => {
      unmount()
    })

    expect(saveDashboardConfig).toHaveBeenCalledTimes(1)
    expect(saveDashboardConfig).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'review-progress-1' }),
      ]),
    )
    // The cleared timer must not fire a second save afterwards
    await advancePastDebounce()
    expect(saveDashboardConfig).toHaveBeenCalledTimes(1)
  })

  it('unmount with no pending edit performs no save', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    const { unmount } = renderDashboard()
    await flushLoad()

    await act(async () => {
      unmount()
    })

    expect(saveDashboardConfig).not.toHaveBeenCalled()
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

  it('a drag never deletes widgets hidden in the current phase (merge-by-id)', async () => {
    // Regression: the grid receives the phase-FILTERED widget list, and
    // handleWidgetsChange used to REPLACE full state with the grid's array —
    // any hidden widget was silently deleted (and unsaved) by the next drag.
    vi.mocked(loadDashboardConfig).mockResolvedValue([
      ...savedWidgets,
      {
        id: 'hidden-1',
        type: 'phase-hidden-widget',
        title: 'Hidden Widget',
        position: { row: 5, col: 0, rowSpan: 2, colSpan: 3 },
        config: undefined,
      },
    ])

    renderDashboard()
    await flushLoad()

    // The grid only sees the visible widget…
    expect(screen.getByTestId('widget-count').textContent).toBe('1')

    await simulateDrag()
    await advancePastDebounce()

    // …but the persisted layout still contains BOTH widgets, with the
    // dragged one's new position applied.
    expect(saveDashboardConfig).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(saveDashboardConfig).mock.calls[0][0]
    expect(payload).toHaveLength(2)
    expect(payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'hidden-1' }),
        expect.objectContaining({
          id: 'review-progress-1',
          position: expect.objectContaining({ row: 1 }),
        }),
      ]),
    )
  })

  it('removing a widget requires confirmation; cancelling keeps it', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    renderDashboard()
    await flushLoad()

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Review Progress widget' }),
    )

    expect(screen.getByText('Remove widget?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await advancePastDebounce()
    expect(screen.getByTestId('widget-count').textContent).toBe('1')
    expect(saveDashboardConfig).not.toHaveBeenCalled()
  })

  it('confirming widget removal removes it and persists', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    renderDashboard()
    await flushLoad()

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Review Progress widget' }),
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove widget' }))
    })

    expect(screen.getByTestId('widget-count').textContent).toBe('0')

    await advancePastDebounce()
    expect(saveDashboardConfig).toHaveBeenCalledTimes(1)
    expect(saveDashboardConfig).toHaveBeenCalledWith([])
  })

  it('the Layout picker lists every preset with the default marked', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    renderDashboard()
    await flushLoad()

    // Enter edit mode (jsdom innerWidth 1024 → desktop controls visible)
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    fireEvent.click(screen.getByRole('button', { name: /Layout/ }))

    expect(
      screen.getByRole('menuitem', { name: /Planning Focus/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /Execution Focus/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /Financial Focus/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /Comprehensive/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Empty/ })).toBeInTheDocument()
    // The planning preset doubles as "reset to default" and is marked
    expect(
      screen.getByRole('menuitem', { name: /Planning Focus/ }),
    ).toHaveTextContent('Default')
  })

  it('applying a preset requires confirmation; cancelling neither applies nor saves', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    renderDashboard()
    await flushLoad()

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    fireEvent.click(screen.getByRole('button', { name: /Layout/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Execution Focus/ }))

    expect(
      screen.getByText('Apply "Execution Focus" layout?'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await advancePastDebounce()
    // Layout untouched, nothing saved
    expect(screen.getByTestId('widget-count').textContent).toBe('1')
    expect(saveDashboardConfig).not.toHaveBeenCalled()
  })

  it('confirming a preset replaces the layout and persists it', async () => {
    vi.mocked(loadDashboardConfig).mockResolvedValue(savedWidgets)

    renderDashboard()
    await flushLoad()

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    fireEvent.click(screen.getByRole('button', { name: /Layout/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Execution Focus/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply layout' }))
    })

    // Execution preset has 6 widgets (see presets.ts)
    expect(screen.getByTestId('widget-count').textContent).toBe('6')

    await advancePastDebounce()
    expect(saveDashboardConfig).toHaveBeenCalledTimes(1)
    expect(saveDashboardConfig).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'schedule-builder' }),
      ]),
    )
  })
})
