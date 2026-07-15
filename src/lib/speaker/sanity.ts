import { Speaker, SpeakerInput } from '@/lib/speaker/types'
import {
  clientReadUncached as clientRead,
  clientWrite,
  clientReadCached,
} from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { v4 as randomUUID } from 'uuid'
import { Account, Profile, User } from 'next-auth'
import { ProposalExisting, Status } from '../proposal/types'
import { cacheLife, cacheTag } from 'next/cache'
import { generateUniqueSpeakerSlug } from './slug'
import { normalizeEmail, uniqueEmails } from './email'
import { verifiedEmails as fetchGithubVerifiedEmails } from '@/lib/profile/github'

// Computed field: speaker is an organizer if referenced in any conference's organizers array
const IS_ORGANIZER_FIELD =
  '"isOrganizer": _id in *[_type == "conference"].organizers[]._ref'

// Optional string fields that should be removed (unset) from Sanity when the
// caller sends an empty value, so a user can clear a previously-set value.
const CLEARABLE_SPEAKER_FIELDS = [
  'title',
  'bio',
  'gender',
  'genderSelfDescribe',
  'country',
] as const
export function providerAccount(
  provider: string,
  providerAccountId: string,
): string {
  return `${provider}:${providerAccountId}`
}

/**
 * Returns true when a speaker slug is already taken by a *different* document.
 * `selfId` excludes the speaker being updated so backfilling its own slug does
 * not count as a collision.
 */
async function speakerSlugExists(
  slug: string,
  selfId?: string,
): Promise<boolean> {
  try {
    const existingId = await clientRead.fetch(
      groq`*[_type == "speaker" && slug.current == $slug && _id != $selfId][0]._id`,
      { slug, selfId: selfId ?? '' },
    )
    return Boolean(existingId)
  } catch (error) {
    // If the uniqueness probe fails we prefer to proceed rather than loop
    // forever; a rare duplicate is recoverable, an infinite loop is not.
    console.error('Error checking speaker slug uniqueness', error)
    return false
  }
}

/**
 * Canonical unique-slug generator for persisted speakers. Wraps the shared pure
 * {@link generateUniqueSpeakerSlug} with the Sanity collision checker so the
 * OAuth create/link path and the admin create path produce identical slugs.
 */
export async function generateUniqueSlug(
  name: string,
  selfId?: string,
): Promise<string> {
  return generateUniqueSpeakerSlug(name, (slug) =>
    speakerSlugExists(slug, selfId),
  )
}

async function findSpeakerByProvider(
  id: string,
): Promise<{ speaker: Speaker; err: Error | null }> {
  let speaker = {} as Speaker
  let err = null

  try {
    speaker = await clientRead.fetch(
      `*[ _type == "speaker" && $id in providers][0]{
      ...,
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL),
      ${IS_ORGANIZER_FIELD}
    }`,
      { id },
    )
  } catch (error) {
    err = error as Error
  }

  return { speaker, err }
}

/**
 * Find all speakers whose display `email` or `knownEmails` match-set intersects
 * any of the given (already normalized) emails. Ordered oldest-first so the
 * caller can deterministically pick a link target and detect duplicates.
 */
async function findSpeakersByEmails(
  emails: string[],
): Promise<{ speakers: Speaker[]; err: Error | null }> {
  if (emails.length === 0) {
    return { speakers: [], err: null }
  }

  try {
    const speakers = (await clientRead.fetch(
      groq`*[_type == "speaker" && (lower(email) in $emails || count((knownEmails[])[lower(@) in $emails]) > 0)] | order(_createdAt asc) [0...5] {
        ...,
        "slug": slug.current,
        "image": coalesce(image.asset->url, imageURL),
        ${IS_ORGANIZER_FIELD}
      }`,
      { emails },
    )) as Speaker[]
    return { speakers: speakers || [], err: null }
  } catch (error) {
    return { speakers: [], err: error as Error }
  }
}

