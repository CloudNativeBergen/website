/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'

import type { Widget } from '@/lib/dashboard/types'
import { WidgetContainer } from './WidgetContainer'

afterEach(cleanup)

// 'review-progress' has real registry constraints: minCols 3, maxCols 4,
// minRows 2, maxRows 4.
const makeWidget = (overrides: Partial<Widget> = {}): Widget => ({
  id: 'w-1',
  type: 'review-progress',
  title: 'Review Progress',
  position: { row: 0, col: 0, rowSpan: 3, colSpan: 3 },
  ...overrides,
})

// GRID_CONFIG: cellSize 96, gap 16 → one grid step is 112px
const STEP = 112

function renderContainer(widget: Widget, allWidgets: Widget[] = [widget]) {
  const onResize = vi.fn()
  const utils = render(
    <WidgetContainer
      widget={widget}
      editMode
      isDragging={false}
      columnCount={12}
      cellWidth={96}
      allWidgets={allWidgets}
      onResize={onResize}
    >
      <div>content</div>
    </WidgetContainer>,
  )
  const handle = utils.container.querySelector('.cursor-nwse-resize')
  if (!handle) throw new Error('resize handle not rendered')
  return { onResize, handle, ...utils }
}

describe('WidgetContainer resize', () => {
  it('applies a resize clamped to the registry max constraints', () => {
    const { onResize, handle } = renderContainer(makeWidget())

    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    // +5 columns requested (3 → 8), but review-progress maxCols is 4
    fireEvent.pointerMove(window, { clientX: STEP * 5, clientY: 0 })
    fireEvent.pointerUp(window)

    expect(onResize).toHaveBeenCalledTimes(1)
    expect(onResize).toHaveBeenCalledWith('w-1', {
      row: 0,
      col: 0,
      rowSpan: 3,
      colSpan: 4,
    })
  })

  it('clamps shrinking to the registry min constraints', () => {
    const { onResize, handle } = renderContainer(makeWidget())

    fireEvent.pointerDown(handle, { clientX: 500, clientY: 500, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 500 - STEP * 5, clientY: 500 })
    fireEvent.pointerUp(window)

    expect(onResize).toHaveBeenCalledWith('w-1', {
      row: 0,
      col: 0,
      rowSpan: 3,
      colSpan: 3, // minCols
    })
  })

  it('caps widening at the grid edge without going below minCols', () => {
    // col 9 in a 12-column grid leaves exactly minCols (3) of space
    const widget = makeWidget({
      position: { row: 0, col: 9, rowSpan: 3, colSpan: 3 },
    })
    const { onResize, handle } = renderContainer(widget)

    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: STEP * 3, clientY: 0 })
    fireEvent.pointerUp(window)

    expect(onResize).toHaveBeenCalledWith('w-1', {
      row: 0,
      col: 9,
      rowSpan: 3,
      colSpan: 3, // capped at the edge, still >= minCols
    })
  })

  it('freezes colSpan when the space at the edge cannot fit minCols', () => {
    // col 10 leaves 2 columns < minCols 3: horizontal resize is frozen at the
    // current span (any clamp would overflow the grid or undercut the
    // registry minimum); vertical resizing still applies.
    const widget = makeWidget({
      position: { row: 0, col: 10, rowSpan: 3, colSpan: 2 },
    })
    const { onResize, handle } = renderContainer(widget)

    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: STEP * 3, clientY: STEP })
    fireEvent.pointerUp(window)

    expect(onResize).toHaveBeenCalledWith('w-1', {
      row: 0,
      col: 10,
      rowSpan: 4,
      colSpan: 2, // frozen, not widened past the edge nor clamped below min
    })
  })

  it('does not apply a resize that collides with another widget', () => {
    const widget = makeWidget()
    const neighbor = makeWidget({
      id: 'w-2',
      position: { row: 0, col: 3, rowSpan: 3, colSpan: 3 },
    })
    const { onResize, handle } = renderContainer(widget, [widget, neighbor])

    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    // 3 → 4 columns would overlap the neighbor at col 3
    fireEvent.pointerMove(window, { clientX: STEP, clientY: 0 })
    fireEvent.pointerUp(window)

    expect(onResize).not.toHaveBeenCalled()
  })

  it('pointercancel aborts the resize without applying the preview', () => {
    const { onResize, handle } = renderContainer(makeWidget())

    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: STEP, clientY: 0 })
    fireEvent(window, new Event('pointercancel'))
    // A later pointerup must be a no-op: the gesture is over
    fireEvent.pointerUp(window)

    expect(onResize).not.toHaveBeenCalled()
  })
})
