import type { Resend, Segment, Contact as ResendContact } from 'resend'
import { Conference } from '@/lib/conference/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'
import {
  resolveEmailSender,
  retryWithBackoff,
  delay,
  isRateLimitError,
  EMAIL_CONFIG,
} from './config'

/**
 * AUDIENCES ARE ACCOUNT-SCOPED, WHICH MAKES THEM DIFFERENT FROM A MESSAGE (#843).
 *
 * For a plain send, "which Resend client" is a per-message choice: resolve the
 * tenant's sender, send, done. An AUDIENCE is not a message — it is a durable
 * object living inside ONE Resend account, addressed by an opaque `audienceId`
 * that account minted. The id is meaningless anywhere else: hand a
 * platform-account audience id to a tenant's own client and the call fails, or
 * worse, addresses a DIFFERENT audience that happens to exist there.
 *
 * So an audience id is not a value that travels alone — it is a HANDLE, and it
 * only means anything alongside the client it came from. Every function here
 * that takes an `audienceId` therefore takes the CLIENT with it, and the
 * resolvers that mint an id return the client that minted it. Re-resolving from
 * an org id at the point of use would be the bug this design exists to prevent:
 * it could resolve to a different account than the one holding the id (a tenant
 * provisioned with its own key between two calls), and nothing would report it.
 *
 * Contacts inherit this: `contacts.create`/`list`/`remove` are all addressed by
 * `audienceId`, so they are on the same handle.
 *
 * NOTHING IS PERSISTED. Audience ids are never stored in Sanity — they are
 * looked up by NAME through `audiences.list()` on every call. That is what makes
 * moving a tenant onto its own Resend account self-healing rather than a
 * migration: the first call on the new account simply finds no audience by that
 * name and creates one there.
 *
 * Because the NAME carries the key, it has to be unique per conference across a
 * whole account — see {@link conferenceAudienceName} (#886) — and only the
 * STABLE part of it is matched on, so a conference can be renamed without losing
 * its audience — see {@link parseAudienceKey} (#889).
 *
 * And because the lookup is a LIST, the list has to be complete: `audiences.list`
 * is paginated, so a lookup that reads one page stops finding audiences that
 * exist — see {@link listAllAudiences} (#893). `contacts.list` paginates through
 * the SAME client helper and defaults to twenty per page, so the same rule binds
 * every removal and every reconciliation — see {@link listAllContacts} (#895).
 * Both go through {@link pageToExhaustion}, deliberately one loop: two would be
 * two chances for one of them to trust a page the other does not.
 */
export type AudienceType = 'speakers' | 'sponsors'

const AUDIENCE_SUFFIX: Record<AudienceType, string> = {
  speakers: 'Speakers',
  sponsors: 'Sponsors',
}

/**
 * THE AUDIENCE KEY IS THE CONFERENCE ID, NOT ITS TITLE (#886).
 *
 * Audiences are looked up by NAME (see the module note above — nothing is
 * persisted), and the name used to be `"${conference.title} Speakers"`. Two
 * tenants on the SHARED platform account whose conferences share a title
 * therefore resolved to the SAME audience, and each sync added the other's
 * speakers to it: one tenant's contact list, addresses included, inside the
 * other's broadcast. A tenant on its own Resend account is unaffected — its
 * account holds only its own conferences — so this is specifically a shared-tier
 * collision, and an exact-title one. That makes it unlikely, not impossible, and
 * a privacy incident rather than a glitch when it happens.
 *
 * The title stays in the name so the Resend dashboard is still readable by a
 * human; the bracketed `_id` is what makes it unique.
 *
 * The name is what gets WRITTEN. What gets MATCHED is only the trailing
 * `<Type> [<id>]` — see {@link parseAudienceKey} (#889).
 */
export function conferenceAudienceName(
  conference: Pick<Conference, '_id' | 'title'>,
  audienceType: AudienceType,
): string {
  return `${conference.title} ${AUDIENCE_SUFFIX[audienceType]} [${conference._id}]`
}

const AUDIENCE_TYPE_BY_SUFFIX: Record<string, AudienceType | undefined> =
  Object.fromEntries(
    Object.entries(AUDIENCE_SUFFIX).map(([type, suffix]) => [
      suffix,
      type as AudienceType,
    ]),
  )

/**
 * `… Speakers [conference-id]`, ANCHORED at the end of the name.
 *
 * The `$` is load-bearing, not tidiness: a conference is free to be titled
 * `"Alpha Speakers [some-other-id]"`, and unanchored that title would make its
 * OWN sponsors audience — `"Alpha Speakers [other] Sponsors [mine]"` — parse as
 * the speakers key of another conference. That is the #886 cross-tenant leak,
 * reachable from a title alone.
 *
 * WHITESPACE AROUND THE KEY IS TOLERATED, because the contract this file offers
 * a human is "keep the `<Type> [<id>]` tail and you keep the audience" — and a
 * dashboard edit that doubles a space, leaves a trailing one, or trims the title
 * away entirely (`"Speakers [id]"`, which is also what an empty title writes,
 * minus its leading space) has kept it. Being strict there would turn a cosmetic
 * edit into a silently emptied broadcast, which is this bug again. Hence
 * `(?:^|\s+)` before the token, `\s*` around the bracket, and `\s*$` after it.
 *
 * It costs no isolation. The key must still be the LAST thing in the name, so a
 * title that embeds another conference's key still cannot claim it; and the
 * token must still start at a boundary, so `"…XSpeakers [id]"` is not a key.
 *
 * The suffixes are escaped because they are interpolated: a future audience type
 * whose label carried a regex metacharacter would otherwise break matching
 * silently, which is this bug once more.
 */