/**
 * Compute the set of VERIFIED emails for an incoming login, normalized.
 *
 * SECURITY: only these emails may ever be used to auto-link an incoming account
 * into an existing speaker. An unverified email must never link accounts, as
 * that would enable account takeover.
 *
 * - GitHub: the verified set from the GitHub `/user/emails` API. GitHub's OAuth
 *   userinfo only exposes a verified primary email, so `user.email` is treated
 *   as provider-verified and included as a fallback (e.g. if the API call
 *   fails).
 * - LinkedIn (OIDC): the primary is trusted as verified UNLESS `email_verified`
 *   is explicitly false. LinkedIn only ever asserts the account holder's own
 *   verified primary email (you cannot make it assert an address you don't own),
 *   so an absent claim is treated as verified; only an explicit `false`/`"false"`
 *   blocks the link. See LinkedIn note below.
 * - Unknown providers: no email is treated as verified (no auto-link).
 */
async function computeVerifiedEmails(
  user: User,
  account: Account,
  profile?: Profile,
): Promise<string[]> {
  const primary = normalizeEmail(user.email)
  const verified: string[] = []

  switch (account.provider) {
    case 'github': {
      const { emails, error } = await fetchGithubVerifiedEmails(account)
      if (error) {
        console.error(
          'Failed to fetch GitHub verified emails; falling back to OAuth primary',
          error,
        )
      }
      for (const entry of emails) {
        verified.push(entry.email)
      }
      // GitHub guarantees the primary email is verified before it is exposed via
      // OAuth, so the session primary is trusted as verified (used as a fallback
      // when the /user/emails API call fails or returns nothing).
      if (primary) verified.push(primary)
      break
    }
    case 'linkedin': {
      // LinkedIn only asserts the account holder's own verified primary email —
      // it cannot be induced to assert an address the login user doesn't own —
      // so the primary is trusted as verified unless `email_verified` is
      // explicitly false. OIDC claims can be stringified, so block both the
      // boolean `false` and the string "false"; absent/true/anything-else is
      // treated as verified.
      const claim = (
        profile as { email_verified?: boolean | string } | undefined
      )?.email_verified
      const isVerified = claim !== false && claim !== 'false'
      if (primary && isVerified) {
        verified.push(primary)
      }
      break
    }
    default:
      // Unknown provider: cannot establish verification -> do not auto-link.
      break
  }

  return uniqueEmails(verified)
}

/** Patch a speaker's slug if it is currently missing/empty. Never overwrites a
 * non-empty slug (that would break profile URLs / SEO). Mutates and returns the
 * passed speaker for convenience. */
async function backfillSlugIfMissing(speaker: Speaker): Promise<Speaker> {
  if (speaker.slug && speaker.slug.trim().length > 0) {
    return speaker
  }

  try {
    const slug = await generateUniqueSlug(speaker.name, speaker._id)
    await clientWrite
      .patch(speaker._id)
      .set({ slug: { _type: 'slug', current: slug } })
      .commit()
    speaker.slug = slug
  } catch (error) {
    console.error('Failed to backfill speaker slug', error)
  }

  return speaker
}

/**
 * Link an incoming provider account into an existing speaker: dedup the
 * provider id into `providers[]`, union the freshly VERIFIED incoming emails
 * into `knownEmails`, backfill a missing slug, and set the display `email` only
 * when it was empty.
 */
