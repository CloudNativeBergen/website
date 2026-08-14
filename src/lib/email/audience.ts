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
 * Because the NAME is the key, it has to be unique per conference across a whole
 * account — see {@link conferenceAudienceName} (#886).
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
 */
export function conferenceAudienceName(
  conference: Pick<Conference, '_id' | 'title'>,
  audienceType: AudienceType,
): string {
  return `${conference.title} ${AUDIENCE_SUFFIX[audienceType]} [${conference._id}]`
}

/** The pre-#886 name: title-keyed, and therefore collidable. */
function legacyConferenceAudienceName(
  conference: Pick<Conference, 'title'>,
  audienceType: AudienceType,
): string {
  return `${conference.title} ${AUDIENCE_SUFFIX[audienceType]}`
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
 * So the resolver ADOPTS the existing audience instead: it looks the new name up
 * first, then falls back to the legacy name and keeps using that audience, id and
 * contacts intact. Nothing is created, nothing is orphaned, no migration to run.
 *
 * The fallback is ALLOWLISTED because an unconditional one would reopen the very
 * collision this change closes — a new tenant sharing a title would adopt the
 * incumbent's list. These are the conferences that existed when the rename
 * landed, so they are the only ones that can have an audience under a legacy
 * name; every conference created afterwards, including any second tenant's, gets
 * an id-keyed audience of its own and can never reach one of these. Delete an
 * entry once its legacy audience is gone from the account; delete the whole list
 * when none remain.
 */
const LEGACY_AUDIENCE_CONFERENCE_IDS: ReadonlySet<string> = new Set([
  '0d9747cd-e128-4698-8ba7-3dfd4029d692', // Cloud Native Day Bergen 2024
  'd02570e5-7fb6-46e0-a0a1-d27bbbb0a3b5', // Cloud Native Day Bergen 2025
  'eb7b16c6-00fa-44a0-adcd-4a480de34242', // Cloud Native Days Norway 2026
  'kkdemo.conference', // KontainerKonf 2026 (demo tenant)
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

    const existingAudience = all.find(
      (audience) => audience.name === audienceName,
    )

    if (existingAudience) {
      return { audienceId: existingAudience.id, client }
    }

    // ADOPT the pre-#886 title-keyed audience rather than orphaning it. Only for
    // the conferences that predate the rename — see
    // LEGACY_AUDIENCE_CONFERENCE_IDS for why the allowlist is the thing keeping
    // this from being the collision it replaces.
    if (LEGACY_AUDIENCE_CONFERENCE_IDS.has(conference._id)) {
      const legacyName = legacyConferenceAudienceName(conference, audienceType)
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
