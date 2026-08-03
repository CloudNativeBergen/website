/**
 * Per-tenant brand theme resolution (THEMING L1).
 *
 * A conference may carry an optional `theme` object overriding the site's two
 * L1 brand knobs:
 *   - `primaryColor` — the primary interactive colour (buttons, links, focus
 *     rings, the gradient START). Drives `--brand-primary`.
 *   - `accentColor`  — the gradient ENDPOINT / accent. Drives `--brand-accent`.
 *
 * These map onto the CSS custom-property seam in `src/styles/tailwind.css`
 * (`--color-brand-cloud-blue`, `--color-brand-cloud-blue-hover`,
 * `--color-brand-aqua-end` and the brand gradient all resolve through them,
 * with the house hex as the FALLBACK). With no theme the site renders
 * pixel-identical; with one, a single `:root` block re-skins light AND dark.
 *
 * DARK MODE gets its OWN variables (`--brand-primary-dark*`, `--brand-accent-dark`)
 * rather than reusing the light ones. The house palette does not paint dark
 * surfaces in the light primary — it uses hand-tuned darker/lighter shades — so
 * feeding the raw primary to the `.dark` rules made storing a theme a visible
 * change in dark mode. Those shades are derived per-tenant in
 * `./color`, which explains the transform.
 *
 * L1 constraint on the LIGHT palette is unchanged: colours are used VERBATIM,
 * with no contrast auto-derivation and no clamping — a light primary on a white
 * surface is the admin's call (the settings preview surfaces the result before
 * they save). The light hover shade is still derived in pure CSS via
 * `color-mix`, and appears only in the injected override, never in the default
 * path.
 */

import { DARK_TINT_LIGHTNESS, shiftToLightness } from './color'

/** A 6-digit hex colour, e.g. `#1D4ED8`. Case-insensitive; `#` required. */
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export interface ConferenceTheme {
  /** Primary interactive colour + gradient start. */
  primaryColor?: string
  /** Gradient endpoint / accent colour. */
  accentColor?: string
}

/** House defaults — the Cloud Native Days Norway palette (see tailwind.css). */
export const DEFAULT_PRIMARY_COLOR = '#1D4ED8'
export const DEFAULT_ACCENT_COLOR = '#06B6D4'

/** True when `value` is a syntactically valid 6-digit hex colour. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value.trim())
}

/**
 * The conference's brand pair resolved to concrete hex values, or `null` when
 * the conference is UNTHEMED.
 *
 * This is the single place the ALL-OR-NOTHING pair rule lives: a theme counts
 * only when BOTH colours are present and well-formed. A half-theme (legacy or
 * malformed data with one valid colour) or a malformed value resolves to `null`
 * — unthemed everywhere — so the site CSS, email, manifest and the OpenGraph
 * cards can never disagree about whether a tenant is themed.
 *
 * Returned values are TRIMMED but otherwise verbatim: no contrast derivation,
 * no clamping, no case normalisation (L1 constraint). Consumers that cannot use
 * a colour verbatim — the OG cards bake white text onto the brand gradient — do
 * their own bounded adjustment on top; see `@/lib/og/brand`.
 */
export function resolveBrandPair(
  theme?: ConferenceTheme | null,
): { primary: string; accent: string } | null {
  const primary = theme?.primaryColor?.trim()
  const accent = theme?.accentColor?.trim()
  if (!primary || !isHexColor(primary) || !accent || !isHexColor(accent)) {
    return null
  }
  return { primary, accent }
}

/**
 * Build the `<style>` body that injects a conference's theme onto `:root`.
 * Returns an EMPTY string when there is nothing to override (no theme, or no
 * valid colour) — callers render no `<style>` at all in that case, keeping the
 * default output byte-identical.
 *
 * Only well-formed hex values are emitted; a malformed stored value is ignored
 * (defence in depth — the schema already rejects them on write). The light
 * hover shade is derived from the primary purely in CSS; the dark tints are
 * derived as plain hex by `./color` (see there for the transform and why it
 * cannot be a `color-mix`).
 */
export function conferenceThemeCss(theme?: ConferenceTheme | null): string {
  // ALL-OR-NOTHING, matching the write-path contract (Zod + Studio both
  // enforce the pair): a half-theme — legacy or malformed data with only one
  // valid colour — renders NO override at all rather than a half-themed UI.
  const pair = resolveBrandPair(theme)
  if (!pair) return ''
  const { primary, accent } = pair

  const decls: string[] = [
    `--brand-primary:${primary}`,
    // Hover fallback for engines without color-mix(): the primary itself. An
    // unsupported function in a custom property is only detected at var()
    // substitution time (the property computes to invalid → the hover rule is
    // DROPPED entirely), so the safe value must live in the base block and the
    // color-mix upgrade behind @supports.
    `--brand-primary-hover:${primary}`,
    `--brand-accent:${accent}`,
    // Dark-mode tints. Each `.dark` brand rule in tailwind.css reads one of
    // these with its house shade as the fallback, so an unthemed site is
    // untouched while a themed one gets a properly darkened/lightened tint
    // instead of the raw light-mode colour.
    `--brand-primary-dark:${shiftToLightness(primary, DARK_TINT_LIGHTNESS.surface)}`,
    `--brand-primary-dark-deep:${shiftToLightness(primary, DARK_TINT_LIGHTNESS.deep)}`,
    `--brand-primary-dark-edge:${shiftToLightness(primary, DARK_TINT_LIGHTNESS.edge)}`,
    `--brand-primary-dark-text:${shiftToLightness(primary, DARK_TINT_LIGHTNESS.text)}`,
    `--brand-accent-dark:${shiftToLightness(accent, DARK_TINT_LIGHTNESS.accent)}`,
  ]

  // L1 light hover = a slightly darker primary, derived in pure CSS. color-mix
  // is only ever emitted here, never on the default path, so it can't affect
  // the no-override pixel-identity guarantee.
  const hoverMix = `--brand-primary-hover:color-mix(in srgb, ${primary} 85%, #000)`

  return (
    `:root{${decls.join(';')}}` +
    `@supports (color: color-mix(in srgb, red 50%, blue)){:root{${hoverMix}}}`
  )
}

/**
 * The brand accent colour for a conference's outbound email (BaseEmailTemplate
 * `brandColor`). Email cannot read CSS custom properties, so senders resolve the
 * primary hex here and pass it explicitly. Falls back to the house blue when no
 * theme is set — the same default `BaseEmailTemplate` already uses.
 */
export function emailBrandColor(theme?: ConferenceTheme | null): string {
  // Same ALL-OR-NOTHING pair rule as `conferenceThemeCss`: a half-theme
  // (legacy/malformed data) is unthemed EVERYWHERE — site, email and manifest
  // must never disagree about whether a tenant is themed.
  return resolveBrandPair(theme)?.primary ?? DEFAULT_PRIMARY_COLOR
}

/**
 * The PWA manifest `theme_color` for a conference. Same resolution as email:
 * the primary hex when themed, else the house blue.
 */
export function manifestThemeColor(theme?: ConferenceTheme | null): string {
  return emailBrandColor(theme)
}
