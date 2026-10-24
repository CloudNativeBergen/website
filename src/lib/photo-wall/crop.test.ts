import { describe, expect, it } from 'vitest'
import {
  CENTER_CROP,
  clampCrop,
  cropSquare,
  dragCrop,
  postedCrop,
} from './crop'

/**
 * The crop (Photo Wall spec §6.5): `{ x, y }` in 0–1 place a square of the
 * short edge on the photo; no zoom. Dragging the photo window pans it 1:1,
 * so the picture follows the finger.
 */
describe('cropSquare: the square of the short edge the crop places', () => {
  it('is the short edge, centred at { 0.5, 0.5 }', () => {
    expect(cropSquare(2048, 1536, CENTER_CROP)).toEqual({
      x: 256,
      y: 0,
      size: 1536,
    })
    expect(cropSquare(1536, 2048, CENTER_CROP)).toEqual({
      x: 0,
      y: 256,
      size: 1536,
    })
  })

  it('x = 0 is the left edge, x = 1 the right edge, and it never runs past the photo', () => {
    expect(cropSquare(2048, 1536, { x: 0, y: 0.5 })).toEqual({
      x: 0,
      y: 0,
      size: 1536,
    })
    expect(cropSquare(2048, 1536, { x: 1, y: 0.5 })).toEqual({
      x: 512,
      y: 0,
      size: 1536,
    })
    expect(cropSquare(1536, 2048, { x: 0.5, y: 1 })).toEqual({
      x: 0,
      y: 512,
      size: 1536,
    })
  })

  it('a square photo has no room to move: the crop is the whole photo', () => {
    expect(cropSquare(1000, 1000, { x: 0, y: 1 })).toEqual({
      x: 0,
      y: 0,
      size: 1000,
    })
  })

  it('rounds to whole pixels', () => {
    expect(cropSquare(2048, 1365, { x: 0.333, y: 0.5 })).toEqual({
      x: 227,
      y: 0,
      size: 1365,
    })
  })

  it('never places the square outside the photo, whatever crop it is handed', () => {
    expect(cropSquare(2048, 1536, { x: 1.5, y: -3 })).toEqual({
      x: 512,
      y: 0,
      size: 1536,
    })
    expect(cropSquare(2048, 1536, { x: -0.5, y: NaN })).toEqual({
      x: 0,
      y: 0,
      size: 1536,
    })
    expect(cropSquare(1536, 2048, { x: 0.5, y: NaN })).toEqual({
      x: 0,
      y: 256,
      size: 1536,
    })
  })
})

describe('clampCrop', () => {
  it('keeps both coordinates in 0–1 and replaces a non-finite one with the centre', () => {
    expect(clampCrop({ x: -0.2, y: 1.7 })).toEqual({ x: 0, y: 1 })
    expect(clampCrop({ x: 0.3, y: 0.9 })).toEqual({ x: 0.3, y: 0.9 })
    expect(clampCrop({ x: NaN, y: Infinity })).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe('dragCrop: panning the window by a finger movement', () => {
  const landscape = { width: 2048, height: 1536 }
  // The window shows the 1536 px square at 300 CSS px.
  const frame = 300

  it('moving the finger right shows more of the left: x goes down, 1:1 with the picture', () => {
    // 100 px on screen is 512 image px, the whole range of a 2048x1536 photo.
    const crop = dragCrop(CENTER_CROP, { dx: 50, dy: 0 }, frame, landscape)
    expect(crop.x).toBeCloseTo(0, 6)
    expect(crop.y).toBe(0.5)
  })

  it('moving left shows more of the right, and stops at the edge', () => {
    expect(
      dragCrop(CENTER_CROP, { dx: -50, dy: 0 }, frame, landscape).x,
    ).toBeCloseTo(1, 6)
    expect(dragCrop(CENTER_CROP, { dx: -500, dy: 0 }, frame, landscape).x).toBe(
      1,
    )
  })

  it('the short axis has no range: a vertical drag on a landscape photo changes nothing', () => {
    expect(dragCrop(CENTER_CROP, { dx: 0, dy: 80 }, frame, landscape)).toEqual(
      CENTER_CROP,
    )
  })

  it('a portrait photo pans vertically', () => {
    const portrait = { width: 1536, height: 2048 }
    const crop = dragCrop(
      { x: 0.5, y: 0.5 },
      { dx: 0, dy: -25 },
      frame,
      portrait,
    )
    expect(crop.x).toBe(0.5)
    expect(crop.y).toBeCloseTo(0.75, 6)
  })

  it('leaves the short axis where it was, off-centre too, rather than resetting it', () => {
    expect(
      dragCrop({ x: 0.3, y: 0.2 }, { dx: 0, dy: 80 }, frame, landscape),
    ).toEqual({ x: 0.3, y: 0.2 })
  })

  it('a square photo cannot pan', () => {
    expect(
      dragCrop(CENTER_CROP, { dx: 40, dy: 40 }, frame, {
        width: 1000,
        height: 1000,
      }),
    ).toEqual(CENTER_CROP)
    expect(
      dragCrop({ x: 0.1, y: 0.9 }, { dx: 40, dy: 0 }, frame, {
        width: 1000,
        height: 1000,
      }),
    ).toEqual({ x: 0.1, y: 0.9 })
  })
})

describe('postedCrop: the crop as Post to the wall hands it on', () => {
  it('fifteen arrow-key nudges to the left edge post 0, not 9.71e-17', () => {
    // A 2048x512 panorama in a 240 px window: one ArrowLeft is 24 CSS px,
    // a thirtieth of the range, so fifteen land on the edge in floats as a
    // tiny positive number that String() writes in exponent form.
    const panorama = { width: 2048, height: 512 }
    let crop = CENTER_CROP
    for (let i = 0; i < 15; i++) {
      crop = dragCrop(crop, { dx: 24, dy: 0 }, 240, panorama)
    }
    expect(String(crop.x)).toMatch(/e-/)

    const posted = postedCrop(crop)
    expect(posted).toEqual({ x: 0, y: 0.5 })
    expect(String(posted.x)).toBe('0')
  })

  it('rounds to four decimals, snaps to the edges and stays in 0–1', () => {
    expect(postedCrop({ x: 0.123456, y: 0.99999999 })).toEqual({
      x: 0.1235,
      y: 1,
    })
    expect(postedCrop({ x: -3e-17, y: 1.0000000002 })).toEqual({ x: 0, y: 1 })
    expect(postedCrop({ x: NaN, y: 2 })).toEqual({ x: 0.5, y: 1 })
  })

  it('always writes as a plain decimal, never in exponent form', () => {
    for (let i = 0; i <= 10_000; i++) {
      const { x } = postedCrop({ x: i / 10_000 + 1e-12, y: 0.5 })
      expect(String(x)).toMatch(/^(0|1|0\.\d{1,4})$/)
    }
  })
})
