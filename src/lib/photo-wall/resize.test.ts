import { describe, expect, it } from 'vitest'
import {
  IOS_CANVAS_MAX_PIXELS,
  IOS_CANVAS_MAX_SIDE,
  MAX_LONG_EDGE,
  MIN_SHORT_EDGE,
  fitLongEdge,
  isTooSmallForWall,
  resizeSteps,
} from './resize'

/**
 * The composer's resize maths (Photo Wall spec §6.5): the long edge ends at
 * most 2048 px, and every canvas on the way stays inside the iOS caps (about
 * 4096 px on a side, 16.7 M pixels), so a 24 or 48 MP photo gets there in
 * steps instead of failing on a canvas Safari refuses to allocate.
 */
const withinCaps = ({ width, height }: { width: number; height: number }) =>
  width <= IOS_CANVAS_MAX_SIDE &&
  height <= IOS_CANVAS_MAX_SIDE &&
  width * height <= IOS_CANVAS_MAX_PIXELS

describe('fitLongEdge', () => {
  it('leaves a photo that already fits alone', () => {
    expect(fitLongEdge(1600, 1200)).toEqual({ width: 1600, height: 1200 })
    expect(fitLongEdge(2048, 1536)).toEqual({ width: 2048, height: 1536 })
  })

  it('scales a 12 MP iPhone photo to a 2048 px long edge, both orientations', () => {
    expect(fitLongEdge(4032, 3024)).toEqual({ width: 2048, height: 1536 })
    expect(fitLongEdge(3024, 4032)).toEqual({ width: 1536, height: 2048 })
  })

  it('rounds the short edge and never drops below 1 px', () => {
    expect(fitLongEdge(3000, 2000)).toEqual({ width: 2048, height: 1365 })
    expect(fitLongEdge(10_000, 1)).toEqual({ width: 2048, height: 1 })
  })

  it('takes another maximum, for the preview copies', () => {
    expect(fitLongEdge(4032, 3024, 960)).toEqual({ width: 960, height: 720 })
  })
})

describe('resizeSteps: the canvases a photo is drawn through', () => {
  it('a photo that fits is drawn once, at its own size', () => {
    expect(resizeSteps(1600, 1200)).toEqual([{ width: 1600, height: 1200 }])
  })

  it('a 12 MP photo goes straight to 2048 px (one step, under 2x)', () => {
    expect(resizeSteps(4032, 3024)).toEqual([{ width: 2048, height: 1536 }])
  })

  it.each([
    ['24 MP landscape', 6000, 4000],
    ['24 MP portrait', 4000, 6000],
    ['48 MP landscape', 8000, 6000],
    ['48 MP portrait', 6000, 8000],
    ['50 MP square', 7072, 7072],
    ['panorama', 12_000, 3000],
  ])(
    '%s: every step is inside the iOS caps, shrinks by at most 2x unless a cap forces more, and ends at 2048',
    (_, width, height) => {
      const steps = resizeSteps(width, height)
      let previous = { width, height }
      for (const step of steps) {
        expect(withinCaps(step)).toBe(true)
        // The caps bind before the 2x rule: a 12000 px panorama cannot be
        // drawn at 6000 px, so its first step is the 4096 px canvas.
        const capBound =
          Math.max(step.width, step.height) === IOS_CANVAS_MAX_SIDE ||
          step.width * step.height > IOS_CANVAS_MAX_PIXELS * 0.99
        if (!capBound) {
          expect(step.width).toBeGreaterThanOrEqual(previous.width / 2 - 1)
          expect(step.height).toBeGreaterThanOrEqual(previous.height / 2 - 1)
        }
        expect(step.width).toBeLessThanOrEqual(previous.width)
        expect(step.height).toBeLessThanOrEqual(previous.height)
        previous = step
      }
      expect(steps.at(-1)).toEqual(fitLongEdge(width, height))
      expect(Math.max(previous.width, previous.height)).toBe(MAX_LONG_EDGE)
    },
  )

  it('48 MP: 8000x6000 halves to 4000x3000, then 2048x1536', () => {
    expect(resizeSteps(8000, 6000)).toEqual([
      { width: 4000, height: 3000 },
      { width: 2048, height: 1536 },
    ])
  })

  it('a first step that would exceed 4096 px on a side is clamped to it', () => {
    const [first] = resizeSteps(9000, 6000)
    expect(first.width).toBe(IOS_CANVAS_MAX_SIDE)
    expect(withinCaps(first)).toBe(true)
  })

  it('a first step over 16.7 M pixels is shrunk under it even when both sides fit', () => {
    // 4100x4100 halves to 2050x2050; 4096x4100 would be 16.79 M pixels at full size.
    const steps = resizeSteps(4096, 4100)
    expect(steps.every(withinCaps)).toBe(true)
    expect(steps.at(-1)).toEqual({ width: 2046, height: 2048 })
  })
})

describe('resizeSteps for the preview copies and thumbnails', () => {
  it('a 128 px thumbnail of a 2048x1536 master goes through halving steps, not one draw', () => {
    expect(resizeSteps(2048, 1536, 128)).toEqual([
      { width: 1024, height: 768 },
      { width: 512, height: 384 },
      { width: 256, height: 192 },
      { width: 128, height: 96 },
    ])
  })

  it('the 1024 px preview of a 2048 px master is one step', () => {
    expect(resizeSteps(2048, 1536, 1024)).toEqual([
      { width: 1024, height: 768 },
    ])
  })
})

describe('isTooSmallForWall: the 320 px short edge (§6.4), judged after the resize', () => {
  it('is 320 px', () => {
    expect(MIN_SHORT_EDGE).toBe(320)
  })

  it('a 4000x600 panorama becomes 2048x307: too narrow', () => {
    expect(fitLongEdge(4000, 600)).toEqual({ width: 2048, height: 307 })
    expect(isTooSmallForWall(4000, 600)).toBe(true)
    expect(isTooSmallForWall(600, 4000)).toBe(true)
  })

  it('a 300x200 photo is too small; 320x320 and a phone photo are fine', () => {
    expect(isTooSmallForWall(300, 200)).toBe(true)
    expect(isTooSmallForWall(319, 2000)).toBe(true)
    expect(isTooSmallForWall(320, 320)).toBe(false)
    expect(isTooSmallForWall(4032, 3024)).toBe(false)
    expect(isTooSmallForWall(1200, 1600)).toBe(false)
  })

  it('a wide photo whose short edge only fits before the resize is refused', () => {
    // 4096x640 is 640 short at full size, 320 after the resize: just fine; 4096x639 is not.
    expect(isTooSmallForWall(4096, 640)).toBe(false)
    expect(isTooSmallForWall(4096, 638)).toBe(true)
  })
})