async function linkProviderToSpeaker(
  speaker: Speaker,
  providerAccountId: string,
  verifiedIncoming: string[],
  primaryEmail: string,
): Promise<{ speaker: Speaker; err: Error | null }> {
  const providers = Array.from(
    new Set([...(speaker.providers || []), providerAccountId]),
  )
  // SECURITY: `knownEmails` is the verified match-set. Seed it ONLY from the
  // speaker's existing (already-verified) entries plus this login's
  // `computeVerifiedEmails` output. Never fold in the raw display `email` or an
  // unverified `primaryEmail` — that would let an unverified address become a
  // future cross-provider match key. (`primaryEmail` is still used below purely
  // to backfill a missing display email.)
  const knownEmails = uniqueEmails([
    ...(speaker.knownEmails || []),
    ...verifiedIncoming,
  ])

  const patch: Record<string, unknown> = { providers, knownEmails }

  // Keep the existing non-empty display email; only set it when missing.
  const nextEmail =
    speaker.email && speaker.email.trim().length > 0
      ? speaker.email
      : primaryEmail
  if (nextEmail !== speaker.email) {
    patch.email = nextEmail
  }

  // Backfill slug only when missing; never change an existing non-empty slug.
  let slug = speaker.slug
  if (!slug || slug.trim().length === 0) {
    slug = await generateUniqueSlug(speaker.name, speaker._id)
    patch.slug = { _type: 'slug', current: slug }
  }

  try {
    await clientWrite.patch(speaker._id).set(patch).commit()
  } catch (error) {
    return { speaker, err: error as Error }
  }

  return {
    speaker: { ...speaker, providers, knownEmails, email: nextEmail, slug },
    err: null,
  }
}

export async function getOrCreateSpeaker(
  user: User,
  account: Account,
  profile?: Profile,
): Promise<{ speaker: Speaker; err: Error | null }> {
  if (!user.email || !user.name) {
    const err = new Error('Missing user email or name')
    console.error(err)
    return { speaker: {} as Speaker, err }
  }

  const providerAccountId = providerAccount(
    account.provider,
    account.providerAccountId,
  )

  // 1. Exact provider-account match: this account already belongs to a speaker.
  const providerResult = await findSpeakerByProvider(providerAccountId)
  if (providerResult.err) {
    console.error(
      'Error fetching speaker profile by account id',
      providerResult.err,
    )
    return { speaker: providerResult.speaker, err: providerResult.err }
  }
  if (providerResult.speaker?._id) {
    // Backfill a slug for pre-existing slugless speakers on login.
    await backfillSlugIfMissing(providerResult.speaker)
    return { speaker: providerResult.speaker, err: null }
  }

  // 2. Gather the VERIFIED emails for this login. Only verified emails may
  //    auto-link into an existing speaker (never link on an unverified email).
  const primaryEmail = normalizeEmail(user.email)
  const verifiedIncoming = await computeVerifiedEmails(user, account, profile)

  // 3. Attempt to match an existing speaker by verified email intersection.
  //
  //    SECURITY — stored-side-verified invariant: matching here is safe because
  //    every stored match key is verified-owned. `knownEmails` is written only
  //    by this login path from `computeVerifiedEmails` output (never from
  //    `updateEmail`/admin edits). The legacy display `email` is also safe: it
  //    is either a pre-existing value seeded from the provider primary at
  //    creation (verified), or set post-hardening only after ownership was
  //    proven (login primary, or `speaker.updateEmail` which now requires the
  //    caller's provider-verified set). So both keys are kept.
  if (verifiedIncoming.length > 0) {
    const { speakers, err } = await findSpeakersByEmails(verifiedIncoming)
    if (err) {
      console.error('Error fetching speaker profile by email', err)
      return { speaker: {} as Speaker, err }
    }

    if (speakers.length === 1) {
      // Exactly one verified-email match: unambiguously the same person.
      return linkProviderToSpeaker(
        speakers[0],
        providerAccountId,
        verifiedIncoming,
        primaryEmail,
      )
    }

    if (speakers.length > 1) {
      // H1 — genuinely ambiguous: the verified email matches multiple speakers
      // (the provider-id short-circuit in step 1 already handled the "same
      // account" case, so this is not that). Do NOT auto-link into any of them:
      // silently picking the oldest is attacker-influenceable and could merge a
      // login into the wrong account. Fall through to create a fresh speaker so
      // the user still gets a working session, and surface the ambiguous ids for
      // admin / Phase-4 reconciliation.
      console.warn(
        `ambiguous verified-email match for ${verifiedIncoming.join(
          ', ',
        )}: ${speakers
          .map((s) => s._id)
          .join(
            ', ',
          )} — creating a new speaker instead of linking into an ambiguous account`,
      )
    }
  }

  // 4. No (unambiguous) verified match: create a brand-new speaker with a unique
  //    slug. Seed `knownEmails` ONLY from verified emails so a new doc never
  //    starts life with an unverified match key.
  const _id = randomUUID()
  const knownEmails = uniqueEmails(verifiedIncoming)
  const slugValue = await generateUniqueSlug(user.name, _id)

  const speaker = {
    _id,
    email: user.email,
    name: user.name,
    imageURL: user.image || '',
    providers: [providerAccountId],
    knownEmails,
  } as Speaker

  try {
    const createdSpeaker = await clientWrite.create({
      _type: 'speaker',
      ...speaker,
      slug: {
        _type: 'slug',
        current: slugValue,
      },
    })

    const updatedSpeaker = {
      ...createdSpeaker,
      slug: slugValue,
    } as Speaker

    return { speaker: updatedSpeaker, err: null }
  } catch (error) {
    const err = error as Error
    return { speaker, err }
  }
}

