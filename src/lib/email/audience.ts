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

/** `… Speakers [conference-id]` — anchored at the END of the name. */
const AUDIENCE_KEY_PATTERN = new RegExp(
  `\\s(${Object.values(AUDIENCE_SUFFIX).join('|')})\\s\\[([^[\\]]+)\\]$`,
)

/**
 * MATCH ON THE KEY, NOT ON THE WHOLE NAME (#889).
 *
 * The name embeds the title, so keying the LOOKUP on the whole name means a
 * title edit rotates the key: the resolver finds nothing, creates a fresh EMPTY
 * audience, and the next broadcast reaches nobody while reporting success. There
 * is no way to repair that afterwards from here, because `resend@6.16.0`'s
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
 * OLDEST WINS when several audiences carry the same key.
 *
 * The account can already hold a pair: the original (with every contact) plus
 * the empty one today's code minted after a title edit. The original is the
 * older of the two — it was created first and synced ever since — so age, not
 * name, picks the one worth keeping. Preferring the audience whose name matches
 * the CURRENT title would pick the empty orphan, which is the defect.
 *
 * `created_at` is on the real payload (`Segment`); an entry missing it sorts
 * last rather than winning by accident, and the id breaks a tie so the choice
 * never depends on the order Resend happened to list them in.
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
 * The pre-#886 name: title-keyed, and therefore collidable.
 *
 * The title is taken from {@link LEGACY_AUDIENCE_TITLES}, NOT from the
 * conference document, because the conference can be renamed and the legacy
 * audience cannot (no update method). These are historical constants — the
 * titles those four audiences were actually created under — so adoption keeps
 * working after a rename, which is the same property #889 gives every other
 * audience.
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
 * The VALUE is the title the legacy audience was created under, frozen here as a
 * historical fact (#889). It is not read from the conference document, so
 * renaming one of these four conferences before its legacy audience has been
 * adopted does not lose it.
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
    const keyed = all
      .filter((audience) =>
        hasAudienceKey(audience.name, conference._id, audienceType),
      )
      .sort(oldestFirst)

    if (keyed.length > 0) {
      const [adopted] = keyed
      if (keyed.length > 1) {
        // Rotation orphans from before #889: same conference, same type, several
        // audiences. The oldest is the one holding the contacts; the rest are
        // dead and want deleting by hand, since this code cannot tell which
        // contacts were added where.
        console.warn(
          '[Audience] Several audiences carry this conference key:',
          {
            conferenceId: conference._id,
            audienceType,
            using: adopted.name,
            ignoring: keyed.slice(1).map((audience) => audience.name),
          },
        )
      }
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
      const legacyAudience = all.find(
        (audience) => audience.name === legacyName,
      )
      if (legacyAudience) {
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
