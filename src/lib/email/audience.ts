import type { Resend } from 'resend'
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

export async function getOrCreateConferenceAudienceByType(
  conference: Conference,
  audienceType: AudienceType,
): Promise<ConferenceAudience> {
  const audienceName = conferenceAudienceName(conference, audienceType)

  const client = await conferenceAudienceClient(conference)

  try {
    const listStart = Date.now()
    const existingAudiences = await retryWithBackoff(() =>
      client.audiences.list(),
    )
    const listDuration = Date.now() - listStart

    if (existingAudiences.error) {
      console.error('[Audience] Failed to list audiences:', {
        error: existingAudiences.error.message,
        audienceType,
        durationMs: listDuration,
      })
      throw new Error(
        `Failed to list audiences: ${existingAudiences.error.message}`,
      )
    }

    const all = existingAudiences.data?.data ?? []

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
      // Duplicates are possible here too — `audiences.list()` is itself a first
      // page (#889 names that hole), so an unseen legacy audience could have been
      // duplicated before #886 — and the same rule applies: never adopt one known
      // to be empty over one that might not be.
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

export async function removeContactFromAudience(
  client: Resend,
  audienceId: string,
  email: string,
): Promise<{ success: boolean; error?: Error }> {
  try {
    const contactsResponse = await retryWithBackoff(
      async () => await client.contacts.list({ audienceId }),
    )

    if (contactsResponse.error) {
      throw new Error(
        `Failed to list contacts: ${contactsResponse.error.message}`,
      )
    }

    const contact = contactsResponse.data?.data.find((c) => c.email === email)

    if (!contact) {
      return { success: true }
    }

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
    if (isRateLimitError(error)) {
      console.warn(
        `Contact with email ${email} could not be removed from audience due to persistent rate limiting`,
      )
    } else {
      console.error('Failed to remove contact from audience:', error)
    }
    return { success: false, error: error as Error }
  }
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

    const listStart = Date.now()
    const contactsResponse = await retryWithBackoff(
      async () => await client.contacts.list({ audienceId }),
    )
    const listDuration = Date.now() - listStart

    if (contactsResponse.error) {
      console.error('[Audience] Failed to list existing contacts:', {
        error: contactsResponse.error.message,
        audienceId,
        durationMs: listDuration,
      })
      throw new Error(
        `Failed to list existing contacts: ${contactsResponse.error.message}`,
      )
    }

    const existingContacts = contactsResponse.data?.data || []
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
      const { success } = await removeContactFromAudience(
        client,
        audienceId,
        existingContact.email,
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
