import type { Widget, GridPosition } from './types'
import { MIN_GRID_ROWS } from './constants'
import { buildOccupationMap, getCellsForPosition } from './grid-utils'

/**
 * Hard cap on how many rows the placement scan will ever consider. Stored
 * positions are server-validated to row ≤ 500, but keep a local guard so a
 * pathological input (e.g. a widget claiming row 1e9) can't make the scan
 * allocate/iterate unboundedly.
 */
const MAX_SEARCH_ROWS = 600

/**
 * Find the first available position for a widget with given dimensions.
 * Scans the grid from top-left to bottom-right.
 *
 * Collision semantics are shared with the drag/resize path via the grid-utils
 * primitives (buildOccupationMap / getCellsForPosition) — placement must never
 * disagree with drag-time collision detection.
 */
/** Mirror of the server-side span bound (MAX_ROW_SPAN in the save validator). */
const MAX_PLACEMENT_ROW_SPAN = 24

export function findAvailablePosition(
  colSpan: number,
  rowSpan: number,
  existingWidgets: Widget[],
  columnCount: number,
): GridPosition {
  const clampedColSpan = Math.min(colSpan, columnCount)
  // The requested span is registry-sourced at today's call sites, but this is
  // an exported utility: clamp defensively so a pathological rowSpan can't
  // make getCellsForPosition iterate rowSpan*colSpan cells unboundedly.
  rowSpan = Math.max(1, Math.min(rowSpan, MAX_PLACEMENT_ROW_SPAN))

  // Bound each widget's cell range BEFORE building the occupation map: a
  // pathological row/rowSpan would otherwise make the map itself explode
  // long before the scan below. Cells past the cap can't affect placement —
  // the scan never looks there.
  const bounded = existingWidgets.map((w) => ({
    ...w,
    position: {
      ...w.position,
      row: Math.min(w.position.row, MAX_SEARCH_ROWS),
      rowSpan: Math.min(w.position.rowSpan, MAX_SEARCH_ROWS),
    },
  }))
  const occupied = buildOccupationMap(bounded)

  const contentBottom = bounded.reduce(
    (max, w) => Math.max(max, w.position.row + w.position.rowSpan),
    0,
  )

  const searchRows = Math.min(
    Math.max(contentBottom, MIN_GRID_ROWS) + rowSpan,
    MAX_SEARCH_ROWS,
  )

  // Scan for available space
  for (let row = 0; row < searchRows; row++) {
    for (let col = 0; col <= columnCount - clampedColSpan; col++) {
      const candidate: GridPosition = {
        row,
        col,
        rowSpan,
        colSpan: clampedColSpan,
      }
      const isFree = getCellsForPosition(candidate).every(
        (cell) => !occupied.has(cell),
      )
      if (isFree) {
        return candidate
      }
    }
  }

  // No space found within the search window: place at the bottom (capped)
  return {
    row: Math.min(contentBottom, MAX_SEARCH_ROWS),
    col: 0,
    rowSpan,
    colSpan: clampedColSpan,
  }
}
