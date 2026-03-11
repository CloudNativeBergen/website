/**
 * @vitest-environment jsdom
 */
import {
  WIDGET_REGISTRY,
  getWidgetMetadata,
} from '@/lib/dashboard/widget-registry'

const registryEntries = Object.entries(WIDGET_REGISTRY)

describe('Widget Registry', () => {
  it('contains exactly 12 registered widget types', () => {
    expect(registryEntries).toHaveLength(12)
  })

  it('getWidgetMetadata returns metadata for registered types', () => {
    for (const [type] of registryEntries) {
      expect(getWidgetMetadata(type)).toBeDefined()
    }
  })

  it('getWidgetMetadata returns undefined for unknown types', () => {
    expect(getWidgetMetadata('non-existent-widget')).toBeUndefined()
  })

  describe('metadata consistency', () => {
    it.each(registryEntries)(
      '%s has required metadata fields',
      (_type, meta) => {
        expect(meta.type).toBeTruthy()
        expect(meta.displayName).toBeTruthy()
        expect(meta.description).toBeTruthy()
        expect(meta.category).toBeTruthy()
        expect(meta.icon).toBeTruthy()
        expect(meta.defaultSize).toBeDefined()
        expect(meta.availableSizes.length).toBeGreaterThan(0)
        expect(meta.constraints).toBeDefined()
      },
    )

    it.each(registryEntries)(
      '%s default size satisfies its own constraints',
      (_type, meta) => {
        const { defaultSize, constraints } = meta
        expect(defaultSize.colSpan).toBeGreaterThanOrEqual(constraints.minCols)
        expect(defaultSize.colSpan).toBeLessThanOrEqual(constraints.maxCols)
        expect(defaultSize.rowSpan).toBeGreaterThanOrEqual(constraints.minRows)
        expect(defaultSize.rowSpan).toBeLessThanOrEqual(constraints.maxRows)
      },
    )

    it.each(registryEntries)(
      '%s available sizes all satisfy constraints',
      (_type, meta) => {
        for (const size of meta.availableSizes) {
          expect(size.colSpan).toBeGreaterThanOrEqual(meta.constraints.minCols)
          expect(size.colSpan).toBeLessThanOrEqual(meta.constraints.maxCols)
          expect(size.rowSpan).toBeGreaterThanOrEqual(meta.constraints.minRows)
          expect(size.rowSpan).toBeLessThanOrEqual(meta.constraints.maxRows)
        }
      },
    )

    it.each(registryEntries)(
      '%s registry key matches metadata type field',
      (type, meta) => {
        expect(meta.type).toBe(type)
      },
    )
  })

  describe('config schemas', () => {
    const widgetsWithConfig = registryEntries.filter(
      ([, meta]) => meta.configSchema,
    )

    it('at least some widgets have config schemas', () => {
      expect(widgetsWithConfig.length).toBeGreaterThan(0)
    })

    it.each(widgetsWithConfig)(
      '%s config schema validates default values',
      (_type, meta) => {
        const schema = meta.configSchema!
        // Build defaults from field definitions
        const defaults: Record<string, unknown> = {}
        for (const [key, field] of Object.entries(schema.fields)) {
          defaults[key] = field.defaultValue
        }
        const result = schema.schema.safeParse(defaults)
        expect(result.success).toBe(true)
      },
    )

    it.each(widgetsWithConfig)(
      '%s config schema rejects invalid values',
      (_type, meta) => {
        const schema = meta.configSchema!
        // Pass empty object — required fields should fail
        const result = schema.schema.safeParse({})
        expect(result.success).toBe(false)
      },
    )
  })

  describe('phase configuration', () => {
    it.each(registryEntries)(
      '%s has phase configuration with at least one relevant phase',
      (_type, meta) => {
        expect(meta.phaseConfig).toBeDefined()
        expect(meta.phaseConfig!.relevantPhases.length).toBeGreaterThan(0)
      },
    )

    it('quick-actions widget is relevant in all phases', () => {
      const qa = getWidgetMetadata('quick-actions')!
      expect(qa.phaseConfig!.relevantPhases).toEqual(
        expect.arrayContaining([
          'initialization',
          'planning',
          'execution',
          'post-conference',
        ]),
      )
    })
  })
})