const AUDIENCE_KEY_PATTERN = new RegExp(
  `(?:^|\\s+)(${Object.values(AUDIENCE_SUFFIX)
    .map((suffix) => suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\s*\\[\\s*([^[\\]]+?)\\s*\\]\\s*$`,
)

/**
 * MATCH ON THE KEY, NOT ON THE WHOLE NAME (#889).
 *
 * The name embeds the title, so keying the LOOKUP on the whole name means a
 * title edit rotates the key: the resolver finds nothing, creates a fresh EMPTY
 * audience, and the next broadcast reaches nobody while reporting success. There
 * is no way to repair that afterwards from here, because `resend@6.18.1`'s
 * `audiences` resource (class `Segments`) is create / list / get / remove —
 * there is NO update, so an audience cannot be renamed. (Verified against the
 * installed package, not from the docs: `contacts` has `update`, `broadcasts`
 * has `update`, `audiences` does not.)
 *
 * So only the stable part of the name is the key: the audience TYPE and the
 * conference `_id`. Everything before it is decoration for whoever reads the
 * Resend dashboard, and may be edited — by us on a title change, or by a human
 * in the dashboard — without losing the audience.
 *
 * THE TYPE IS PART OF THE KEY, deliberately. Matching the `[<id>]` alone would
 * make one conference's speakers and sponsors audiences interchangeable, and
 * whichever came back first would receive both broadcasts. That would be a worse
 * bug than the one being fixed, so the trailing `Speakers`/`Sponsors` token has
 * to match too.
 *
 * Returns `null` for a name that carries no key at all — a pre-#886 audience, or
 * one a human renamed out of the convention. Such an audience is UNCLAIMABLE
 * except through the allowlist below: the only other thing its name carries is a
 * title, and matching on a title is exactly the collision #886 closed.
 */
function parseAudienceKey(
  name: string,
): { audienceType: AudienceType; conferenceId: string } | null {
  const match = AUDIENCE_KEY_PATTERN.exec(name)
  if (!match) return null
  const [, typeToken, conferenceId] = match
  const audienceType = AUDIENCE_TYPE_BY_SUFFIX[typeToken]
  if (!audienceType) return null
  return { audienceType, conferenceId }
}

function hasAudienceKey(
  name: string,
  conferenceId: string,
  audienceType: AudienceType,
): boolean {
  const key = parseAudienceKey(name)
  return (
    key !== null &&
    key.conferenceId === conferenceId &&
    key.audienceType === audienceType
  )
}

/**
 * Deterministic ordering for audiences carrying the same key: OLDEST first.
 *
 * Only a fallback — see {@link pickAmbiguousAudience}, which counts contacts
 * before it resorts to this. `created_at` is a required `string` on the real
 * payload (`Segment`), but an entry missing it sorts last rather than winning by
 * accident, and the id breaks a tie so the answer never depends on the order
 * Resend happened to list them in.
 */
