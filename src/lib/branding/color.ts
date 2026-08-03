/**
 * Perceptual colour maths for the per-tenant brand theme (THEMING L1).
 *
 * The dark-mode brand utilities in `src/styles/tailwind.css` do NOT want the
 * tenant's raw primary — a colour picked to read on a WHITE page glares on a
 * dark one, and a near-black primary vanishes into it. The house palette solves
 * this by hand: `#1D4ED8` (blue-700) becomes `#1E40AF` (blue-800) as a dark
 * surface and `#93C5FD` (blue-300) as dark text, while the accent `#06B6D4`
 * (cyan-500) becomes `#155E75` (cyan-800).
 *
 * Those hand-tuned shades are NOT one uniform darkening: blue-700 → blue-800
 * scales sRGB by ~0.82 while cyan-500 → cyan-800 scales it by ~0.55. What they
 * DO share is a target *perceptual lightness* — in OKLab, blue-800 sits at
 * L 0.424 and cyan-800 at L 0.450, i.e. both land in the same narrow band no
 * matter their hue. That is the invariant this module reproduces:
 *
 *   **mix the tenant's colour with black (to darken) or white (to lighten),
 *   in OKLab, until it reaches a fixed target lightness.**
 *
 * Targeting an absolute lightness — rather than applying a fixed percentage —
 * is what makes the result hue-independent, and it is why this cannot be done
 * with CSS `color-mix()`: the mix percentage depends on the tenant colour's own
 * lightness, which CSS cannot measure. Computing it here also sidesteps the
 * `color-mix`-inside-a-custom-property fallback problem documented in
 * `theme.ts` (an unsupported function is only detected at `var()` substitution
 * time, dropping the whole declaration) — we emit plain hex.
 *
 * Mixing toward black/white in OKLab scales chroma by the same factor as
 * lightness, so the result desaturates as it darkens, the way a hand-built
 * colour ramp does. It is *nearly* always inside sRGB — OKLab's cube-root
 * nonlinearity means the mix path can bulge a little outside the gamut for
 * extremely chromatic inputs (pure `#00FF00` asked for a lighter tint) — so the
 * final step reduces chroma at fixed lightness and hue until it fits. That is
 * the standard CSS Color 4 gamut-mapping direction: give up saturation, never
 * lightness, because lightness is what carries contrast.
 */

/* -------------------------------------------------------------------------- */
/* sRGB <-> OKLab                                                             */
/* -------------------------------------------------------------------------- */

type Oklab = readonly [L: number, a: number, b: number]

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055

const HEX_COLOR = /^#([0-9a-f]{6})$/i

/**
 * Parse `#rrggbb` into 0..1 sRGB components.
 *
 * Validates rather than assuming. The production path already gates on the same
 * shape before it gets here, so this never fires in the app — but sliced
 * unchecked, `'#12345'` parsed as `#3b5733` and `''` as `#NaNNaNNaN`: a wrong
 * brand colour served silently, which is a far worse failure than a stack
 * trace. Throwing keeps a malformed value from ever reaching a stylesheet.
 */
function parseHex(hex: string): readonly [number, number, number] {
  const match = HEX_COLOR.exec(hex.trim())
  if (!match) {
    throw new TypeError(
      `Expected a #rrggbb colour, received ${JSON.stringify(hex)}`,
    )
  }
  const h = match[1]
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

/** Serialise 0..1 sRGB components as lowercase `#rrggbb`, clamping out-of-range. */
function formatHex(rgb: readonly [number, number, number]): string {
  const channel = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`
}

/** Björn Ottosson's OKLab forward transform (sRGB, D65). */
function srgbToOklab(rgb: readonly [number, number, number]): Oklab {
  const r = srgbToLinear(rgb[0])
  const g = srgbToLinear(rgb[1])
  const b = srgbToLinear(rgb[2])

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Inverse of {@link srgbToOklab}. May return components slightly outside 0..1. */
function oklabToSrgb(lab: Oklab): readonly [number, number, number] {
  const l = (lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2]) ** 3
  const m = (lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2]) ** 3
  const s = (lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2]) ** 3

  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** True when every sRGB component is within 0..1, allowing for float slop. */
function isDisplayable(rgb: readonly [number, number, number]): boolean {
  return rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)
}

/* -------------------------------------------------------------------------- */
/* The transform                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Mix `hex` with black or white in OKLab until it reaches `targetL`, keeping
 * its hue. Chroma scales with the mix, so the colour desaturates as it moves
 * away from its natural lightness — the same behaviour a hand-built ramp has.
 *
 * `targetL` is an OKLab lightness in 0..1 (perceptual, NOT WCAG luminance).
 * Returns lowercase `#rrggbb`.
 */
export function shiftToLightness(hex: string, targetL: number): string {
  const [L, a, b] = srgbToOklab(parseHex(hex))

  // Mixing black into a colour at lightness L by fraction p yields (p·L, p·a,
  // p·b); mixing white yields (p·L + (1-p), p·a, p·b). Solving each for the p
  // that lands on targetL gives the scale factors below. The degenerate ends
  // (pure black asked to lighten, pure white asked to darken) carry no hue, so
  // they collapse to a neutral grey — the only sensible answer.
  const scale =
    targetL <= L
      ? L === 0
        ? 0
        : targetL / L
      : L === 1
        ? 0
        : (1 - targetL) / (1 - L)

  let hi = 1
  if (!isDisplayable(oklabToSrgb([targetL, a * scale, b * scale]))) {
    // Out of sRGB: bisect the chroma down (lightness and hue fixed) until it
    // fits. `lo = 0` is always displayable — it is the neutral grey at targetL,
    // and targetL is within 0..1 by construction. 20 halvings resolve far below
    // one 8-bit step, so the result is stable.
    let lo = 0
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (
        isDisplayable(oklabToSrgb([targetL, a * scale * mid, b * scale * mid]))
      )
        lo = mid
      else hi = mid
    }
    hi = lo
  }

  return formatHex(oklabToSrgb([targetL, a * scale * hi, b * scale * hi]))
}

/* -------------------------------------------------------------------------- */
/* Dark-mode targets                                                          */
/* -------------------------------------------------------------------------- */

/**
 * OKLab lightness targets for the dark-mode brand tints, each taken from the
 * house shade the hand-written `.dark` rule in `tailwind.css` already uses. A
 * tenant's colours are moved onto these bands so every theme lands where the
 * house palette lands, whatever hue it starts from.
 */
export const DARK_TINT_LIGHTNESS = {
  /** Brand surfaces (`bg-brand-cloud-blue`, its hover). House: blue-800 `#1E40AF`. */
  surface: 0.424,
  /** Brand gradient START — a shade below `surface`. House: blue-900 `#1E3A8A`. */
  deep: 0.379,
  /** Brand borders — a shade ABOVE `surface`, so an edge reads. House: blue-600 `#2563EB`. */
  edge: 0.546,
  /**
   * Brand TEXT on a dark background. The one target that lightens rather than
   * darkens: `#93C5FD` (blue-300) is a light tint chosen for contrast, not a
   * darkened brand colour. House: blue-300.
   */
  text: 0.809,
  /** Brand gradient END (the accent). House: cyan-800 `#155E75`. */
  accent: 0.45,
} as const
