import type { Widget, GridPosition } from './types'

/**
 * Find the first available position for a widget with given dimensions
 * Scans the grid from top-left to bottom-right
 */
export function findAvailablePosition(
  colSpan: number,
  rowSpan: number,
  existingWidgets: Widget[],
  columnCount: number,
): GridPosition {
  // Create a 2D grid to track occupied cells
  const maxRows = Math.max(
    ...existingWidgets.map((w) => w.position.row + w.position.rowSpan),
    10, // Minimum grid height
  )

  const grid: boolean[][] = Array.from({ length: maxRows + rowSpan }, () =>
    Array(columnCount).fill(false),
  )

  // Mark occupied cells
  existingWidgets.forEach((widget) => {
    const { row, col, rowSpan: wRowSpan, colSpan: wColSpan } = widget.position
    for (let r = row; r < row + wRowSpan; r++) {
      for (let c = col; c < col + wColSpan; c++) {
        if (r < grid.length && c < columnCount) {
          grid[r][c] = true
        }
      }
    }
  })

  // Scan for available space
  for (let row = 0; row < grid.length - rowSpan + 1; row++) {
    for (let col = 0; col <= columnCount - colSpan; col++) {
      let canPlace = true

      // Check if all required cells are free
      for (let r = row; r < row + rowSpan && canPlace; r++) {
        for (let c = col; c < col + colSpan && canPlace; c++) {
          if (grid[r]?.[c]) {
            canPlace = false
          }
        }
      }

      if (canPlace) {
        return { row, col, rowSpan, colSpan }
      }
    }
  }

  // If no space found, place at the bottom
  const bottomRow = Math.max(
    ...existingWidgets.map((w) => w.position.row + w.position.rowSpan),
    0,
  )

  return {
    row: bottomRow,
    col: 0,
    rowSpan,
    colSpan: Math.min(colSpan, columnCount),
  }
}