function oldestFirst(
  a: { id: string; created_at?: string },
  b: { id: string; created_at?: string },
): number {
  const at = Date.parse(a.created_at ?? '')
  const bt = Date.parse(b.created_at ?? '')
  const av = Number.isNaN(at) ? Number.POSITIVE_INFINITY : at
  const bv = Number.isNaN(bt) ? Number.POSITIVE_INFINITY : bt
  if (av !== bv) return av - bv
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * SEVERAL AUDIENCES CARRY THE SAME KEY — MEASURE, DO NOT GUESS.
 *
 * An account can already hold a pair: the original, plus the one a pre-#889
 * rename minted. Which of them holds the contacts is NOT deducible from age.
 * The new one starts empty, but it is also the one every incremental
 * add/remove has gone to since the rename (`handleAudienceUpdate`), and an
 * admin-triggered full sync would have filled it and left the old one frozen.
 * Guessing by age therefore has a losing case that is this PR's own headline
 * harm in miniature: a broadcast that reports success against a stale list.
 *
 * So the fuller audience wins, counted rather than assumed.
 *
 * THE COUNT IS A COMPARISON, NOT A CENSUS. `contacts.list` is paginated and its
 * limit DEFAULTS TO 20 (`PaginationOptions`: "1-100, default: 20"), so an
 * unbounded call would saturate at 20 and make this tiebreak inert for any
 * conference with a real speaker list. It asks for the maximum page instead, and
 * treats `has_more` as "at least this many".
 *
 * THE ONE THING IT MUST NEVER DO is hand back an audience it KNOWS is empty
 * while another candidate might not be. An unknown count is not a small one, so
 * a candidate whose count could not be read is preferred over one measured at
 * zero — and, symmetrically, a candidate measured above zero is preferred over
 * an unknown, because "definitely reaches someone" beats "might reach more".
 * Falling back to age in either of those cases is what delivers the empty
 * orphan, whichever side the failure happens to land on.
 *
 * So eligibility first, age only to break what is left:
 *
 *  1. some candidate counted above zero → the fullest of them;
 *  2. otherwise, some count unknown → those, since the known ones are empty;
 *  3. otherwise → all of them, and it does not matter: they are all empty.
 *
 * Then, among equals, a candidate whose page was CAPPED holds strictly more than
 * one that was not (same page size, and `has_more`), so it wins; and the oldest
 * of whatever survives, which keeps the answer independent of the order Resend
 * listed them in.
 *
 * NOT STABLE ACROSS CALLS while duplicates exist: the answer is a function of
 * live contact state, so a sync that empties one side can flip it. That is
 * inherent to measuring, it only happens on an account already holding
 * duplicates, and the warning logged beside it names them for deletion — which
 * is the thing that makes it stop.
 *
 * This runs only on the rare ambiguous path: one `contacts.list` per duplicate,
 * and there are normally no duplicates at all.
 */
const CONTACT_COUNT_PAGE = 100

/** A count of `null` means "could not be read", which is NOT the same as zero. */
interface CountedAudience<T> {
  audience: T
  count: number | null
  capped: boolean
}

async function pickAmbiguousAudience<T extends { id: string; name: string }>(
  client: Resend,
  candidates: T[],
): Promise<T> {
  // Sorted here so every filter below preserves oldest-first order and the
  // survivor can simply be taken from the front.
  const byAge = [...candidates].sort(oldestFirst)

  const counted: CountedAudience<T>[] = await Promise.all(
    byAge.map(async (audience) => {
      try {
        const response = await retryWithBackoff(
          async () =>
            await client.contacts.list({
              audienceId: audience.id,
              limit: CONTACT_COUNT_PAGE,
            }),
        )
        if (response.error) return { audience, count: null, capped: false }
        return {
          audience,
          count: response.data?.data.length ?? 0,
          capped: response.data?.has_more === true,
        }
      } catch {
        return { audience, count: null, capped: false }
      }
    }),
  )

  const known = counted.filter((entry) => entry.count !== null)
  const fullest = Math.max(0, ...known.map((entry) => entry.count ?? 0))

  const eligible =
    fullest > 0
      ? known.filter((entry) => entry.count === fullest)
      : (() => {
          const unknown = counted.filter((entry) => entry.count === null)
          return unknown.length > 0 ? unknown : counted
        })()

  // `has_more` on an otherwise equal count means strictly more contacts.
  const capped = eligible.filter((entry) => entry.capped)
  const finalists =
    capped.length > 0 && capped.length < eligible.length ? capped : eligible

  return finalists[0].audience
}

/**
 * Adopt exactly one of a set of candidate audiences, and say so when there was
 * more than one. The single-candidate case — the overwhelmingly common one —
 * costs nothing: no `contacts.list`, no logging.
 */
async function adoptOneOf<T extends { id: string; name: string }>(
  client: Resend,
  candidates: T[],
  context: { conferenceId: string; audienceType: AudienceType },
): Promise<T> {
  if (candidates.length === 1) return candidates[0]

  const adopted = await pickAmbiguousAudience(client, candidates)
  console.warn('[Audience] Several audiences match this conference:', {
    ...context,
    using: adopted.name,
    ignoring: candidates
      .filter((audience) => audience.id !== adopted.id)
      .map((audience) => audience.name),
  })
  return adopted
}

/**
 * The pre-#886 name: title-keyed, and therefore collidable.
 *
 * The title is taken from {@link LEGACY_AUDIENCE_TITLES}, NOT from the
 * conference document, because the conference can be renamed and the legacy
 * audience cannot (no update method). Frozen, so adoption keeps working after a
 * rename — the same property #889 gives every other audience.
 */
function legacyConferenceAudienceName(
  conferenceId: string,
  audienceType: AudienceType,
): string | null {
  const legacyTitle = LEGACY_AUDIENCE_TITLES.get(conferenceId)
  if (legacyTitle === undefined) return null
  return `${legacyTitle} ${AUDIENCE_SUFFIX[audienceType]}`
}

/**
 * WHAT THE RENAME DOES TO THE AUDIENCES THAT ALREADY EXIST — and why this list.
 *
 * Renaming the key does NOT rename anything on Resend. Resend's audience API is
 * create / list / get / remove (`resend@6`, `Segments`): there is no update, so
 * the live audience keeps its old name forever. Lookup is by name, so on the
 * next call the new name matches nothing and a SECOND, EMPTY audience is
 * created. The old one is not deleted — it is ORPHANED: still in the dashboard,
 * still holding its contacts, never written or read by this code again.
 *
 * That is not merely untidy. The next broadcast targets the new, empty audience
 * and reaches NOBODY, reporting success — the failure mode this repo keeps
 * getting bitten by. And a rebuilt audience re-adds every contact with
 * `unsubscribed: false`; whether that resurrects an opt-out depends on whether
 * Resend treats unsubscription as per-audience contact state or an account-level
 * suppression, which could NOT be established here without exercising the live
 * API. Unverified, so the design does not rely on either answer.
 *
 * So the resolver ADOPTS the existing audience instead: it looks the key up
 * first, then falls back to the legacy name and keeps using that audience, id and
 * contacts intact. Nothing is created, nothing is orphaned, no migration to run.
 *
 * The fallback is ALLOWLISTED because an unconditional one would reopen the very
 * collision this change closes — a new tenant sharing a title would adopt the
 * incumbent's list. These are the conferences that existed when the rename
 * landed, so they are the only ones that can have an audience under a legacy
 * name; every conference created afterwards, including any second tenant's, gets
 * an id-keyed audience of its own and can never reach one of these. Delete an
 * entry once its legacy audience is gone from the account; delete the whole map
 * when none remain.
 *
 * The VALUE is each conference's title as read from production when #889 landed,
 * frozen so that a future rename cannot rotate the fallback the way it used to
 * rotate the key. #888 computed this from `conference.title`, which meant a
 * rename broke legacy adoption too — the same defect through the same door.
 *
 * Being honest about what that is evidence of: these are the CURRENT conference
 * titles, not a reading of the Resend account. If one of the four was renamed
 * BEFORE this landed, its legacy audience is under the older title still and
 * adoption misses it — no worse than #888, which missed it too, but not fixed by
 * freezing either. Confirming that needs the live account, which is out of reach
 * from here.
 */
const LEGACY_AUDIENCE_TITLES: ReadonlyMap<string, string> = new Map([
  ['0d9747cd-e128-4698-8ba7-3dfd4029d692', 'Cloud Native Day Bergen 2024'],
  ['d02570e5-7fb6-46e0-a0a1-d27bbbb0a3b5', 'Cloud Native Day Bergen 2025'],
  ['eb7b16c6-00fa-44a0-adcd-4a480de34242', 'Cloud Native Days Norway 2026'],
  ['kkdemo.conference', 'KontainerKonf 2026'], // demo tenant
])

/**
 * An audience id together with the Resend account it belongs to. Returned by the
 * resolvers so a caller that goes on to add contacts or create a broadcast uses
 * the SAME account, without re-resolving.
 */
export interface ConferenceAudience {
  audienceId: string
  /** The account `audienceId` is valid on. */
  client: Resend
  error?: Error
}

/**
 * The Resend account a conference's audiences and broadcasts live on: the
 * tenant's own when it has credentials, the platform's otherwise (the shared
 * T0 tier). ONE resolution point, so the audience, its contacts and any
 * broadcast built on it cannot end up on different accounts.
 */
export async function conferenceAudienceClient(
  conference: Conference,
): Promise<Resend> {
  const { client } = await resolveEmailSender(conference.organization?._ref)
  return client
}

export interface Contact {
  email: string
  firstName: string
  lastName: string
  organization?: string
}

/**
 * THE LOOKUP IS A LIST, AND THE LIST IS PAGINATED (#893).
 *
 * `audiences.list()` was called with no arguments, so Resend applied its server
 * default page size and nothing paged past it. Every audience beyond that page
 * was invisible to the lookup: the resolver found nothing, created a fresh EMPTY
 * audience, and the next broadcast reported success while reaching nobody — the
 * same silent failure #889 and #892 exist to eliminate, through a third door.
 * Two audiences per conference means it arrives at roughly the TENTH conference
 * on an account, and conferences accumulate every year on their own.
 *
 * THE PAGINATION CONTRACT, verified against the installed `resend@6.18.1` rather
 * than the docs — `node -e` against this worktree's `node_modules`:
 *
 * ```
 * installed here: 6.18.1
 * audiences => Segments | constructor,create,list,get,remove
 * async list(options = {}) {
 *   const queryString = buildPaginationQuery(options);
 *   const url = queryString ? `/segments?${queryString}` : "/segments";
 *   return await this.resend.get(url);
 * }
 * function buildPaginationQuery(options) {
 *   if (options.limit !== void 0) searchParams.set("limit", ...)
 *   if ("after" in options && options.after !== void 0) searchParams.set("after", options.after)
 *   if ("before" in options && options.before !== void 0) ...
 * }
 * ```
 *
 * So it is CURSOR pagination, not offset: `PaginationOptions` is
 * `{ limit?: 1-100, default 20 } & ({ after?: string } | { before?: string })`,
 * and the response (`ListSegmentsResponseSuccess`) is `{ object, data: Segment[],
 * has_more }`. `Segment` is `{ created_at, id, name }` — there is no
 * `next_cursor` field, and the only per-item identifier the payload carries is
 * `id`, so `after` is the last item's id. **That last step is the one thing here
 * that the installed client cannot prove**: it forwards `after` verbatim as a
 * query parameter, and only the live API knows what it accepts. The loop is
 * built so that being wrong about it CANNOT produce the silent failure —
 * a cursor the server ignores repeats a page, which is detected as no progress
 * and reported as an INCOMPLETE listing rather than an absence.
 *
 * RAISING THE LIMIT IS NOT A FIX. 100 is the documented maximum and it only
 * moves the cliff to the fiftieth conference; the page size below is the maximum
 * because it minimises round-trips, not because it bounds anything.
 *
 * The listing therefore reports whether it is COMPLETE, and completeness is
 * claimed only on evidence:
 *
 *  - `has_more: false` — the API said so, and it is trusted even on a full page;
 *  - a SHORT page — fewer items than asked for means there was nothing else;
 *
 * and specifically NOT for a page that came back exactly full without an
 * explicit `has_more: false`, which is the signature of truncation. The caller
 * uses that to refuse to create — see {@link AudienceListTruncatedError}.
 */
const AUDIENCE_PAGE_SIZE = 100

/**
 * A ceiling on round-trips, not on the account: 50 pages of 100 is 5,000
 * audiences, i.e. 2,500 conferences. Hitting it does not mint anything — it
 * makes the listing incomplete, which is a refusal.
 */
const AUDIENCE_PAGE_CAP = 50

/**
 * CONTACTS PAGINATE THROUGH THE SAME MACHINERY, BECAUSE THEY ARE THE SAME BUG (#895).
 *
 * `contacts.list` was called as `list({ audienceId })` — no `limit`, no cursor —
 * in `removeContactFromAudience` and in `syncAudienceWithContacts`. Verified
 * against the installed `resend@6.18.1` rather than the docs, both list
 * endpoints go through ONE `buildPaginationQuery`:
 *
 * ```
 * async list(options = {}) {                       // contacts
 *   const segmentId = options.segmentId ?? options.audienceId;
 *   const queryString = buildPaginationQuery(options);
 *   const url = queryString ? `/segments/${segmentId}/contacts?${queryString}` : ...
 * }
 * ```
 *
 * so `PaginationOptions` applies identically: `{ limit?: 1-100, DEFAULT 20 } &
 * ({ after? } | { before? })`, and `ListContactsResponseSuccess = { object,
 * data: Contact[], has_more }` with `Contact = { created_at, id, email,
 * first_name, last_name, unsubscribed }`.
 *
 * Twenty is not a scale limit, it is a live one. Past twenty contacts:
 *
 *  - a REMOVAL looked the target up in the first page, missed, and returned
 *    SUCCESS having removed nothing — an unsubscribe request that reports done
 *    and leaves the person on the list;
 *  - a SYNC reconciled against the first page, so everyone behind it was
 *    invisible to it and was never removed.
 *
 * The cap is higher than the audience one because contacts per audience plausibly
 * outnumber audiences per account: 100 pages of 100 is 10,000 contacts. As with
 * audiences, reaching it is a refusal, never a conclusion.
 */
const CONTACT_PAGE_SIZE = 100
const CONTACT_PAGE_CAP = 100

type ListingStop =
  | 'exhausted'
  | 'full-page-without-has-more'
  | 'no-progress'
  | 'page-cap'
  | 'no-payload'

interface Listing<T> {
  items: T[]
  /** True ONLY if every item was seen. */
  complete: boolean
  stoppedBecause: ListingStop
  pages: number
}

/** The shape both `audiences.list` and `contacts.list` answer with. */
interface ListPage<T> {
  data?: { data?: T[]; has_more?: boolean } | null
  error?: { message: string } | null
}

/**
 * Page a cursor-paginated Resend list to exhaustion, and say so honestly when it
 * could not be.
 *
 * ONE loop for both lists, deliberately. `audiences.list` and `contacts.list`
 * share `buildPaginationQuery` on the client and therefore share every failure
 * mode; giving them separate loops is how one of them comes to trust a full page
 * that the other does not.
 *
 * Never throws for an incomplete listing — an incomplete listing is a RESULT,
 * and the caller's decision differs by whether it found what it was looking for.
 * A list ERROR still throws: a failed call is not an empty account.
 *
 * `after` is the last item's id. That is the one thing the installed client
 * cannot prove — it forwards the string verbatim as a query parameter, and the
 * payload carries no `next_cursor` — so the loop is built so that being wrong
 * about it CANNOT produce the silent failure: a cursor the server ignores
 * repeats a page, which shows up as no progress and is reported as an INCOMPLETE
 * listing rather than an absence.
 */
async function pageToExhaustion<T extends { id: string }>(
  fetchPage: (page: { limit: number; after?: string }) => Promise<ListPage<T>>,
  options: {
    pageSize: number
    pageCap: number
    /** Names the resource in the log line and the thrown error. */
    what: string
    logContext: Record<string, unknown>
  },
): Promise<Listing<T>> {
  const items: T[] = []
  const seen = new Set<string>()
  let after: string | undefined
  let pages = 0

  while (pages < options.pageCap) {
    const listStart = Date.now()
    const response = await retryWithBackoff(() =>
      fetchPage(
        after === undefined
          ? { limit: options.pageSize }
          : { limit: options.pageSize, after },
      ),
    )
    const listDuration = Date.now() - listStart
    pages++

    if (response.error) {
      console.error(`[Audience] Failed to list ${options.what}:`, {
        error: response.error.message,
        ...options.logContext,
        page: pages,
        durationMs: listDuration,
      })
      throw new Error(
        `Failed to list ${options.what}: ${response.error.message}`,
      )
    }

    if (!response.data) {
      // Neither an error nor a payload. `Response<T>` says this cannot happen —
      // `data: null` comes with an `error` — but a response carrying no evidence
      // must not be read as "there is nothing there", which is this whole bug in
      // one line.
      return { items, complete: false, stoppedBecause: 'no-payload', pages }
    }

    const batch = response.data.data ?? []
    // Deduplicated because a cursor the server does not honour would otherwise
    // append the same page forever; `seen` is also what detects that.
    const fresh = batch.filter((item) => !seen.has(item.id))
    for (const item of fresh) {
      seen.add(item.id)
      items.push(item)
    }

    if (response.data.has_more !== true) {
      // A short page cannot be hiding anything. A FULL one with no explicit
      // `has_more: false` is the truncation signature, and treating it as the
      // end of the list is how this bug looks from inside.
      const complete =
        response.data.has_more === false || batch.length < options.pageSize
      return {
        items,
        complete,
        stoppedBecause: complete ? 'exhausted' : 'full-page-without-has-more',
        pages,
      }
    }

    if (fresh.length === 0) {
      // `has_more` says there is more, but this page added nothing new: the
      // cursor is not moving. Refuse rather than spin.
      return { items, complete: false, stoppedBecause: 'no-progress', pages }
    }

    after = batch[batch.length - 1].id
  }

  return { items, complete: false, stoppedBecause: 'page-cap', pages }
}

/** Every audience on the account, or an honest statement that it is not. */
async function listAllAudiences(
  client: Resend,
  audienceType: AudienceType,
): Promise<Listing<Segment>> {
  return pageToExhaustion<Segment>(
    (page) =>
      client.audiences.list(
        page.after === undefined
          ? { limit: page.limit }
          : { limit: page.limit, after: page.after },
      ),
    {
      pageSize: AUDIENCE_PAGE_SIZE,
      pageCap: AUDIENCE_PAGE_CAP,
      what: 'audiences',
      logContext: { audienceType },
    },
  )
}

/** Every contact in one audience, or an honest statement that it is not. */
async function listAllContacts(
  client: Resend,
  audienceId: string,
): Promise<Listing<ResendContact>> {
  return pageToExhaustion<ResendContact>(
    (page) =>
      client.contacts.list(
        page.after === undefined
          ? { audienceId, limit: page.limit }
          : { audienceId, limit: page.limit, after: page.after },
      ),
    {
      pageSize: CONTACT_PAGE_SIZE,
      pageCap: CONTACT_PAGE_CAP,
      what: 'contacts',
      logContext: { audienceId },
    },
  )
}

/**
 * A LOOKUP MISS ON A TRUNCATED LIST IS NOT AN ABSENCE (#893).
 *
 * The resolver's fallback for "no audience found" is to CREATE one, and that is
 * only correct when the search was exhaustive. If the listing could not be
 * exhausted, the audience being looked for may well exist, holding every
 * contact — and creating a second one in that state is precisely the wrong move:
 * it is how the account acquires the duplicate, and how the next broadcast comes
 * to report success while reaching nobody.
 *
 * So it REFUSES, loudly, and the refusal is a returned `error` rather than only
 * a log line: `syncAudienceWithContacts` surfaces it, and both admin sync
 * endpoints (`speaker.ts`, `sponsor.ts`) put its message in the `TRPCError` an
 * organizer sees, as does `sendBroadcastEmail`. An operator gets told the list
 * was truncated; nobody gets a successful send into an empty audience.
 *
 * Refusing is the conservative direction on purpose. The cost of a false refusal
 * is a failed sync with an explanation, which a human can act on; the cost of a
 * false creation is an unrecoverable orphan and a silent broadcast, which nobody
 * finds out about.
 */
export abstract class ListTruncatedError extends Error {
  readonly stoppedBecause: ListingStop
  readonly seen: number
  readonly pages: number

  constructor(message: string, listing: Listing<unknown>) {
    super(message)
    this.stoppedBecause = listing.stoppedBecause
    this.seen = listing.items.length
    this.pages = listing.pages
  }
}

export class AudienceListTruncatedError extends ListTruncatedError {
  constructor(listing: Listing<Segment>, audienceName: string) {
    super(
      `Refusing to create the audience "${audienceName}": Resend returned an ` +
        `incomplete audience list (${listing.stoppedBecause}) after ${listing.pages} ` +
        `page(s) and ${listing.items.length} audience(s), so an existing audience ` +
        `for this conference may simply not have been listed. Creating a second one ` +
        `would send the next broadcast to an empty audience. Retry, and if it persists ` +
        `check the Resend account for this conference's audience.`,
      listing,
    )
    this.name = 'AudienceListTruncatedError'
  }
}

/**
 * THE SAME ASYMMETRY, ONE LEVEL DOWN: A CONTACT NOT SEEN IS NOT A CONTACT ABSENT (#895).
 *
 * `removeContactFromAudience`'s "nothing to do" answer, and
 * `syncAudienceWithContacts`'s set of contacts to remove, are BOTH derived from
 * a listing — and both are only correct if the listing was exhaustive. On a
 * truncated one:
 *
 *  - the removal reports success for a contact it never looked at, which is an
 *    unsubscribe request that quietly does not unsubscribe;
 *  - the sync computes its removals from a partial roster and under-removes,
 *    which is the same harm arriving in bulk.
 *
 * So both refuse, loudly, and the refusal is a returned `error` rather than only
 * a log line: `syncAudienceWithContacts` surfaces it, and the admin sync
 * endpoints (`speaker.ts`, `sponsor.ts`) put its message into the `TRPCError` an
 * organizer sees.
 *
 * Refusing is the conservative direction on purpose, exactly as it is for
 * audiences. The cost of a false refusal is a failed sync with an explanation a
 * human can act on. The cost of a false success is somebody who asked to be
 * removed still receiving mail, and no record anywhere that anything went wrong.
 *
 * The refusal fires only when the contact was NOT found. A contact that WAS seen
 * is removed whatever the rest of the audience is doing — refusing there would
 * break every removal on a large audience instead of protecting anyone.
 */
export class ContactListTruncatedError extends ListTruncatedError {
  constructor(
    listing: Listing<ResendContact>,
    context: { audienceId: string; email?: string },
  ) {
    const what =
      context.email === undefined
        ? `Refusing to reconcile audience ${context.audienceId}`
        : `Refusing to report "${context.email}" as removed from audience ${context.audienceId}`
    const consequence =
      context.email === undefined
        ? `Reconciling against a partial roster silently under-removes: contacts that should ` +
          `have been removed stay subscribed.`
        : `Reporting success would leave them still subscribed after they asked not to be.`
    super(
      `${what}: Resend returned an incomplete contact list ` +
        `(${listing.stoppedBecause}) after ${listing.pages} page(s) and ` +
        `${listing.items.length} contact(s), so contacts that exist may simply not have ` +
        `been listed. ${consequence} Retry, and if it persists check the audience in ` +
        `the Resend account.`,
      listing,
    )
    this.name = 'ContactListTruncatedError'
  }
}

export async function getOrCreateConferenceAudienceByType(
  conference: Conference,
  audienceType: AudienceType,
): Promise<ConferenceAudience> {
  const audienceName = conferenceAudienceName(conference, audienceType)

  const client = await conferenceAudienceClient(conference)

  try {
    const listing = await listAllAudiences(client, audienceType)
    const all = listing.items

    // Match the KEY, not the whole name: the title in the name is decoration and
    // changes when the conference is renamed (#889).
    const keyed = all.filter((audience) =>
      hasAudienceKey(audience.name, conference._id, audienceType),
    )

    if (keyed.length > 0) {
      // Rotation orphans from before #889: same conference, same type, several
      // audiences. Only one of them can be broadcast to, so pick the one that
      // still holds the contacts and name the rest — they want deleting by hand,
      // which this code will not do for anyone.
      const adopted = await adoptOneOf(client, keyed, {
        conferenceId: conference._id,
        audienceType,
      })
      return { audienceId: adopted.id, client }
    }

    // ADOPT the pre-#886 title-keyed audience rather than orphaning it. Only for
    // the conferences that predate the rename — see LEGACY_AUDIENCE_TITLES for
    // why the allowlist is the thing keeping this from being the collision it
    // replaces. Names with no `[id]` key are unclaimable any other way.
    const legacyName = legacyConferenceAudienceName(
      conference._id,
      audienceType,
    )
    if (legacyName !== null) {
      // Duplicates are possible here too — an audience could have been
      // duplicated before #886 — and the same rule applies: never adopt one
      // known to be empty over one that might not be.
      const legacyAudiences = all.filter(
        (audience) => audience.name === legacyName,
      )
      if (legacyAudiences.length > 0) {
        const legacyAudience = await adoptOneOf(client, legacyAudiences, {
          conferenceId: conference._id,
          audienceType,
        })
        console.info('[Audience] Adopted pre-#886 title-keyed audience:', {
          legacyName,
          conferenceId: conference._id,
          audienceType,
        })
        return { audienceId: legacyAudience.id, client }
      }
    }

    // NOTHING WAS FOUND — but "not found" only licenses "create" if the search
    // was exhaustive. On a truncated listing it does not (#893).
    if (!listing.complete) {
      const truncated = new AudienceListTruncatedError(listing, audienceName)
      console.error('[Audience] Refusing to create on a truncated list:', {
        conferenceId: conference._id,
        audienceType,
        audienceName,
        stoppedBecause: listing.stoppedBecause,
        pages: listing.pages,
        seen: all.length,
      })
      throw truncated
    }

    await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
    const createStart = Date.now()
    const audienceResponse = await retryWithBackoff(() =>
      client.audiences.create({
        name: audienceName,
      }),
    )
    const createDuration = Date.now() - createStart

    if (audienceResponse.error) {
      console.error('[Audience] Failed to create audience:', {
        error: audienceResponse.error.message,
        audienceName,
        audienceType,
        durationMs: createDuration,
      })
      throw new Error(
        `Failed to create audience: ${audienceResponse.error.message}`,
      )
    }

    return { audienceId: audienceResponse.data!.id, client }
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn(
        `[Audience] Conference ${audienceType} audience could not be created/accessed due to persistent rate limiting`,
        {
          conferenceName: conference.title,
          audienceName,
        },
      )
    } else {
      console.error(
        `[Audience] Failed to get or create conference ${audienceType} audience:`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          audienceName,
          audienceType,
        },
      )
    }
    return { audienceId: '', client, error: error as Error }
  }
}