/** Outcome of an explicit self-service provider link. */
export type ProviderLinkStatus = 'linked' | 'already-linked-elsewhere'

/**
 * Explicitly attach a just-authenticated provider account to an EXISTING speaker
 * (identity Phase 2 "link another provider"). Unlike {@link getOrCreateSpeaker},
 * this never creates or switches to a different document: the target speaker is
 * fixed by `speakerId` (resolved from a verified, integrity-protected link-intent
 * token — see `@/lib/auth-link`).
 *
 * SECURITY:
 *  - The ownership proof is the OAuth round-trip the caller just completed with
 *    `account`; only that provider id is attached.
 *  - `knownEmails` is only ever unioned with this login's VERIFIED emails
 *    (`computeVerifiedEmails`), preserving the Phase-1 verified-only invariant.
 *  - If the provider account is ALREADY linked to a DIFFERENT speaker Z we do
 *    NOT merge (that is the Phase-3 admin tool). We return
 *    `already-linked-elsewhere` and leave BOTH documents untouched so the UI can
 *    tell the user to contact the organizers.
 *  - Re-linking a provider already on the target speaker is idempotent.
 */
export async function attachProviderToSpeaker(
  speakerId: string,
  user: User,
  account: Account,
  profile?: Profile,
): Promise<{
  speaker: Speaker
  status: ProviderLinkStatus
  err: Error | null
}> {
  if (!speakerId) {
    return {
      speaker: {} as Speaker,
      status: 'linked',
      err: new Error('Missing target speaker id'),
    }
  }
  if (!user.email) {
    return {
      speaker: {} as Speaker,
      status: 'linked',
      err: new Error('Missing user email for provider link'),
    }
  }

  const providerAccountId = providerAccount(
    account.provider,
    account.providerAccountId,
  )

  // Guard: is this provider account already claimed by some speaker?
  const existing = await findSpeakerByProvider(providerAccountId)
  if (existing.err) {
    return { speaker: {} as Speaker, status: 'linked', err: existing.err }
  }
  if (existing.speaker?._id && existing.speaker._id !== speakerId) {
    // Pre-existing duplicate: belongs to a DIFFERENT speaker. Do not merge.
    return {
      speaker: existing.speaker,
      status: 'already-linked-elsewhere',
      err: null,
    }
  }

  // Load the fixed link target.
  const { speaker: target, err: targetErr } = await getSpeaker(speakerId)
  if (targetErr) {
    return { speaker: {} as Speaker, status: 'linked', err: targetErr }
  }
  if (!target?._id) {
    return {
      speaker: {} as Speaker,
      status: 'linked',
      err: new Error('Link target speaker not found'),
    }
  }

  // Attach the provider + this login's verified emails to the existing speaker.
  const primaryEmail = normalizeEmail(user.email)
  const verifiedIncoming = await computeVerifiedEmails(user, account, profile)
  const { speaker, err } = await linkProviderToSpeaker(
    target,
    providerAccountId,
    verifiedIncoming,
    primaryEmail,
  )

  return { speaker, status: 'linked', err }
}

