/**
 * The ONE URL-scheme gate for tenant-authored links.
 *
 * Organizer-entered hrefs (hero CTAs, CTA banners, rich-text links) are rendered
 * into every visitor's page on a SHARED multi-tenant deployment, so the scheme
 * surface is closed to exactly two shapes: a site-internal path (`/tickets`) and
 * an absolute `http(s)` URL with a host. Everything else — `javascript:`,
 * `data:`, `vbscript:`, scheme-relative `//evil.example`, `blob:`, degenerate
 * no-authority forms like `https:evil.example` — is refused.
 *
 * This module is intentionally DEPENDENCY-FREE (no `@/` alias, no runtime
 * imports) so the Sanity Studio build, the Next server bundle and the client
 * bundle can all share it instead of each keeping its own copy of the rule.
 *
 * Three call sites consume it, and all three must stay in agreement:
 *   - write path  — the Zod `safeLinkHref` refinement (`server/schemas/conference`)
 *   - render path — the portable-text `link` mark (`portabletext/components`)
 *   - Studio      — `safeLinkRule` (`sanity/schemaTypes/conference`)
 */

/** Scheme-relative (`//host`) is a protocol-inheriting ABSOLUTE URL, not a path. */
function isSiteRelativePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//')
}

/**
 * A site path or an absolute http(s) URL with a host.
 *
 * The explicit `^https?://` prefix check is load-bearing: `new URL` also parses
 * degenerate no-authority forms (`https:evil.example`) whose `protocol` is
 * `https:` but which are not the "full http(s) URL" this promises.
 */
export function isSafeLinkHref(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v) return false
  if (isSiteRelativePath(v)) return true
  if (!/^https?:\/\//i.test(v)) return false
  try {
    const parsed = new URL(v)
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.hostname.length > 0
    )
  } catch {
    return false
  }
}

/**
 * {@link isSafeLinkHref} plus `mailto:` — the extra scheme rich-text prose needs
 * ("email the organizers"). `mailto:` has no authority by design, so the
 * protocol check alone is the right test there.
 */
export function isSafeRichTextHref(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v) return false
  if (isSafeLinkHref(v)) return true
  try {
    return new URL(v).protocol === 'mailto:'
  } catch {
    return false
  }
}

/**
 * Render-time coercion: the trimmed href when it passes
 * {@link isSafeRichTextHref}, otherwise an inert `#`. Rendering NEVER throws on
 * stored data — content written before a rule tightened, or written straight to
 * the dataset through Sanity Studio, must degrade to a dead link rather than
 * blank the page.
 */
export function toSafeRichTextHref(value: unknown): string {
  return isSafeRichTextHref(value) ? (value as string).trim() : '#'
}

/** The human-facing message every surface shows for a rejected link. */
export const UNSAFE_LINK_MESSAGE =
  'Enter a site path (e.g. /tickets) or a full http(s) URL'
