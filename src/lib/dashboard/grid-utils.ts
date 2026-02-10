import type { Widget, GridPosition } from './types'
import { GRID_CONFIG } from './constants'

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
 * @returns Grid coordinates {row, col}
 */
export function snapToGrid(
  pixelX: number,
  pixelY: number,
  cellWidth: number,
  cellHeight: number,
  gap: number,
  maxCols?: number,
): { row: number; col: number } {
  const colWidthWithGap = cellWidth + gap
  const rowHeightWithGap = cellHeight + gap

  let col = Math.max(0, Math.round(pixelX / colWidthWithGap))
  const row = Math.max(0, Math.round(pixelY / rowHeightWithGap))

  if (maxCols !== undefined) {
    col = Math.min(col, maxCols - 1)
  }

  return { row, col }
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
