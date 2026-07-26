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
 * L1 constraint: colours are used VERBATIM. No contrast auto-derivation and no
 * clamping — a light primary on a white surface is the admin's call (the
 * settings preview surfaces the result before they save). The one derived value
 * is the hover shade, computed in pure CSS via `color-mix` (a darker primary),
 * which only ever appears in the injected override, never in the default path.
 */

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
 * Build the `<style>` body that injects a conference's theme onto `:root`.
 * Returns an EMPTY string when there is nothing to override (no theme, or no
 * valid colour) — callers render no `<style>` at all in that case, keeping the
 * default output byte-identical.
 *
 * Only well-formed hex values are emitted; a malformed stored value is ignored
 * (defence in depth — the schema already rejects them on write). The hover
 * shade is derived from the primary purely in CSS so no colour maths lives here.
 */
export function conferenceThemeCss(theme?: ConferenceTheme | null): string {
  if (!theme) return ''

  // ALL-OR-NOTHING, matching the write-path contract (Zod + Studio both
  // enforce the pair): a half-theme — legacy or malformed data with only one
  // valid colour — renders NO override at all rather than a half-themed UI.
  const primary = theme.primaryColor?.trim()
  const accent = theme.accentColor?.trim()
  if (!primary || !isHexColor(primary) || !accent || !isHexColor(accent)) {
    return ''
  }

  const decls: string[] = []
  let hoverMix: string | null = null

  if (primary && isHexColor(primary)) {
    decls.push(`--brand-primary:${primary}`)
    // Hover fallback for engines without color-mix(): the primary itself. An
    // unsupported function in a custom property is only detected at var()
    // substitution time (the property computes to invalid → the hover rule is
    // DROPPED entirely), so the safe value must live in the base block and the
    // color-mix upgrade behind @supports.
    decls.push(`--brand-primary-hover:${primary}`)
    // L1 hover = a slightly darker primary, derived in pure CSS (no derivation
    // logic in TS). color-mix is only ever emitted here, never on the default
    // path, so it can't affect the no-override pixel-identity guarantee.
    hoverMix = `--brand-primary-hover:color-mix(in srgb, ${primary} 85%, #000)`
  }

  if (accent && isHexColor(accent)) {
    decls.push(`--brand-accent:${accent}`)
  }

  if (decls.length === 0) return ''
  const base = `:root{${decls.join(';')}}`
  return hoverMix
    ? `${base}@supports (color: color-mix(in srgb, red 50%, blue)){:root{${hoverMix}}}`
    : base
}

/**
 * The brand accent colour for a conference's outbound email (BaseEmailTemplate
 * `brandColor`). Email cannot read CSS custom properties, so senders resolve the
 * primary hex here and pass it explicitly. Falls back to the house blue when no
 * theme is set — the same default `BaseEmailTemplate` already uses.
 */
export function emailBrandColor(theme?: ConferenceTheme | null): string {
  const primary = theme?.primaryColor?.trim()
  return primary && isHexColor(primary) ? primary : DEFAULT_PRIMARY_COLOR
}

/**
 * The PWA manifest `theme_color` for a conference. Same resolution as email:
 * the primary hex when themed, else the house blue.
 */
export function manifestThemeColor(theme?: ConferenceTheme | null): string {
  return emailBrandColor(theme)
}