export async function getSpeaker(
  speakerId: string,
): Promise<{ speaker: Speaker; err: Error | null }> {
  let speaker: Speaker = {} as Speaker
  let err = null

  try {
    speaker = await clientRead.fetch(
      `*[ _type == "speaker" && _id == $speakerId][0]{
      ...,
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL),
      ${IS_ORGANIZER_FIELD}
    }`,
      { speakerId },
      { cache: 'no-store' },
    )
  } catch (error) {
    err = error as Error
  }

  return { speaker, err }
}

export async function getPublicSpeaker(
  conferenceId: string,
  speakerSlug: string,
) {
  let data = {}
  let err = null

  try {
    data = await clientReadCached.fetch(
      `*[ _type == "speaker" && slug.current == $speakerSlug && count(*[_type == "talk" && references(^._id) && status == "confirmed" && conference._ref == $conferenceId]) > 0][0]{
        name, title, bio, links, flags, "image": coalesce(image.asset->url, imageURL),
        "talks": *[_type == "talk" && references(^._id) && status == "confirmed" && conference._ref == $conferenceId]{
          _id, title, description, language, level, format, audiences, video,
          attachments[]{
            ...,
            _type == "fileAttachment" => {
              "url": file.asset->url
            }
          },
          speakers[]-> {
            _id, name, title, "slug": slug.current, "image": coalesce(image.asset->url, imageURL)
          },
          topics[]-> {
            _id, title, "slug": slug.current
          },
          "scheduleInfo": {
            "talkId": _id,
            "schedule": *[_type == "schedule" && conference._ref == $conferenceId && ^._id in tracks[].talks[].talk._ref][0]
          } {
            "date": schedule.date,
            "trackTitle": schedule.tracks[count(talks[talk._ref == ^.talkId]) > 0][0].trackTitle,
            "timeSlot": schedule.tracks[count(talks[talk._ref == ^.talkId]) > 0][0].talks[talk._ref == ^.talkId][0]{
              startTime,
              endTime
            }
          }
        },
        "galleryImages": *[_type == "imageGallery" && conference._ref == $conferenceId && ^._id in speakers[]._ref] {
          _id,
          _rev,
          _createdAt,
          _updatedAt,
          image{asset, hotspot, crop, alt},
          "imageUrl": image.asset->url,
          "imageAlt": image.alt,
          photographer,
          date,
          location,
          featured,
          speakers[]->{_id, name, "slug": slug.current, image}
        } | order(featured desc, date desc)
      }`,
      { speakerSlug, conferenceId },
    )
  } catch (error) {
    err = error as Error
  }

  if (!data || Object.keys(data).length === 0) {
    return {
      speaker: null,
      talks: [],
      err:
        err ||
        new Error(
          'Speaker not found or has no confirmed talks for this conference',
        ),
    }
  }

  const talks =
    data && 'talks' in data ? (data.talks as ProposalExisting[]) : []
  const speaker = data as Speaker

  return { speaker, talks, err }
}

export async function updateSpeaker(
  speakerId: string,
  speaker: Partial<SpeakerInput>,
): Promise<{ speaker: Speaker; err: Error | null }> {
  let err = null
  let updatedSpeaker: Speaker = {} as Speaker

  try {
    const { image, slug, ...speakerWithoutImage } = speaker

    const patchData: Record<string, unknown> = { ...speakerWithoutImage }

    if (slug) {
      patchData.slug = {
        _type: 'slug',
        current: slug,
      }
    }

    if (typeof image === 'string' && image.startsWith('image-')) {
      patchData.image = {
        _type: 'image',
        asset: { _type: 'reference', _ref: image },
      }
    }

    // Clearing an optional field must remove it from Sanity. A key sent as
    // null/undefined/'' is ignored by `.set()`, so the old value would persist.
    // Collect those into `.unset()` instead so the field is actually cleared.
    const unsetKeys: string[] = []
    for (const key of CLEARABLE_SPEAKER_FIELDS) {
      if (key in patchData) {
        const value = patchData[key]
        if (value === undefined || value === null || value === '') {
          unsetKeys.push(key)
          delete patchData[key]
        }
      }
    }

    const patch = clientWrite.patch(speakerId).set(patchData)
    if (unsetKeys.length > 0) {
      patch.unset(unsetKeys)
    }
    await patch.commit()

    const { speaker: fetchedSpeaker, err: fetchErr } =
      await getSpeaker(speakerId)
    if (fetchErr) {
      throw fetchErr
    }
    updatedSpeaker = fetchedSpeaker
  } catch (error) {
    err = error as Error
  }

  return { speaker: updatedSpeaker, err }
}