export async function getOrCreateConferenceAudience(
  conference: Conference,
): Promise<ConferenceAudience> {
  return getOrCreateConferenceAudienceByType(conference, 'speakers')
}

export async function addContactToAudience(
  client: Resend,
  audienceId: string,
  contact: Contact,
): Promise<{ success: boolean; error?: Error }> {
  try {
    if (!contact.email) {
      console.warn('[Audience] Attempted to add contact without email:', {
        audienceId,
        email: contact.email,
      })
      throw new Error('Contact email is required')
    }

    const contactResponse = await retryWithBackoff(
      async () =>
        await client.contacts.create({
          audienceId,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          unsubscribed: false,
        }),
    )

    if (contactResponse.error) {
      if (contactResponse.error.message?.includes('already exists')) {
        return { success: true }
      }
      console.error('[Audience] Failed to add contact:', {
        error: contactResponse.error.message,
        email: contact.email,
        audienceId,
      })
      throw new Error(`Failed to add contact: ${contactResponse.error.message}`)
    }

    return { success: true }
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn(
        `[Audience] Contact ${contact.email} could not be added to audience due to persistent rate limiting`,
        {
          audienceId,
          organization: contact.organization,
        },
      )
    } else {
      console.error('[Audience] Failed to add contact to audience:', {
        error: error instanceof Error ? error.message : String(error),
        email: contact.email,
        audienceId,
      })
    }
    return { success: false, error: error as Error }
  }
}

