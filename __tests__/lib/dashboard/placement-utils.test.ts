/**
 * @vitest-environment jsdom
 */
import { findAvailablePosition } from '@/lib/dashboard/placement-utils'
import { checkCollision } from '@/lib/dashboard/grid-utils'
import type { Widget } from '@/lib/dashboard/types'

const makeWidget = (
  id: string,
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
): Widget => ({
  id,
  type: 'test',
  title: `Widget ${id}`,
  position: { row, col, rowSpan, colSpan },
})

describe('findAvailablePosition', () => {
  it('places at origin on empty grid', () => {
    const pos = findAvailablePosition(3, 2, [], 12)
    expect(pos).toEqual({ row: 0, col: 0, rowSpan: 2, colSpan: 3 })
  })

  it('places next to existing widget when space available', () => {
    const existing = [makeWidget('a', 0, 0, 2, 3)]
    const pos = findAvailablePosition(3, 2, existing, 12)
    expect(pos).toEqual({ row: 0, col: 3, rowSpan: 2, colSpan: 3 })
  })

  it('places below when row is full', () => {
    const existing = [
      makeWidget('a', 0, 0, 1, 4),
      makeWidget('b', 0, 4, 1, 4),
      makeWidget('c', 0, 8, 1, 4),
    ]
    const pos = findAvailablePosition(4, 1, existing, 12)
    expect(pos.row).toBe(1)
    expect(pos.col).toBe(0)
  })

  it('finds gap between widgets', () => {
    const existing = [makeWidget('a', 0, 0, 1, 3), makeWidget('b', 0, 6, 1, 3)]
    const pos = findAvailablePosition(3, 1, existing, 12)
    expect(pos).toEqual({ row: 0, col: 3, rowSpan: 1, colSpan: 3 })
  })

  it('places at bottom when grid is densely packed', () => {
    const existing: Widget[] = []
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 12; c++) {
        existing.push(makeWidget(`w-${r}-${c}`, r, c, 1, 1))
      }
    }
    const pos = findAvailablePosition(1, 1, existing, 12)
    expect(pos.row).toBe(10)
  })

  it('clamps colSpan to columnCount when placing at bottom', () => {
    const existing: Widget[] = []
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 4; c++) {
        existing.push(makeWidget(`w-${r}-${c}`, r, c, 1, 1))
      }
    }
    const pos = findAvailablePosition(6, 1, existing, 4)
    expect(pos.colSpan).toBeLessThanOrEqual(4)
  })

  it('handles single-column grid', () => {
    const existing = [makeWidget('a', 0, 0, 1, 1)]
    const pos = findAvailablePosition(1, 1, existing, 1)
    expect(pos).toEqual({ row: 1, col: 0, rowSpan: 1, colSpan: 1 })
  })

  it('never returns a position that collides (shared grid-utils semantics)', () => {
    const existing = [
      makeWidget('a', 0, 0, 2, 5),
      makeWidget('b', 0, 5, 3, 4),
      makeWidget('c', 2, 0, 2, 3),
      makeWidget('d', 3, 9, 1, 3),
    ]
    const pos = findAvailablePosition(4, 2, existing, 12)
    expect(checkCollision(pos, existing, undefined, 12)).toBe(false)
  })

  it('clamps colSpan to columnCount when scanning, not only at the bottom', () => {
    const pos = findAvailablePosition(8, 2, [], 6)
    expect(pos).toEqual({ row: 0, col: 0, rowSpan: 2, colSpan: 6 })
  })

  it('caps the search space for pathological stored positions (no OOM)', () => {
    // A widget claiming row 1e9 must not make the scan allocate/iterate
    // a billion rows. Positions are server-validated (row ≤ 500), this is
    // the defensive local guard.
    const pathological = [makeWidget('far', 1_000_000_000, 0, 2, 12)]

    const start = Date.now()
    const pos = findAvailablePosition(3, 2, pathological, 12)
    const elapsed = Date.now() - start

    // The top of the grid is free, so placement is still sensible…
    expect(pos).toEqual({ row: 0, col: 0, rowSpan: 2, colSpan: 3 })
    // …and fast (bounded scan, not a 1e9-row walk)
    expect(elapsed).toBeLessThan(1000)
  })

  it('caps the bottom fallback row when the grid is pathologically full', () => {
    // Fill every cell of every scanned row up to the cap so no position is
    // free; the fallback row must be capped, never the raw content bottom.
    const existing = [makeWidget('huge', 0, 0, 1_000_000_000, 12)]
    const pos = findAvailablePosition(3, 2, existing, 12)
    expect(pos.row).toBeLessThanOrEqual(600)
    expect(pos.col).toBe(0)
  })
})
