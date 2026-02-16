/**
 * @vitest-environment jsdom
 */
import {
  PRESET_CONFIGS,
  EMPTY_PRESET,
  ALL_PRESETS,
  PRESET_KEYS,
} from '@/lib/dashboard/presets'
import { WIDGET_REGISTRY } from '@/lib/dashboard/widget-registry'
import { buildOccupationMap, checkCollision } from '@/lib/dashboard/grid-utils'

const GRID_COLUMNS = 12

describe('Preset Layout Integrity', () => {
  const presetEntries = Object.entries(PRESET_CONFIGS)

  it.each(presetEntries)(
    '%s preset has no overlapping widgets',
    (_name, preset) => {
      const map = buildOccupationMap(preset.widgets)
      // Total cells should equal sum of individual widget areas
      const expectedCells = preset.widgets.reduce(
        (sum, w) => sum + w.position.rowSpan * w.position.colSpan,
        0,
      )
      expect(map.size).toBe(expectedCells)
    },
  )

  it.each(presetEntries)(
    '%s preset has all widgets within 12-column grid bounds',
    (_name, preset) => {
      for (const widget of preset.widgets) {
        const { row, col, colSpan } = widget.position
        expect(row).toBeGreaterThanOrEqual(0)
        expect(col).toBeGreaterThanOrEqual(0)
        expect(col + colSpan).toBeLessThanOrEqual(GRID_COLUMNS)
      }
    },
  )

  it.each(presetEntries)(
    '%s preset uses only registered widget types',
    (_name, preset) => {
      for (const widget of preset.widgets) {
        expect(WIDGET_REGISTRY[widget.type]).toBeDefined()
      }
    },
  )

  it.each(presetEntries)('%s preset has unique widget IDs', (_name, preset) => {
    const ids = preset.widgets.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(presetEntries)(
    '%s preset widgets respect registry size constraints',
    (_name, preset) => {
      for (const widget of preset.widgets) {
        const meta = WIDGET_REGISTRY[widget.type]
        if (!meta?.constraints) continue
        const { colSpan, rowSpan } = widget.position
        const c = meta.constraints
        expect(colSpan).toBeGreaterThanOrEqual(c.minCols)
        expect(colSpan).toBeLessThanOrEqual(c.maxCols)
        expect(rowSpan).toBeGreaterThanOrEqual(c.minRows)
        expect(rowSpan).toBeLessThanOrEqual(c.maxRows)
      }
    },
  )

  it('each widget can be added to its preset without collision', () => {
    for (const [, preset] of presetEntries) {
      for (const widget of preset.widgets) {
        const others = preset.widgets.filter((w) => w.id !== widget.id)
        const collides = checkCollision(
          widget.position,
          others,
          undefined,
          GRID_COLUMNS,
        )
        expect(collides).toBe(false)
      }
    }
  })

  it('empty preset has no widgets', () => {
    expect(EMPTY_PRESET.widgets).toHaveLength(0)
  })

  it('ALL_PRESETS includes all named presets plus empty', () => {
    expect(ALL_PRESETS).toHaveProperty('planning')
    expect(ALL_PRESETS).toHaveProperty('execution')
    expect(ALL_PRESETS).toHaveProperty('financial')
    expect(ALL_PRESETS).toHaveProperty('comprehensive')
    expect(ALL_PRESETS).toHaveProperty('empty')
    expect(PRESET_KEYS).toEqual(Object.keys(ALL_PRESETS))
  })

  it('every preset has a descriptive name and description', () => {
    for (const [, preset] of Object.entries(ALL_PRESETS)) {
      expect(preset.name.length).toBeGreaterThan(0)
      expect(preset.description.length).toBeGreaterThan(0)
    }
  })
})
