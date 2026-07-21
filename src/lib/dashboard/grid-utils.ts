import type { Widget, GridPosition } from './types'
import { GRID_CONFIG } from './constants'

/**
 * Reflows widget positions for a target column count.
 * Widgets are sorted by their original (row, col) position and packed
 * greedily into the target grid. For single-column mode, widgets stack
 * full-width. Stored config always stays in 12-col format — reflow is
 * display-only.
 */
export function reflowWidgetsForColumns(
  widgets: Widget[],
  targetCols: number,
): Widget[] {
  const desktopCols = GRID_CONFIG.breakpoints.desktop.cols
  if (targetCols >= desktopCols) return widgets

  // Sort by original position: top-to-bottom, left-to-right
  const sorted = [...widgets].sort((a, b) => {
    if (a.position.row !== b.position.row)
      return a.position.row - b.position.row
    return a.position.col - b.position.col
  })

  // Single column: stack full-width, auto-height
  if (targetCols === 1) {
    let currentRow = 0
    return sorted.map((widget) => ({
      ...widget,
      position: {
        row: currentRow++,
        col: 0,
        rowSpan: 1, // auto-height handles sizing
        colSpan: 1,
      },
    }))
  }

  // Multi-column (tablet): greedy row-packing
  // Track the next available row for each column
  const colHeights = new Array(targetCols).fill(0)

  return sorted.map((widget) => {
    const colSpan = Math.min(widget.position.colSpan, targetCols)

    // Find the first row where this widget fits without overlapping
    let bestRow = Infinity
    let bestCol = 0

    for (let c = 0; c <= targetCols - colSpan; c++) {
      // The widget needs columns c..c+colSpan-1
      // Find the max height across those columns
      let maxHeight = 0
      for (let cc = c; cc < c + colSpan; cc++) {
        maxHeight = Math.max(maxHeight, colHeights[cc])
      }
      if (maxHeight < bestRow) {
        bestRow = maxHeight
        bestCol = c
      }
    }

    const rowSpan = widget.position.rowSpan

    // Update column heights
    for (let cc = bestCol; cc < bestCol + colSpan; cc++) {
      colHeights[cc] = bestRow + rowSpan
    }

    return {
      ...widget,
      position: {
        row: bestRow,
        col: bestCol,
        rowSpan,
        colSpan,
      },
    }
  })
}

/**
 * Builds a map of occupied grid cells for collision detection
 */
export function buildOccupationMap(widgets: Widget[]): Map<string, string> {
  const occupationMap = new Map<string, string>()

  widgets.forEach((widget) => {
    const { row, col, rowSpan, colSpan } = widget.position

    for (let r = row; r < row + rowSpan; r++) {
      for (let c = col; c < col + colSpan; c++) {
        const key = `${r}-${c}`
        occupationMap.set(key, widget.id)
      }
    }
  })

  return occupationMap
}

/**
 * Gets all cell keys that a position occupies
 */
export function getCellsForPosition(position: GridPosition): string[] {
  const cells: string[] = []
  const { row, col, rowSpan, colSpan } = position

  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) {
      cells.push(`${r}-${c}`)
    }
  }

  return cells
}

/**
 * Checks if a position would collide with existing widgets or exceed grid bounds
 * @param position - The grid position to check
 * @param widgets - Array of existing widgets
 * @param excludeWidgetId - Optional widget ID to exclude from collision check (for moving)
 * @param maxCols - Maximum number of columns in the grid
 * @returns true if collision detected, false otherwise
 */
export function checkCollision(
  position: GridPosition,
  widgets: Widget[],
  excludeWidgetId?: string,
  maxCols?: number,
): boolean {
  if (maxCols && position.col + position.colSpan > maxCols) {
    return true
  }

  if (position.col < 0 || position.row < 0) {
    return true
  }

  const filteredWidgets = excludeWidgetId
    ? widgets.filter((w) => w.id !== excludeWidgetId)
    : widgets

  const occupationMap = buildOccupationMap(filteredWidgets)
  const targetCells = getCellsForPosition(position)

  return targetCells.some((cell) => occupationMap.has(cell))
}

/**
 * Converts pixel coordinates to grid coordinates with snapping
 * @param pixelX - X coordinate in pixels
 * @param pixelY - Y coordinate in pixels
 * @param cellWidth - Width of each grid cell
 * @param cellHeight - Height of each grid cell
 * @param gap - Gap between cells
 * @param maxCols - Maximum columns to clamp to
 * @param colSpan - Column span of the widget being placed (default 1). The
 *   clamp must account for it: clamping to `maxCols - 1` let multi-column
 *   widgets snap to columns where they overflow the grid, which always
 *   collided and made right-edge drags silently snap back.
 * @returns Grid coordinates {row, col}
 */
export function snapToGrid(
  pixelX: number,
  pixelY: number,
  cellWidth: number,
  cellHeight: number,
  gap: number,
  maxCols?: number,
  colSpan = 1,
): { row: number; col: number } {
  const colWidthWithGap = cellWidth + gap
  const rowHeightWithGap = cellHeight + gap

  let col = Math.max(0, Math.round(pixelX / colWidthWithGap))
  const row = Math.max(0, Math.round(pixelY / rowHeightWithGap))

  if (maxCols !== undefined) {
    col = Math.min(col, Math.max(0, maxCols - colSpan))
  }

  return { row, col }
}

/**
 * Computes where a dragged widget lands: snaps the drag delta to the grid
 * (clamped so the widget's span stays inside the columns) and rejects
 * positions that collide with other widgets.
 *
 * This is DashboardGrid's drag-end semantics extracted so the interaction
 * logic is unit-testable without simulating dnd-kit pointer events.
 *
 * @returns The new position, or null when the drop must snap back (collision)
 *   or lands exactly where the widget already is (no-op).
 */
export function computeDropPosition(
  widget: Widget,
  delta: { x: number; y: number },
  cellWidth: number,
  widgets: Widget[],
  columnCount: number,
): GridPosition | null {
  const cellWithGap = cellWidth + GRID_CONFIG.gap
  const rowWithGap = GRID_CONFIG.cellSize + GRID_CONFIG.gap
  const { position } = widget

  const snapped = snapToGrid(
    position.col * cellWithGap + delta.x,
    position.row * rowWithGap + delta.y,
    cellWidth,
    GRID_CONFIG.cellSize,
    GRID_CONFIG.gap,
    columnCount,
    position.colSpan,
  )

  if (snapped.row === position.row && snapped.col === position.col) return null

  const newPosition: GridPosition = {
    ...position,
    row: snapped.row,
    col: snapped.col,
  }

  if (checkCollision(newPosition, widgets, widget.id, columnCount)) return null

  return newPosition
}

/**
 * Determines the number of grid columns based on viewport width
 * @param width - Viewport width in pixels
 * @returns Number of columns (12 for desktop, 6 for tablet, 4 for mobile)
 */
export function getColumnCountForWidth(width: number): number {
  const { breakpoints } = GRID_CONFIG
  if (width >= breakpoints.desktop.minWidth) return breakpoints.desktop.cols
  if (width >= breakpoints.tablet.minWidth) return breakpoints.tablet.cols
  return breakpoints.mobile.cols
}
