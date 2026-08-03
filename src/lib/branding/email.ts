/**
 * The derived colour palette for one outbound email (THEMING L1, email surface).
 *
 * WHY A PALETTE AND NOT JUST A HEX. Email clients do not support CSS custom
 * properties, `color-mix()`, `@supports` or (reliably) media queries — every
 * colour has to ship as a literal hex inlined on the element. So the site's
 * `--brand-*` mechanism cannot be reused: the sender must RESOLVE the whole
 * derived set server-side and hand it to the template. This module is that
 * resolution, and the only place email colour maths lives.
 *
 * WHAT IS AND IS NOT BRANDED. Brand-toned surfaces (titles, links, buttons,
 * section headers, callout cards) follow the tenant. STATUS colours — reject
 * red, waitlist orange, success green — deliberately do NOT: they carry meaning
 * rather than identity, and a rejection rendered in a conference's own brand
 * colour is worse than one rendered in the house red. Status colours therefore
 * never appear in this palette; templates keep their literals.
 *
 * BYTE-IDENTITY. `resolveEmailBrandPalette(undefined)` — and the house blue
 * passed explicitly — returns exactly the literals the templates hard-coded
 * before branding existed, so the conference editions that store no theme send
 * the same bytes they always have. Every field below documents its house value.
 */
import { ensureContrastWithWhite, lightnessOf, shiftToLightness } from './color'
import { DEFAULT_PRIMARY_COLOR, isHexColor } from './theme'

export interface EmailBrandPalette {
  /**
   * The tenant's primary, VERBATIM. Only for places where the colour is not
   * text and not a text background (currently none) — prefer `accent`.
   */
  primary: string
  /**
   * The brand colour made readable against white: titles, links, section
   * headers, footer emphasis and the button fill all sit against (or carry)
   * white, so all of them use this one value. House: `#1D4ED8` unchanged.
   */
  accent: string
  /** `box-shadow` colour under the primary button. House: `rgba(29, 78, 216, 0.25)`. */
  buttonShadow: string
  /** Callout / event-details card fill. House: `#E0F2FE` (sky-100). */
  cardBackground: string
  /**
   * Callout card border. Slate — NOT brand. It is a neutral hairline that reads
   * against every hue, and tinting it per tenant buys nothing but a second
   * colour to get wrong.
   */
  cardBorder: string
  /**
   * Emphasis (`<em>`) in rich-text bodies. The house value is an off-palette
   * purple `#7C3AED` that predates theming; a themed tenant gets its own accent
   * instead of a third party's purple. Preserved verbatim when unthemed because
   * changing it would change unthemed bytes.
   */
  emphasis: string
  /** True when this palette is the house default (nothing tenant-specific). */
  isDefault: boolean
}

const HOUSE_CARD_BACKGROUND = '#E0F2FE'
const HOUSE_CARD_BORDER = '#CBD5E1'
const HOUSE_EMPHASIS = '#7C3AED'

