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
 * The Next.js router's "this history write is mine" markers. The app router
 * patches `history.replaceState` (once it has hydrated) and, for a state
 * carrying `__NA` (or the pages router's `_N`), passes the call straight
 * through WITHOUT updating its own copy of the URL. That copy is what it
 * writes back into the address bar on its next state change (a refresh, a
 * server action), so a strip it did not see would put the tags back. A state
 * WITHOUT the markers is treated as an external write: the patch syncs its URL
 * and copies `__NA` and its tree back onto the state itself.
 *
 * The markers must never be LOST, though: an entry whose state lacks `__NA`
 * makes the router reload the page when Back lands on it.
 */
const ROUTER_MARKERS = ['__NA', '_N'] as const

/**
 * Whether the router would treat this state as its own. Truthiness, exactly
 * as the patch tests it (`data?.__NA || data?._N`): a state with `__NA:
 * false` is external to the router and gets nothing copied back.
 */
export function hasRouterMarker(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    ROUTER_MARKERS.some((key) =>
      Boolean((state as Record<string, unknown>)[key]),
    )
  )
}

function withoutRouterMarkers(state: unknown): unknown {
  if (!hasRouterMarker(state)) return state
  return Object.fromEntries(
    Object.entries(state as object).filter(
      ([key]) => !(ROUTER_MARKERS as readonly string[]).includes(key),
    ),
  )
}

/**
 * How a URL rewrite landed: `'router'` when the Next router's history patch
 * took it (the router now knows the URL), `'native'` when it went straight to
 * the browser (before hydration, or no app router at all).
 */
export type HistoryWrite = 'router' | 'native' | 'bypass'

/**
 * Whether the router may be told about a rewrite. A marker-free write reaches
 * it as a RESTORE action, and the router's action queue DISCARDS whatever
 * navigation is pending in favour of it (`app-router-instance.js`): a Link
 * the visitor has just clicked, whose response has not landed, would go
 * nowhere. Only a visitor who has never interacted with the page can have no
 * navigation in flight (programmatic pushes aside), so the router learns the
 * URL only then. Where the activation API is missing, the router is bypassed.
 */
function routerMayLearn(win: Window): boolean {
  const activation = win.navigator.userActivation as UserActivation | undefined
  return activation !== undefined && !activation.hasBeenActive
}

/**
 * Replace the CURRENT entry's URL, never pushing one, and let the Next router
 * learn it when its patch is installed and it is safe to tell it (see
 * {@link routerMayLearn}; otherwise `'bypass'`: the entry is rewritten behind
 * the router, marker and all, and its own copy of the URL stays as it was).
 * The entry keeps its state: through the patch the markers are copied back;
 * without the patch (the window between the router's first render and its
 * effects) the original state is written back as is, so Back never reloads.
 */
export function replaceUrlKeepingState(
  win: Window,
  href: string,
): HistoryWrite {
  const before: unknown = win.history.state
  if (hasRouterMarker(before) && !routerMayLearn(win)) {
    win.history.replaceState(before, '', href)
    return 'bypass'
  }
  win.history.replaceState(withoutRouterMarkers(before), '', href)
  if (!hasRouterMarker(before)) return 'native'
  if (hasRouterMarker(win.history.state)) return 'router'
  win.history.replaceState(before, '', href)
  return 'native'
}

/**
 * Rewrite the current entry without its `utm_*`. Returns how it landed, or
 * `null` when the URL was already clean and nothing was written.
 */
export function stripUtmFromAddressBar(win: Window): HistoryWrite | null {
  const stripped = withoutUtm(win.location.href)
  if (stripped === null) return null
  return replaceUrlKeepingState(win, stripped)
}