export async function getSpeakers(
  conferenceId?: string,
  statuses: Status[] = [Status.confirmed],
  includeProposalsFromOtherConferences: boolean = false,
): Promise<{
  speakers: (Speaker & { proposals: ProposalExisting[] })[]
  err: Error | null
}> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:speakers')
  if (conferenceId) {
    cacheTag(`sanity:conference-${conferenceId}`)
  }

  let speakers: (Speaker & { proposals: ProposalExisting[] })[] = []
  let err = null

  try {
    const conferenceFilter = conferenceId
      ? `&& conference._ref == $conferenceId`
      : ''
    const statusFilter = statuses.map((status) => `"${status}"`).join(', ')

    const proposalsConferenceFilter = includeProposalsFromOtherConferences
      ? ''
      : conferenceFilter

    const query = groq`*[_type == "speaker" && count(*[_type == "talk" && references(^._id) && status in [${statusFilter}] ${conferenceFilter}]) > 0] {
      ...,
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL),
      "proposals": *[_type == "talk" && references(^._id) && status in [${statusFilter}] ${proposalsConferenceFilter}] {
        _id,
        title,
        status,
        format,
        language,
        level,
        audiences,
        conference-> {
          _id,
          title,
          startDate,
          endDate
        },
        topics[]-> {
          _id,
          title,
          color
        }
      }
    } | order(name asc)`

    speakers = await clientRead.fetch(
      query,
      conferenceId ? { conferenceId } : {},
      { cache: 'no-store' },
    )
  } catch (error) {
    err = error as Error
  }

  return { speakers, err }
}

export async function getSpeakersWithAcceptedTalks(
  conferenceId?: string,
  includeProposalsFromOtherConferences: boolean = false,
): Promise<{
  speakers: (Speaker & { proposals: ProposalExisting[] })[]
  err: Error | null
}> {
  return getSpeakers(
    conferenceId,
    [Status.accepted, Status.confirmed],
    includeProposalsFromOtherConferences,
  )
}

export async function getOrganizerCount(): Promise<{
  count: number
  err: Error | null
}> {
  let count = 0
  let err = null

  try {
    const query = groq`count(*[_type == "conference"].organizers[]._ref)`
    count = await clientRead.fetch(query, {}, { cache: 'no-store' })
  } catch (error) {
    err = error as Error
  }

  return { count, err }
}

export async function getOrganizers(): Promise<{
  speakers: Speaker[]
  err: Error | null
}> {
  let speakers: Speaker[] = []
  let err = null

  try {
    const query = groq`*[_type == "speaker" && _id in *[_type == "conference"].organizers[]._ref] {
      ...,
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL),
      "isOrganizer": true
    } | order(name asc)`

    speakers = await clientRead.fetch(query, {}, { cache: 'no-store' })
  } catch (error) {
    err = error as Error
  }

  return { speakers, err }
}

export async function getOrganizersByConference(conferenceId: string): Promise<{
  speakers: Speaker[]
  err: Error | null
}> {
  let speakers: Speaker[] = []
  let err = null

  try {
    // Fetch organizers directly from the conference document's organizers array
    const query = groq`*[_type == "conference" && _id == $conferenceId][0].organizers[]-> {
      ...,
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL)
    } | order(name asc)`

    speakers = await clientRead.fetch(
      query,
      { conferenceId },
      { cache: 'no-store' },
    )
  } catch (error) {
    err = error as Error
  }

  return { speakers: speakers || [], err }
}