/** `#rrggbb` -> `rgba(r, g, b, alpha)`, matching the house shadow's spacing. */
function rgba(hex: string, alpha: number): string {
  const h = hex.trim().slice(1)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Replace a hard-coded HOUSE brand literal with the tenant's accent.
 *
 * The templates did not agree on one house blue — `#1D4ED8` dominates but
 * `#1E40AF`, `#2563EB` and `#0284C7` appear too, drift rather than design.
 * There is no tenant equivalent of "the slightly different blue", so a themed
 * tenant collapses all of them onto its own accent, while an UNTHEMED tenant
 * keeps the exact literal it has always received. That is what makes this swap
 * mechanical and safe: every call site is provably byte-identical when there is
 * no theme, whatever literal it started from.
 *
 * Never wrap a STATUS colour in this. Reject red, waitlist orange and success
 * green mean something; they are not brand.
 */
export function brandedOr(
  palette: EmailBrandPalette,
  houseColor: string,
): string {
  return palette.isDefault ? houseColor : palette.accent
}

/**
 * Like {@link brandedOr}, but for a house TINT rather than the brand colour
 * itself — the pale callout fills and hairline borders (`#F0F9FF`, `#BFDBFE`,
 * `#BAE6FD`, `#E0F2FE`).
 *
 * Those cannot map onto the accent: a card filled with the tenant's primary is
 * an unreadable block. What they share with the accent is HUE, so the tenant's
 * colour is moved onto the house shade's own perceptual lightness — the same
 * trick the dark-mode brand tints use (`DARK_TINT_LIGHTNESS`). A magenta tenant
 * gets a pale magenta card at exactly the weight the pale blue one had, so the
 * layout reads identically.
 *
 * Unthemed returns the house literal untouched.
 */
export function brandedTintOr(
  palette: EmailBrandPalette,
  houseTint: string,
): string {
  return palette.isDefault
    ? houseTint
    : shiftToLightness(palette.primary, lightnessOf(houseTint))
}

/**
 * The `box-shadow` colour for a primary email button of the given fill. Exposed
 * so a call site that overrides the fill explicitly still gets a matching
 * shadow instead of the palette's.
 */
export function emailButtonShadow(hex: string): string {
  return isHexColor(hex)
    ? rgba(hex, 0.25)
    : DEFAULT_EMAIL_BRAND_PALETTE.buttonShadow
}

export const DEFAULT_EMAIL_BRAND_PALETTE: EmailBrandPalette = {
  primary: DEFAULT_PRIMARY_COLOR,
  accent: DEFAULT_PRIMARY_COLOR,
  buttonShadow: rgba(DEFAULT_PRIMARY_COLOR, 0.25),
  cardBackground: HOUSE_CARD_BACKGROUND,
  cardBorder: HOUSE_CARD_BORDER,
  emphasis: HOUSE_EMPHASIS,
  isDefault: true,
}

// Templates render the same handful of colours dozens of times per send and the
// derivations bisect; one small cache keeps a broadcast from redoing the work
// per recipient. Keyed by the input hex, and the palette is frozen so a caller
// cannot mutate a shared entry.
const cache = new Map<string, EmailBrandPalette>()

/**
 * Derive the full email palette from a tenant's primary hex.
 *
 * `undefined`, a malformed value, or the house blue itself all resolve to
 * {@link DEFAULT_EMAIL_BRAND_PALETTE} — the pre-theming literals, byte for
 * byte. A malformed value falls back rather than throwing: a colour typo must
 * not stop a ticket confirmation from being sent.
 */
export function resolveEmailBrandPalette(
  brandColor?: string | null,
): EmailBrandPalette {
  const hex = brandColor?.trim()
  if (!hex || !isHexColor(hex)) return DEFAULT_EMAIL_BRAND_PALETTE
  if (hex.toLowerCase() === DEFAULT_PRIMARY_COLOR.toLowerCase()) {
    return DEFAULT_EMAIL_BRAND_PALETTE
  }

  const cached = cache.get(hex)
  if (cached) return cached

  // One clamp serves both directions: an email button is white text ON the
  // accent and a link is the accent ON white, and the WCAG ratio is symmetric,
  // so the single "readable against white" constraint covers every use. Hue is
  // preserved (see `ensureContrastWithWhite`), so a pale-yellow brand darkens
  // into a readable gold rather than turning grey.
  const accent = ensureContrastWithWhite(hex)

  const palette: EmailBrandPalette = Object.freeze({
    primary: hex,
    accent,
    buttonShadow: rgba(accent, 0.25),
    // The house card is sky-100, not a tint of blue-700, so this derivation
    // deliberately does NOT reproduce `#E0F2FE` for the house blue — the
    // short-circuit above is what guarantees that, not this line.
    cardBackground: shiftToLightness(hex, lightnessOf(HOUSE_CARD_BACKGROUND)),
    cardBorder: HOUSE_CARD_BORDER,
    emphasis: accent,
    isDefault: false,
  })

  cache.set(hex, palette)
  return palette
}
