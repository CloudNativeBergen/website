/**
 * Per-tenant brand colours for the OpenGraph share cards.
 *
 * The cards are the platform's most outward-facing surface: every share of a
 * tenant's site posts one. They used to be painted with the house gradient
 * unconditionally, so a conference with its own brand still advertised somebody
 * else's blue. This resolves the SAME stored `theme` pair the site CSS, the
 * email templates and the PWA manifest read (`@/lib/branding/theme`) into the
 * concrete hex values an `ImageResponse` needs.
 *
 * WHY A SEPARATE HELPER: the site consumes the theme as CSS custom properties
 * (`conferenceThemeCss`) — a card has no cascade and no `color-mix()`, it needs
 * literal hex. And unlike the site, the card BAKES WHITE TEXT onto the brand
 * colour, so a very light brand cannot be used verbatim (see the clamp below).
 * The pair-validity rule itself is NOT re-derived here; it comes from
 * `resolveBrandPair`.
 *
 * RUNTIME: pure arithmetic on strings — no Node built-ins, no `Buffer`, no
 * `fetch`. Safe to import from the Node-runtime routes under `(main)` AND from
 * the edge-runtime badge card under `(public)/badge/[badgeId]`.
 *
 * BACK-COMPAT: an unthemed conference (no theme, half a theme, or a malformed
 * value) returns the caller's house fallback VERBATIM — the same literal hex
 * strings the routes hard-coded before — so the rendered bytes are unchanged.
 * The clamp below only ever runs on tenant-supplied colours.
 */

import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
  resolveBrandPair,
  type ConferenceTheme,
} from '@/lib/branding/theme'

/**
 * Ceiling on the relative luminance of the gradient the card paints WHITE TEXT
 * on. 0.3 is the WCAG 2.x AA bar for LARGE text: 1.05 / (0.3 + 0.05) = 3.0:1.
 *
 * SCOPE, precisely: the cards' headline/subtitle/detail type (24–80px) is large
 * text and this ceiling is its AA guarantee. The cards ALSO carry some smaller
 * white type directly on the gradient — the 12px sponsor-section labels and the
 * 16–18px date/location/domain lines — which by WCAG needs 4.5:1 and therefore a
 * background at luminance ≤ 0.1833. Those elements are NOT covered by this
 * ceiling. That is inherited from the house design, not introduced by theming:
 * the house cyan (#06B6D4, luminance 0.3825) gives them 2.43:1 today. Tightening
 * this constant to 0.1833 would fix it for themed tenants, but it darkens every
 * themed gradient, so it is a design decision rather than a correctness fix and
 * is deliberately left alone here. Do not restate this ceiling as covering
 * "every text element" — it does not.
 *
 * The bound holds across the whole gradient, not just its endpoints: the sRGB
 * transfer function is convex, so the luminance of a channel-wise interpolation
 * never exceeds the interpolation of the endpoint luminances. Clamping both
 * ends therefore clamps every pixel between them.
 */
export const OG_MAX_BACKGROUND_LUMINANCE = 0.3

/**
 * Alpha of the near-white chips the brand colour is painted ON as text — the
 * sponsor-name fallback on the speaker card and the "OpenBadges 3.0 Verified"
 * pill on the badge card. Both are `rgba(255, 255, 255, 0.9)`, i.e. NOT white:
 * they let 10% of the brand gradient through.
 */
export const OG_CHIP_BACKGROUND_ALPHA = 0.9

/**
 * Ceiling for the brand colour used as TEXT on those chips.
 *
 * The chips' type is 14–16px at weight 600. That is not "large" by WCAG (which
 * needs ≥ 24px, or ≥ 18.66px bold), so the bar is the small-text one, 4.5:1.
 *
 * The bar must be met against what is actually PAINTED behind the glyphs, and
 * that is not white — it is the 90%-opaque white chip composited over the card's
 * own gradient, which is darker than white by construction. The worst case is a
 * tenant whose gradient runs to black there: the composite is then
 * 0.9 x 255 = 229.5 per channel, relative luminance 0.7874, not 1.0. Solving
 * (0.7874 + 0.05) / 4.5 - 0.05 gives 0.1361, and 0.135 is the value under it
 * that still clears the bar after the renderer quantises the composite down to
 * an integer channel (229 → 4.51:1).
 *
 * The previous 0.18 was derived against pure white (1.05 / 0.23 = 4.57:1) but
 * applied on the composite, where it is only 3.64:1 — it never delivered AA for
 * small text. `contrastRatio` + `compositeWhiteOver` below express this
 * derivation as code so the test suite can recompute it rather than trust prose.
 */
export const OG_MAX_TEXT_LUMINANCE = 0.135

/** The house gradient pair, used when a conference is unthemed. */
export const HOUSE_OG_PAIR = {
  primary: DEFAULT_PRIMARY_COLOR,
  accent: DEFAULT_ACCENT_COLOR,
} as const

export interface OgBrandPair {
  primary: string
  accent: string
}

