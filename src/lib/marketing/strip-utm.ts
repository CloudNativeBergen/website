/**
 * Clean `utm_*` out of the address bar once the landing has been read (spec
 * `docs/MARKETING_SHORT_LINKS_SPEC.md` §3, #1146), so a visitor who copies the
 * URL does not re-share our attribution. PURE apart from the one
 * `history.replaceState` in {@link stripUtmFromAddressBar}; WHEN to call it is
 * decided by `@/lib/posthog/address-bar`.
 */

/** The five campaign parameters, and only these: `utm_id`, `gclid` & co. stay. */
export const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const

const UTM_PARAM_SET: ReadonlySet<string> = new Set(UTM_PARAMS)

function decodedKey(pair: string): string {
  const raw = pair.split('=', 1)[0].replace(/\+/g, ' ')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * `href` without the five `utm_*` parameters, or `null` when it carries none
 * (or is not a URL). Works on the RAW query so every other parameter keeps its
 * position and its exact encoding — `URLSearchParams` would re-encode `%20` as
 * `+` and turn a bare `flag` into `flag=`. The hash is kept as is.
 */
export function withoutUtm(href: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const pairs = url.search.slice(1).split('&').filter(Boolean)
  const kept = pairs.filter((pair) => !UTM_PARAM_SET.has(decodedKey(pair)))
  if (kept.length === pairs.length) return null
  const search = kept.length > 0 ? `?${kept.join('&')}` : ''
  return `${url.origin}${url.pathname}${search}${url.hash}`
}

/**
 * Rewrite the CURRENT history entry without its `utm_*`: `replaceState` with
 * the entry's own state (the Next.js router keeps its tree there), never
 * `pushState`, so the back button behaves exactly as before. Returns whether
 * anything was rewritten; a clean URL is left alone.
 */
export function stripUtmFromAddressBar(win: Window): boolean {
  const stripped = withoutUtm(win.location.href)
  if (stripped === null) return false
  win.history.replaceState(win.history.state, '', stripped)
  return true
}
