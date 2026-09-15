/**
 * FIRST-TOUCH landing attribution for the CFP (spec §6.3, #1018).
 *
 * WHY A REMEMBERED VALUE AND NOT JUST THE URL. A tagged Campaign link points at
 * the PUBLIC `/cfp` page; submitting means following a plain link to
 * `/cfp/proposal` and, for a first-time speaker, a whole sign-in round trip.
 * The query string survives none of that, so reading it at the form would mean
 * attributing almost nothing. The tags are therefore remembered when the
 * visitor LANDS and recalled when the proposal is created.
 *
 * `sessionStorage`, not a cookie: this is not analytics and never leaves the
 * browser except as part of a proposal the speaker is deliberately submitting,
 * it dies with the tab, and it needs no consent banner because it stores no
 * identifier — only which advert the person followed.
 *
 * FIRST TOUCH WINS. A visitor who lands through a CFP post, wanders the site
 * and comes back through a ticket post is still the CFP post's: overwriting
 * would credit whichever link happened to be last.
 *
 * WHAT THIS DOES NOT COVER, and why. A Campaign link pointing STRAIGHT at
 * `/cfp/proposal` loses its tags for a logged-out visitor: `src/proxy.ts`
 * redirects every unauthenticated `/cfp/*` request to sign-in before any of
 * this page's code runs, and its `callbackUrl` is an absolute URL that
 * `safeCallbackPath` collapses to `/`. That is a pre-existing auth bug with a
 * blast radius well beyond marketing (it drops the destination of every
 * deep link into `/cfp` and `/admin`), so it is not fixed here. The supported
 * target is `/cfp` — which is what the Task page picker offers — where this
 * module has already remembered the tags before any sign-in happens.
 */

import type { ProposalUtmTags } from '@/lib/proposal/types'

export const LANDING_UTM_KEY = 'konf.landingUtm.v1'

/**
 * `window.sessionStorage` where it works, `null` where it does not. The
 * PROPERTY ACCESS itself throws in a browser with site data blocked — before
 * any method the helpers below could guard — so the one place that touches
 * `window` catches, and every caller holds a value that is merely absent.
 */
export function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage ?? null
  } catch {
    return null
  }
}

/** `utm_x` → the tag name stored on the proposal. */
const TAGS: [keyof ProposalUtmTags, string][] = [
  ['source', 'utm_source'],
  ['medium', 'utm_medium'],
  ['campaign', 'utm_campaign'],
  ['content', 'utm_content'],
]

/** A tag long enough to be a mistake is not stored; nothing here is worth a KB. */
const MAX_TAG_LENGTH = 200

/**
 * The UTM tags in a query string, or null when it carries none. Pure, so the
 * server page and the browser read the SAME rule.
 */
export function landingUtmFrom(
  search:
    string | URLSearchParams | Record<string, string | string[] | undefined>,
): ProposalUtmTags | null {
  const read = readerFor(search)
  const tags: ProposalUtmTags = {}
  for (const [key, parameter] of TAGS) {
    const value = read(parameter)?.trim()
    if (value && value.length <= MAX_TAG_LENGTH) tags[key] = value
  }
  return Object.keys(tags).length > 0 ? tags : null
}

function readerFor(
  search:
    string | URLSearchParams | Record<string, string | string[] | undefined>,
): (key: string) => string | undefined {
  if (typeof search === 'string') {
    const params = new URLSearchParams(search)
    return (key) => params.get(key) ?? undefined
  }
  if (search instanceof URLSearchParams) {
    return (key) => search.get(key) ?? undefined
  }
  return (key) => {
    const value = search[key]
    return Array.isArray(value) ? value[0] : value
  }
}

/**
 * Remember this landing's tags, unless something is already remembered. Every
 * storage access is guarded: `sessionStorage` throws in a locked-down browser,
 * and attribution must never be the reason a page fails to render.
 */
export function rememberLandingUtm(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  search: string,
): void {
  rememberLandingUtmTags(storage, landingUtmFrom(search))
}

/**
 * The same first-touch rule for tags already in hand — the proposal page reads
 * them off its own `searchParams`, and a Campaign link pointing straight at
 * the form is as much a landing as one pointing at `/cfp`.
 */
export function rememberLandingUtmTags(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  tags: ProposalUtmTags | null,
): void {
  if (!tags || !storage) return
  try {
    if (storage.getItem(LANDING_UTM_KEY)) return
    storage.setItem(LANDING_UTM_KEY, JSON.stringify(tags))
  } catch {
    // No storage, no attribution. The proposal is unaffected.
  }
}

/** What was remembered, or null. Anything unreadable is treated as nothing. */
export function recallLandingUtm(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): ProposalUtmTags | null {
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(LANDING_UTM_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const tags: ProposalUtmTags = {}
    for (const [key] of TAGS) {
      const value = (parsed as Record<string, unknown>)[key]
      if (
        typeof value === 'string' &&
        value &&
        value.length <= MAX_TAG_LENGTH
      ) {
        tags[key] = value
      }
    }
    return Object.keys(tags).length > 0 ? tags : null
  } catch {
    return null
  }
}

/**
 * THE ONE RULE for which tags a submission is credited to, given the tags on
 * the page's own URL and whatever this tab already remembers.
 *
 * Offer, then read back: the page's tags go to storage first, where
 * {@link rememberLandingUtmTags} decides whether they are the first touch, and
 * what storage HOLDS is the answer. That ordering is what keeps the remembered
 * value and the submitted value from ever disagreeing — a visitor who arrived
 * through campaign A and later opened a link tagged B is still A's.
 *
 * The `?? pageTags` tail is for a browser with no usable storage: there is no
 * earlier touch to honour, so the tags in hand are the best available answer.
 */
export function resolveSubmissionUtm(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  pageTags: ProposalUtmTags | null,
): ProposalUtmTags | null {
  rememberLandingUtmTags(storage, pageTags)
  return recallLandingUtm(storage) ?? pageTags
}
