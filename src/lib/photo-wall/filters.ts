/**
 * THE NINE FILTERS (Photo Wall spec §6.5). Client-safe and pure: RGBA bytes
 * in, RGBA bytes out, no canvas.
 *
 * One implementation runs on the small preview copy and on the full-size
 * bake, so what the contributor sees is what is uploaded. The looks are the
 * prototype's CSS filter chains (`Prototypes/PhotoWall/PhoneFlow`), folded
 * into one colour matrix each, plus the three tint overlays as per-pixel
 * blend maths; `CanvasRenderingContext2D.filter` is never relied on
 * (unverified on iOS Safari).
 */

export const WALL_FILTER_KEYS = [
  'original',
  'vivid',
  'warm',
  'fade',
  'fjord',
  'aurora',
  'mono',
  'noir',
  'retro',
] as const
export type WallFilterKey = (typeof WALL_FILTER_KEYS)[number]

export interface WallFilter {
  key: WallFilterKey
  label: string
}

export const WALL_FILTERS: readonly WallFilter[] = [
  { key: 'original', label: 'Original' },
  { key: 'vivid', label: 'Vivid' },
  { key: 'warm', label: 'Warm' },
  { key: 'fade', label: 'Fade' },
  { key: 'fjord', label: 'Fjord' },
  { key: 'aurora', label: 'Aurora' },
  { key: 'mono', label: 'Mono' },
  { key: 'noir', label: 'Noir' },
  { key: 'retro', label: 'Retro' },
]

// ---------------------------------------------------------------------------
// Colour matrices: a 3x3 on RGB in 0–1 plus an offset, composed in CSS order.
// The coefficients are the Filter Effects spec's.
// ---------------------------------------------------------------------------

/** Row-major 3x3 followed by the offset vector. */
type Matrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

/** `second` applied after `first`. */
function compose(first: Matrix, second: Matrix): Matrix {
  const out = [...IDENTITY] as Matrix
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        second[r * 3] * first[c] +
        second[r * 3 + 1] * first[3 + c] +
        second[r * 3 + 2] * first[6 + c]
    }
    out[9 + r] =
      second[r * 3] * first[9] +
      second[r * 3 + 1] * first[10] +
      second[r * 3 + 2] * first[11] +
      second[9 + r]
  }
  return out
}

const chain = (...steps: Matrix[]) => steps.reduce(compose, IDENTITY)

const grayscale = (a: number): Matrix => {
  const k = 1 - a
  return [
    0.2126 + 0.7874 * k,
    0.7152 - 0.7152 * k,
    0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k,
    0.7152 + 0.2848 * k,
    0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k,
    0.7152 - 0.7152 * k,
    0.0722 + 0.9278 * k,
    0,
    0,
    0,
  ]
}

const sepia = (a: number): Matrix => {
  const k = 1 - a
  return [
    0.393 + 0.607 * k,
    0.769 - 0.769 * k,
    0.189 - 0.189 * k,
    0.349 - 0.349 * k,
    0.686 + 0.314 * k,
    0.168 - 0.168 * k,
    0.272 - 0.272 * k,
    0.534 - 0.534 * k,
    0.131 + 0.869 * k,
    0,
    0,
    0,
  ]
}

const saturate = (s: number): Matrix => [
  0.213 + 0.787 * s,
  0.715 - 0.715 * s,
  0.072 - 0.072 * s,
  0.213 - 0.213 * s,
  0.715 + 0.285 * s,
  0.072 - 0.072 * s,
  0.213 - 0.213 * s,
  0.715 - 0.715 * s,
  0.072 + 0.928 * s,
  0,
  0,
  0,
]

const contrast = (c: number): Matrix => {
  const o = (1 - c) / 2
  return [c, 0, 0, 0, c, 0, 0, 0, c, o, o, o]
}

const brightness = (b: number): Matrix => [b, 0, 0, 0, b, 0, 0, 0, b, 0, 0, 0]

// ---------------------------------------------------------------------------
// Tints: a translucent colour blended over the filtered pixel, with the
// compositing spec's soft-light and multiply formulas. Channels in 0–1.
// ---------------------------------------------------------------------------

type Rgb = [number, number, number]
const rgb = (r: number, g: number, b: number): Rgb => [
  r / 255,
  g / 255,
  b / 255,
]

const softLight = (cb: number, cs: number) => {
  if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb)
  const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb)
  return cb + (2 * cs - 1) * (d - cb)
}
const multiply = (cb: number, cs: number) => cb * cs

interface Tint {
  blend: (cb: number, cs: number) => number
  alpha: number
  /** The tint colour at a position in 0–1 across the image. */
  colour: (tx: number, ty: number) => Rgb
}

const solid = (c: Rgb) => () => c
/** The prototype's `linear-gradient(135deg, from, to)`: top-left to bottom-right. */
const diagonal = (from: Rgb, to: Rgb) => (tx: number, ty: number) => {
  const t = (tx + ty) / 2
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ] as Rgb
}

interface Look {
  matrix: Matrix
  tint?: Tint
}

const LOOKS: Record<WallFilterKey, Look> = {
  original: { matrix: IDENTITY },
  vivid: { matrix: chain(contrast(1.15), saturate(1.45)) },
  warm: {
    matrix: chain(sepia(0.22), saturate(1.3), contrast(1.05), brightness(1.04)),
  },
  fade: { matrix: chain(contrast(0.82), brightness(1.12), saturate(0.75)) },
  fjord: {
    matrix: chain(saturate(1.1), contrast(1.05), brightness(1.04)),
    tint: { blend: softLight, alpha: 0.45, colour: solid(rgb(29, 78, 216)) },
  },
  aurora: {
    matrix: chain(contrast(1.1), saturate(1.3)),
    tint: {
      blend: softLight,
      alpha: 0.45,
      colour: diagonal(rgb(16, 185, 129), rgb(99, 102, 241)),
    },
  },
  mono: { matrix: chain(grayscale(1), contrast(1.1)) },
  noir: { matrix: chain(grayscale(1), contrast(1.5), brightness(0.88)) },
  retro: {
    matrix: chain(sepia(0.45), contrast(1.1), brightness(1.05), saturate(1.2)),
    tint: { blend: multiply, alpha: 0.14, colour: solid(rgb(250, 204, 21)) },
  },
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Applies the filter to RGBA pixels in place (an `ImageData`'s `data`).
 * Alpha is untouched. `width` and `height` place the Aurora gradient.
 */
export function applyWallFilter(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  key: WallFilterKey,
): void {
  if (key === 'original') return
  const { matrix: m, tint } = LOOKS[key]
  const alpha = tint?.alpha ?? 0
  const keep = 1 - alpha
  const xStep = width > 1 ? 1 / (width - 1) : 0
  const yStep = height > 1 ? 1 / (height - 1) : 0
  let i = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255
      let fr = clamp01(m[0] * r + m[1] * g + m[2] * b + m[9])
      let fg = clamp01(m[3] * r + m[4] * g + m[5] * b + m[10])
      let fb = clamp01(m[6] * r + m[7] * g + m[8] * b + m[11])
      if (tint) {
        const [tr, tg, tb] = tint.colour(x * xStep, y * yStep)
        fr = fr * keep + tint.blend(fr, tr) * alpha
        fg = fg * keep + tint.blend(fg, tg) * alpha
        fb = fb * keep + tint.blend(fb, tb) * alpha
      }
      data[i] = Math.round(fr * 255)
      data[i + 1] = Math.round(fg * 255)
      data[i + 2] = Math.round(fb * 255)
    }
  }
}