export interface OgBrandColors {
  /** Gradient start — the tenant primary, contrast-clamped, or the fallback. */
  primary: string
  /** Gradient end — the tenant accent, contrast-clamped, or the fallback. */
  accent: string
  /** Ready-to-use CSS value for the card background. */
  gradient: string
  /** The brand colour as TEXT on a near-white chip (darker clamp). */
  textOnLight: string
  /** True when the conference supplied a complete, valid theme pair. */
  themed: boolean
}

function parseChannels(hex: string): [number, number, number] {
  const v = hex.trim().replace('#', '')
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ]
}

function toHex(channels: [number, number, number]): string {
  return (
    '#' +
    channels
      .map((c) =>
        Math.max(0, Math.min(255, Math.round(c)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  )
}

/** sRGB electro-optical transfer function for one 0–255 channel. */
function linearize(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance (0 = black, 1 = white) of a 6-digit hex colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseChannels(hex)
  if ([r, g, b].some(Number.isNaN)) return 0
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/**
 * WCAG contrast ratio between two 6-digit hex colours, order-independent.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * The colour actually painted when white at `alpha` covers `behind`.
 *
 * Alpha compositing in an `ImageResponse` happens in gamma-encoded sRGB — satori
 * emits SVG and resvg blends the encoded channels directly — so this is a plain
 * per-channel lerp on the 0–255 values, NOT a blend of linearised light. The
 * channels are floored rather than rounded: flooring can only make the composite
 * darker, so a contrast bound computed from it holds for the rounded pixel the
 * renderer actually emits.
 */
export function compositeWhiteOver(behind: string, alpha: number): string {
  const channels = parseChannels(behind)
  return toHex([
    Math.floor(alpha * 255 + (1 - alpha) * channels[0]),
    Math.floor(alpha * 255 + (1 - alpha) * channels[1]),
    Math.floor(alpha * 255 + (1 - alpha) * channels[2]),
  ])
}

/**
 * The darkest a chip's background can ever be: the chip over a black gradient.
 * This is the background `OG_MAX_TEXT_LUMINANCE` is derived against — every real
 * gradient is lighter than black, so every real chip has MORE contrast than this.
 */
export const OG_DARKEST_CHIP_BACKGROUND = compositeWhiteOver(
  '#000000',
  OG_CHIP_BACKGROUND_ALPHA,
)

/**
 * Darken `hex` just enough to bring its relative luminance to `max`, by scaling
 * all three channels by a single factor. Scaling (rather than mixing toward
 * black in a perceptual space) keeps the hue and the channel ratios intact, so
 * a pastel brand reads as a deeper shade of the SAME colour rather than as a
 * different one.
 *
 * Returns the input UNCHANGED when it is already dark enough — which is the
 * common case for real brand colours and the reason a themed conference usually
 * gets its stored hex verbatim.
 */
function clampLuminance(hex: string, max: number): string {
  if (relativeLuminance(hex) <= max) return hex

  const channels = parseChannels(hex)
  // Luminance is monotonic in the scale factor, so binary-search it.
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const scaled = toHex([
      channels[0] * mid,
      channels[1] * mid,
      channels[2] * mid,
    ])
    if (relativeLuminance(scaled) > max) hi = mid
    else lo = mid
  }
  // Floor the channels: flooring can only lower luminance, so the result is
  // guaranteed to satisfy the ceiling even after integer rounding.
  return toHex([
    Math.floor(channels[0] * lo),
    Math.floor(channels[1] * lo),
    Math.floor(channels[2] * lo),
  ])
}

/**
 * Resolve the colours an OpenGraph card should paint for a conference.
 *
 * `fallback` is the card's own house pair — the literal hexes it used before
 * theming existed. The badge card's blue→green differs from the main cards'
 * blue→cyan, so each caller passes its own; unthemed conferences keep exactly
 * what they rendered before.
 */
export function ogBrandColors(
  theme?: ConferenceTheme | null,
  fallback: OgBrandPair = HOUSE_OG_PAIR,
): OgBrandColors {
  const pair = resolveBrandPair(theme)

  if (!pair) {
    // UNTHEMED: verbatim house values, no clamping. This is the byte-identical
    // path the three live editions without a stored theme take.
    return {
      primary: fallback.primary,
      accent: fallback.accent,
      gradient: ogGradient(fallback.primary, fallback.accent),
      textOnLight: fallback.primary,
      themed: false,
    }
  }

  const primary = clampLuminance(pair.primary, OG_MAX_BACKGROUND_LUMINANCE)
  const accent = clampLuminance(pair.accent, OG_MAX_BACKGROUND_LUMINANCE)

  return {
    primary,
    accent,
    gradient: ogGradient(primary, accent),
    textOnLight: clampLuminance(pair.primary, OG_MAX_TEXT_LUMINANCE),
    themed: true,
  }
}

/** The card background gradient. Format is load-bearing: it must reproduce the
 * previously hard-coded string exactly for the unthemed case. */
function ogGradient(primary: string, accent: string): string {
  return `linear-gradient(135deg, ${primary}, ${accent})`
}