/**
 * ONE LINE PER FAILURE, AND EVERY LINE NAMES THE CONTACT.
 *
 * A refusal is thrown from the decision site, which has already logged it with
 * the listing detail — so logging again here would print every refusal twice, in
 * two different formats. That matters more than log tidiness usually does:
 * `handleAudienceUpdate` cannot return an error to anyone, so for a background
 * removal this log IS the whole operator signal, and a channel that repeats
 * itself is a channel people stop reading.
 */
function logRemovalFailure(
  audienceId: string,
  email: string,
  error: unknown,
): void {
  if (error instanceof ListTruncatedError) return

  if (isRateLimitError(error)) {
    console.warn(
      `[Audience] Contact ${email} could not be removed from audience due to persistent rate limiting`,
      { audienceId },
    )
  } else {
    console.error('[Audience] Failed to remove contact from audience:', {
      audienceId,
      email,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

/**
 * Delete a contact the caller has ALREADY resolved.
 *
 * Separated from the lookup so a sync — which paged the whole audience once and
 * therefore holds every contact id it is about to delete — does not page the
 * audience again per removal. Without this, clearing a 250-contact audience
 * costs 250 full pagings instead of one.
 */
async function removeContactById(
  client: Resend,
  audienceId: string,
  contact: { id: string; email: string },
): Promise<{ success: boolean; error?: Error }> {
  try {
    const removeResponse = await retryWithBackoff(
      async () =>
        await client.contacts.remove({
          audienceId,
          id: contact.id,
        }),
    )

    if (removeResponse.error) {
      throw new Error(
        `Failed to remove contact: ${removeResponse.error.message}`,
      )
    }

    return { success: true }
  } catch (error) {
    logRemovalFailure(audienceId, contact.email, error)
    return { success: false, error: error as Error }
  }
}

export async function removeContactFromAudience(
  client: Resend,
  audienceId: string,
  email: string,
): Promise<{ success: boolean; error?: Error }> {
  let contact: ResendContact | undefined

  try {
    // THE WHOLE AUDIENCE, not the first twenty (#895). A contact past the first
    // page used to be invisible here, and the miss was reported as success.
    const listing = await listAllContacts(client, audienceId)
    contact = listing.items.find((c) => c.email === email)

    if (!contact) {
      // "Not in the list" only means "not in the audience" if the list was
      // exhaustive. On a truncated one it means nothing at all, and answering
      // `success` would tell an operator — or the person who asked to be removed
      // — that the job is done.
      if (!listing.complete) {
        // The ONE line this refusal produces. It names the outstanding
        // consequence, not just the decision: "refused" alone leaves a reader
        // to work out that somebody is still on a list they asked to leave.
        console.error(
          `[Audience] REFUSED: ${email} was NOT removed and is STILL SUBSCRIBED — Resend returned an incomplete contact list, so the removal could not be confirmed:`,
          {
            audienceId,
            email,
            stoppedBecause: listing.stoppedBecause,
            pages: listing.pages,
            seen: listing.items.length,
          },
        )
        throw new ContactListTruncatedError(listing, { audienceId, email })
      }
      return { success: true }
    }
  } catch (error) {
    logRemovalFailure(audienceId, email, error)
    return { success: false, error: error as Error }
  }

  return removeContactById(client, audienceId, contact)
}

export async function addSpeakerToAudience(
  client: Resend,
  audienceId: string,
  speaker: Speaker,
): Promise<{ success: boolean; error?: Error }> {
  const contact: Contact = {
    email: speaker.email,
    firstName: speaker.name.split(' ')[0] || '',
    lastName: speaker.name.split(' ').slice(1).join(' ') || '',
  }
  return addContactToAudience(client, audienceId, contact)
}

export async function removeSpeakerFromAudience(
  client: Resend,
  audienceId: string,
  speakerEmail: string,
): Promise<{ success: boolean; error?: Error }> {
  return removeContactFromAudience(client, audienceId, speakerEmail)
}

export async function syncAudienceWithContacts(
  conference: Conference,
  audienceType: AudienceType,
  contacts: Contact[],
): Promise<{
  success: boolean
  audienceId: string
  syncedCount: number
  addedCount: number
  removedCount: number
  error?: Error
}> {
  const syncStart = Date.now()

  try {
    const {
      audienceId,
      client,
      error: audienceError,
    } = await getOrCreateConferenceAudienceByType(conference, audienceType)

    if (audienceError || !audienceId) {
      console.error('[Audience] Failed to get/create audience:', {
        error: audienceError?.message,
        audienceType,
      })
      throw audienceError || new Error('Failed to get audience ID')
    }

    // RECONCILIATION NEEDS THE WHOLE ROSTER (#895). What follows computes a set
    // of contacts to DELETE by subtracting the eligible list from the existing
    // one — so a partial "existing" does not merely miss a few, it under-removes
    // by exactly the amount it could not see, silently.
    const listing = await listAllContacts(client, audienceId)

    if (!listing.complete) {
      console.error(
        '[Audience] Refusing to reconcile on a truncated contact list:',
        {
          audienceId,
          audienceType,
          stoppedBecause: listing.stoppedBecause,
          pages: listing.pages,
          seen: listing.items.length,
        },
      )
      // Before anything is added or removed: a partial reconciliation is worse
      // than none, because it reports the count it managed rather than the count
      // it owed.
      throw new ContactListTruncatedError(listing, { audienceId })
    }

    const existingContacts = listing.items
    const existingEmails = new Set(existingContacts.map((c) => c.email))
    const currentContactEmails = new Set(
      contacts.filter((c) => c.email).map((c) => c.email),
    )

    const contactsToAdd = contacts.filter(
      (c) => c.email && !existingEmails.has(c.email),
    )
    const contactsToRemove = existingContacts.filter(
      (c) => !currentContactEmails.has(c.email),
    )

    let addedCount = 0
    for (const contact of contactsToAdd) {
      const { success } = await addContactToAudience(
        client,
        audienceId,
        contact,
      )
      if (success) {
        addedCount++
      }
      await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
    }

    let removedCount = 0
    for (const existingContact of contactsToRemove) {
      // By id, from the roster already paged above — see `removeContactById`.
      const { success } = await removeContactById(
        client,
        audienceId,
        existingContact,
      )
      if (success) {
        removedCount++
      }

      await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
    }

    return {
      success: true,
      audienceId,
      syncedCount: contacts.length,
      addedCount,
      removedCount,
    }
  } catch (error) {
    const totalDuration = Date.now() - syncStart
    console.error(`[Audience] Failed to sync ${audienceType} audience:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      conferenceName: conference.title,
      contactCount: contacts.length,
      durationMs: totalDuration,
    })
    return {
      success: false,
      audienceId: '',
      syncedCount: 0,
      addedCount: 0,
      removedCount: 0,
      error: error as Error,
    }
  }
}

export async function syncConferenceAudience(
  conference: Conference,
  eligibleSpeakers: (Speaker & { proposals: ProposalExisting[] })[],
): Promise<{
  success: boolean
  audienceId: string
  syncedCount: number
  error?: Error
}> {
  const contacts: Contact[] = eligibleSpeakers
    .filter((s) => s.email)
    .map((speaker) => ({
      email: speaker.email!,
      firstName: speaker.name.split(' ')[0] || '',
      lastName: speaker.name.split(' ').slice(1).join(' ') || '',
    }))

  const result = await syncAudienceWithContacts(
    conference,
    'speakers',
    contacts,
  )

  return {
    success: result.success,
    audienceId: result.audienceId,
    syncedCount: result.syncedCount,
    error: result.error,
  }
}

export async function syncSponsorAudience(
  conference: Conference,
  sponsorContacts: Contact[],
): Promise<{
  success: boolean
  audienceId: string
  syncedCount: number
  addedCount: number
  removedCount: number
  error?: Error
}> {
  return syncAudienceWithContacts(conference, 'sponsors', sponsorContacts)
}
