import { describe, it, expect } from 'vitest'
import {
  selectStories,
  comparePixels,
  rankRows,
  summarize,
  formatPct,
  formatTable,
  DEFAULT_EXCLUDE,
  SKIP_TAG,
} from '../../scripts/visual-diff/pixels.mjs'

type DiffRow = {
  key: string
  status: string
  changedRatio: number
  changedPixels: number
  maxDelta: number
  unstable?: boolean
  sizeChanged?: boolean
}

/** A comparison row with sane defaults, for the ranking/reporting tests. */
function diffRow(over: Partial<DiffRow> = {}): DiffRow {
  return {
    key: 'k',
    status: 'ok',
    changedRatio: 0,
    changedPixels: 0,
    maxDelta: 0,
    unstable: false,
    ...over,
  }
}

const keys = (rows: DiffRow[]) => rows.map((r) => r.key)

type Entry = {
  id: string
  title?: string
  name?: string
  importPath?: string
  type?: string
  tags?: string[]
}

function entry(id: string, over: Partial<Entry> = {}): Entry {
  return {
    id,
    title: 'Components/Thing',
    name: 'Default',
    importPath: './src/components/Thing.stories.tsx',
    type: 'story',
    ...over,
  }
}

/** Build a solid-colour RGBA raster for the pixel-maths tests. */
function raster(
  width: number,
  height: number,
  rgba: [number, number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4)
  return { width, height, data }
}

describe('selectStories', () => {
  it('drops docs entries and keeps only stories', () => {
    const picked = selectStories([
      entry('a--default'),
      entry('a--docs', { type: 'docs' }),
    ])
    expect(picked.map((s) => s.id)).toEqual(['a--default'])
  })

  it('honours the per-story opt-out tag', () => {
    const picked = selectStories([
      entry('a--default'),
      entry('b--flaky', { tags: ['dev', SKIP_TAG] }),
    ])
    expect(picked.map((s) => s.id)).toEqual(['a--default'])
  })

  it('anchors filters per field, not against a concatenated haystack', () => {
    const entries = [
      entry('components-layout-hero--default', {
        importPath: './src/components/Hero.stories.tsx',
      }),
      entry('systems-x--default', {
        importPath: './src/components/admin/Hero.stories.tsx',
      }),
    ]
    // `^src/...` must match the import path even though it is not the first
    // field, and even though Storybook writes it with a leading `./`.
    const picked = selectStories(entries, {
      include: ['^src/components/Hero\\.stories'],
    })
    expect(picked.map((s) => s.id)).toEqual(['components-layout-hero--default'])
  })

  it('lets exclude beat include', () => {
    const picked = selectStories([entry('a--default'), entry('b--default')], {
      include: ['--default'],
      exclude: ['^b--'],
    })
    expect(picked.map((s) => s.id)).toEqual(['a--default'])
  })

  it('excludes admin surfaces by default', () => {
    const picked = selectStories(
      [
        entry('public--default', {
          importPath: './src/components/Hero.stories.tsx',
        }),
        entry('admin-thing--default', {
          importPath: './src/components/admin/Thing.stories.tsx',
        }),
        entry('route--default', {
          importPath: './src/app/(admin)/admin/page.stories.tsx',
        }),
      ],
      { exclude: DEFAULT_EXCLUDE },
    )
    expect(picked.map((s) => s.id)).toEqual(['public--default'])
  })

  it('sorts by id and applies the limit after filtering', () => {
    const picked = selectStories(
      [entry('c--x'), entry('a--x'), entry('b--x')],
      { limit: 2 },
    )
    expect(picked.map((s) => s.id)).toEqual(['a--x', 'b--x'])
  })

  it('accepts the index.json entries object as well as an array', () => {
    const picked = selectStories({ 'a--x': entry('a--x') })
    expect(picked).toHaveLength(1)
  })
})

