/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals'
import {
  buildOccupationMap,
  getCellsForPosition,
  checkCollision,
  snapToGrid,
  getColumnCountForWidth,
} from '@/lib/dashboard/grid-utils'
import type { Widget, GridPosition } from '@/lib/dashboard/types'

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

describe('buildOccupationMap', () => {
  it('returns empty map for no widgets', () => {
    const map = buildOccupationMap([])
    expect(map.size).toBe(0)
  })

  it('maps all cells for a single widget', () => {
    const widgets = [makeWidget('a', 0, 0, 2, 3)]
    const map = buildOccupationMap(widgets)
    expect(map.size).toBe(6)
    expect(map.get('0-0')).toBe('a')
    expect(map.get('0-2')).toBe('a')
    expect(map.get('1-2')).toBe('a')
    expect(map.has('2-0')).toBe(false)
  })

  it('maps multiple widgets', () => {
    const widgets = [makeWidget('a', 0, 0, 1, 1), makeWidget('b', 0, 1, 1, 1)]
    const map = buildOccupationMap(widgets)
    expect(map.get('0-0')).toBe('a')
    expect(map.get('0-1')).toBe('b')
  })
})

describe('getCellsForPosition', () => {
  it('returns all cells for a position', () => {
    const pos: GridPosition = { row: 1, col: 2, rowSpan: 2, colSpan: 3 }
    const cells = getCellsForPosition(pos)
    expect(cells).toHaveLength(6)
    expect(cells).toContain('1-2')
    expect(cells).toContain('1-4')
    expect(cells).toContain('2-4')
  })

  it('returns single cell for 1x1', () => {
    const cells = getCellsForPosition({
      row: 5,
      col: 3,
      rowSpan: 1,
      colSpan: 1,
    })
    expect(cells).toEqual(['5-3'])
  })
})

describe('checkCollision', () => {
  const widgets = [makeWidget('a', 0, 0, 2, 3)]

  it('detects overlap with existing widget', () => {
    const pos: GridPosition = { row: 1, col: 2, rowSpan: 2, colSpan: 2 }
    expect(checkCollision(pos, widgets)).toBe(true)
  })

  it('allows placement next to existing widget', () => {
    const pos: GridPosition = { row: 0, col: 3, rowSpan: 2, colSpan: 2 }
    expect(checkCollision(pos, widgets)).toBe(false)
  })

  it('allows placement below existing widget', () => {
    const pos: GridPosition = { row: 2, col: 0, rowSpan: 1, colSpan: 3 }
    expect(checkCollision(pos, widgets)).toBe(false)
  })

  it('detects out-of-bounds column placement', () => {
    const pos: GridPosition = { row: 0, col: 10, rowSpan: 1, colSpan: 3 }
    expect(checkCollision(pos, widgets, undefined, 12)).toBe(true)
  })

  it('detects negative row', () => {
    const pos: GridPosition = { row: -1, col: 0, rowSpan: 1, colSpan: 1 }
    expect(checkCollision(pos, widgets)).toBe(true)
  })

  it('detects negative col', () => {
    const pos: GridPosition = { row: 0, col: -1, rowSpan: 1, colSpan: 1 }
    expect(checkCollision(pos, widgets)).toBe(true)
  })

  it('excludes specified widget from collision check', () => {
    const pos: GridPosition = { row: 0, col: 0, rowSpan: 2, colSpan: 3 }
    expect(checkCollision(pos, widgets, 'a')).toBe(false)
  })

  it('allows placement in empty grid', () => {
    const pos: GridPosition = { row: 0, col: 0, rowSpan: 2, colSpan: 2 }
    expect(checkCollision(pos, [])).toBe(false)
  })
})

describe('snapToGrid', () => {
  it('snaps pixel coordinates to nearest grid cell', () => {
    const result = snapToGrid(112, 112, 96, 96, 16)
    expect(result).toEqual({ row: 1, col: 1 })
  })

  it('snaps to origin for small values', () => {
    const result = snapToGrid(10, 10, 96, 96, 16)
    expect(result).toEqual({ row: 0, col: 0 })
  })

  it('clamps negative values to 0', () => {
    const result = snapToGrid(-50, -50, 96, 96, 16)
    expect(result).toEqual({ row: 0, col: 0 })
  })

  it('clamps col to maxCols when specified', () => {
    const result = snapToGrid(2000, 0, 96, 96, 16, 12)
    expect(result.col).toBeLessThanOrEqual(11)
  })
})

describe('getColumnCountForWidth', () => {
  it('returns 12 columns for desktop widths', () => {
    expect(getColumnCountForWidth(1440)).toBe(12)
    expect(getColumnCountForWidth(1024)).toBe(12)
  })

  it('returns 6 columns for tablet widths', () => {
    expect(getColumnCountForWidth(1023)).toBe(6)
    expect(getColumnCountForWidth(768)).toBe(6)
  })

  it('returns 4 columns for mobile widths', () => {
    expect(getColumnCountForWidth(767)).toBe(4)
    expect(getColumnCountForWidth(320)).toBe(4)
  })

  it('returns 4 columns for zero width', () => {
    expect(getColumnCountForWidth(0)).toBe(4)
  })
})
