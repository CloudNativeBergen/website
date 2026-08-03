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
 * Ceiling on the relative luminance of anything the card paints WHITE TEXT on.
 * 0.3 is the WCAG 2.x AA bar for large text (contrast ≥ 3:1 against white:
 * 1.05 / (0.3 + 0.05) = 3.0), and every text element on the cards is ≥ 24px
 * bold, i.e. "large".
 *
 * The bound holds across the whole gradient, not just its endpoints: the sRGB
 * transfer function is convex, so the luminance of a channel-wise interpolation
 * never exceeds the interpolation of the endpoint luminances. Clamping both
 * ends therefore clamps every pixel between them.
 */
export const OG_MAX_BACKGROUND_LUMINANCE = 0.3

/**
 * Ceiling for the brand colour used as TEXT on the cards' near-white chips
 * (the sponsor-name fallback, the "OpenBadges verified" pill). 0.18 keeps it at
 * ≥ 4.5:1 against white — the AA bar for small text, which those chips are.
 */
export const OG_MAX_TEXT_LUMINANCE = 0.18

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
