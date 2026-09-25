/**
 * LinkedIn links as the "Tag by hand" list shows them (tagging spec §3.1,
 * §5.1). Links are free text the speaker or organizer typed, so each is
 * parsed, held to a LinkedIn host and rebuilt on the canonical one: the
 * query string (`?locale=en_US`), the fragment and a trailing slash are
 * dropped, and nothing but an `https://www.linkedin.com/…` address ever
 * reaches an `href`.
 */

const CANONICAL = 'https://www.linkedin.com'

/** The first path segments of `url` on a LinkedIn host, or null. */
function linkedinPath(raw: string): string[] | null {
  const text = raw.trim()
  if (!text) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null
  return url.pathname.split('/').filter(Boolean)
}

/** `/<section>/<slug>` for one of `sections`, rebuilt clean, or null. */
function pageUrl(raw: string, sections: readonly string[]): string | null {
  const [section, slug] = linkedinPath(raw) ?? []
  if (!section || !slug || !sections.includes(section.toLowerCase())) {
    return null
  }
  return `${CANONICAL}/${section.toLowerCase()}/${slug}`
}

/** A speaker's LinkedIn profile: the first `linkedin.com/in/…` link. */
export function linkedinProfileUrl(links: unknown): string | null {
  if (!Array.isArray(links)) return null
  for (const link of links) {
    const url = typeof link === 'string' ? pageUrl(link, ['in']) : null
    if (url) return url
  }
  return null
}

/** A sponsor's LinkedIn company, showcase or school page. */
export function linkedinCompanyUrl(
  url: string | null | undefined,
): string | null {
  return url ? pageUrl(url, ['company', 'showcase', 'school']) : null
}