describe('comparePixels', () => {
  it('reports zero change for identical rasters', () => {
    const a = raster(4, 4, [10, 20, 30, 255])
    const result = comparePixels(a, raster(4, 4, [10, 20, 30, 255]))
    expect(result.changedPixels).toBe(0)
    expect(result.changedRatio).toBe(0)
    expect(result.maxDelta).toBe(0)
    expect(result.sizeChanged).toBe(false)
  })

  it('ignores sub-threshold deltas but still reports maxDelta', () => {
    const result = comparePixels(
      raster(2, 2, [100, 100, 100, 255]),
      raster(2, 2, [105, 100, 100, 255]),
      { channelThreshold: 8 },
    )
    expect(result.changedPixels).toBe(0)
    // The delta is invisible for counting purposes but must not be hidden —
    // that is how a reviewer notices a uniform, just-under-threshold shift.
    expect(result.maxDelta).toBe(5)
    expect(result.meanDelta).toBe(5)
  })

  it('counts pixels once the per-channel delta clears the threshold', () => {
    const result = comparePixels(
      raster(2, 2, [0, 0, 0, 255]),
      raster(2, 2, [0, 0, 40, 255]),
      { channelThreshold: 8 },
    )
    expect(result.changedPixels).toBe(4)
    expect(result.changedRatio).toBe(1)
    expect(result.maxDelta).toBe(40)
  })

  it('treats a threshold of 0 as "any difference counts"', () => {
    const result = comparePixels(
      raster(1, 1, [0, 0, 0, 255]),
      raster(1, 1, [1, 0, 0, 255]),
      { channelThreshold: 0 },
    )
    expect(result.changedPixels).toBe(1)
  })

  it('counts non-overlapping area as changed and flags the size change', () => {
    const result = comparePixels(
      raster(2, 2, [0, 0, 0, 255]),
      raster(2, 4, [0, 0, 0, 255]),
    )
    expect(result.sizeChanged).toBe(true)
    expect(result.width).toBe(2)
    expect(result.height).toBe(4)
    expect(result.changedPixels).toBe(4) // the two extra rows
    expect(result.changedRatio).toBeCloseTo(0.5)
    // meanDelta averages the COMPARABLE region only, so growing taller does not
    // masquerade as a colour shift.
    expect(result.meanDelta).toBe(0)
  })

  it('compares by position, not by flat index, when strides differ', () => {
    // Baseline 2x2 all black; candidate 4x2 where the left 2x2 is black.
    const a = raster(2, 2, [0, 0, 0, 255])
    const b = raster(4, 2, [255, 255, 255, 255])
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) b.data.set([0, 0, 0, 255], (y * 4 + x) * 4)
    const result = comparePixels(a, b)
    // Only the 4 pixels outside the overlap differ; a stride-naive comparison
    // would wrongly find differences inside the overlap too.
    expect(result.changedPixels).toBe(4)
    expect(result.maxDelta).toBe(0)
  })

  it('marks size-only pixels distinctly in the mask', () => {
    const result = comparePixels(
      raster(1, 1, [0, 0, 0, 255]),
      raster(1, 2, [0, 0, 0, 255]),
    )
    expect(Array.from(result.mask)).toEqual([0, 2])
  })
})

describe('rankRows', () => {
  it('puts the biggest change first', () => {
    const ranked = rankRows([
      diffRow({ key: 'small', changedRatio: 0.01 }),
      diffRow({ key: 'big', changedRatio: 0.9 }),
    ])
    expect(keys(ranked)).toEqual(['big', 'small'])
  })

  it('sinks unstable stories below real diffs however large they look', () => {
    const ranked = rankRows([
      diffRow({ key: 'noisy', changedRatio: 0.99, unstable: true }),
      diffRow({ key: 'real', changedRatio: 0.01 }),
    ])
    expect(keys(ranked)).toEqual(['real', 'noisy'])
  })

  it('breaks ratio ties on maxDelta, then key, and does not mutate input', () => {
    const input = [
      diffRow({ key: 'b', changedRatio: 0.5, maxDelta: 10 }),
      diffRow({ key: 'a', changedRatio: 0.5, maxDelta: 10 }),
      diffRow({ key: 'c', changedRatio: 0.5, maxDelta: 200 }),
    ]
    const ranked = rankRows(input)
    expect(keys(ranked)).toEqual(['c', 'a', 'b'])
    expect(keys(input)).toEqual(['b', 'a', 'c'])
  })
})

describe('summarize', () => {
  it('separates real changes from sub-threshold noise', () => {
    const buckets = summarize(
      [
        diffRow({ key: 'changed', changedRatio: 0.05 }),
        diffRow({ key: 'noise', changedRatio: 0.00001 }),
        diffRow({ key: 'same' }),
      ],
      { minRatio: 0.001 },
    )
    expect(keys(buckets.changed)).toEqual(['changed'])
    expect(keys(buckets.noise)).toEqual(['noise'])
    expect(keys(buckets.identical)).toEqual(['same'])
    expect(buckets.total).toBe(3)
  })

  it('quarantines unstable stories out of the changed bucket', () => {
    const buckets = summarize([
      diffRow({ key: 'flaky', changedRatio: 0.5, unstable: true }),
    ])
    expect(buckets.changed).toHaveLength(0)
    expect(keys(buckets.unstable)).toEqual(['flaky'])
  })

  it('buckets missing and errored rows away from the change list', () => {
    const buckets = summarize([
      diffRow({ key: 'gone', status: 'missing', changedRatio: 1 }),
      diffRow({ key: 'broken', status: 'error', changedRatio: 1 }),
    ])
    expect(buckets.changed).toHaveLength(0)
    expect(buckets.missing).toHaveLength(1)
    expect(buckets.errored).toHaveLength(1)
  })
})

describe('formatting', () => {
  it('keeps small percentages visible', () => {
    expect(formatPct(0.000123)).toBe('0.012%')
    expect(formatPct(1)).toBe('100.000%')
  })

  it('renders a row per story with its flags, and truncates the tail', () => {
    const rows = [
      {
        key: 'hero--default@dark',
        changedRatio: 0.25,
        changedPixels: 1234,
        maxDelta: 200,
        sizeChanged: true,
        unstable: false,
        status: 'ok',
      },
      {
        key: 'other--default@light',
        changedRatio: 0.1,
        changedPixels: 12,
        maxDelta: 9,
        sizeChanged: false,
        unstable: false,
        status: 'ok',
      },
    ]
    const table = formatTable(rows, 1)
    expect(table).toContain('hero--default@dark')
    expect(table).toContain('25.000%')
    expect(table).toContain('SIZE')
    expect(table).toContain('… and 1 more')
    expect(table).not.toContain('other--default@light')
  })

  it('says so when nothing matched', () => {
    expect(formatTable([])).toBe('  (none)')
  })
})
