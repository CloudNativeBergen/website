import { describe, expect, it } from 'vitest'
import { WALL_FILTERS, applyWallFilter, type WallFilterKey } from './filters'

/**
 * The nine filters (Photo Wall spec §6.5): one per-pixel implementation,
 * run on the preview copy and baked into the uploaded JPEG. These tests
 * pin what each one does to colour, not the exact numbers, so the look can
 * be tuned without rewriting them.
 */
type Rgb = [number, number, number]

/** A 2x1 image: the pixel at x = 0 and the one at x = 1. */
const image = (left: Rgb, right: Rgb = left) =>
  new Uint8ClampedArray([...left, 255, ...right, 200])

const run = (key: WallFilterKey, left: Rgb, right: Rgb = left) => {
  const data = image(left, right)
  applyWallFilter(data, 2, 1, key)
  return {
    left: [data[0], data[1], data[2]] as Rgb,
    right: [data[4], data[5], data[6]] as Rgb,
    alpha: [data[3], data[7]],
  }
}

const spread = ([r, g, b]: Rgb) => Math.max(r, g, b) - Math.min(r, g, b)
const luma = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b

const skin: Rgb = [200, 150, 120]
const grey: Rgb = [128, 128, 128]
const dark: Rgb = [40, 40, 40]
const light: Rgb = [220, 220, 220]

describe('the filter list', () => {
  it('is the nine of the spec, in its order, Original first', () => {
    expect(WALL_FILTERS.map((f) => f.label)).toEqual([
      'Original',
      'Vivid',
      'Warm',
      'Fade',
      'Fjord',
      'Aurora',
      'Mono',
      'Noir',
      'Retro',
    ])
    expect(WALL_FILTERS[0].key).toBe('original')
  })

  it('every filter leaves alpha alone and stays inside 0–255', () => {
    for (const { key } of WALL_FILTERS) {
      const white = run(key, [255, 255, 255], [0, 0, 0])
      expect(white.alpha).toEqual([255, 200])
      for (const v of [...white.left, ...white.right]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
      }
    }
  })

  it('no two filters give the same result on a skin tone', () => {
    const results = WALL_FILTERS.map(({ key }) => run(key, skin).left.join())
    expect(new Set(results).size).toBe(WALL_FILTERS.length)
  })
})

describe('what each filter does', () => {
  it('Original is the identity', () => {
    expect(run('original', skin, dark)).toMatchObject({
      left: skin,
      right: dark,
    })
  })

  it('Vivid pushes saturation and contrast up', () => {
    expect(spread(run('vivid', skin).left)).toBeGreaterThan(spread(skin))
    expect(run('vivid', dark).left[0]).toBeLessThan(dark[0])
    expect(run('vivid', light).left[0]).toBeGreaterThan(light[0])
  })

  it('Warm shifts a grey towards red and away from blue', () => {
    const [r, , b] = run('warm', grey).left
    expect(r).toBeGreaterThan(b)
    expect(r).toBeGreaterThan(grey[0])
  })

  it('Fade lifts the darks, pulls contrast and saturation down', () => {
    expect(run('fade', dark).left[0]).toBeGreaterThan(dark[0])
    expect(spread(run('fade', skin).left)).toBeLessThan(spread(skin))
    expect(run('fade', light).left[0] - run('fade', dark).left[0]).toBeLessThan(
      light[0] - dark[0],
    )
  })

  it('Fjord tints a grey blue', () => {
    const [r, g, b] = run('fjord', grey).left
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)
  })

  it('Aurora runs green on the left to indigo on the right', () => {
    const { left, right } = run('aurora', grey, grey)
    expect(left[1]).toBeGreaterThan(left[2])
    expect(right[2]).toBeGreaterThan(right[1])
  })

  it('Mono and Noir are grey, Noir with more contrast', () => {
    for (const key of ['mono', 'noir'] as const) {
      const [r, g, b] = run(key, skin).left
      expect(r).toBe(g)
      expect(g).toBe(b)
    }
    const monoRange = run('mono', light).left[0] - run('mono', dark).left[0]
    const noirRange = run('noir', light).left[0] - run('noir', dark).left[0]
    expect(noirRange).toBeGreaterThan(monoRange)
  })

  it('Mono keeps the luminance of a mid grey', () => {
    expect(Math.abs(luma(run('mono', grey).left) - 128)).toBeLessThan(12)
  })

  it('Retro is sepia-warm: red above blue on a grey, and a yellow cast', () => {
    const [r, g, b] = run('retro', grey).left
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
  })
})
