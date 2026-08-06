import { Speaker, SpeakerAdminDetail, SpeakerInput } from '@/lib/speaker/types'
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
import { conferenceTag } from '@/lib/cache/tags'
import { generateUniqueSpeakerSlug } from './slug'
import { canonicalEmail, normalizeEmail, uniqueEmails } from './email'
import type { DuplicateSpeakerInput } from './duplicates'
import { verifiedEmails as fetchGithubVerifiedEmails } from '@/lib/profile/github'
import { EXCLUDE_PUSH_FIELDS } from '@/lib/sanity/helpers'
import { getOrganizationRefForCurrentConference } from '@/lib/organization/sanity'
import { EMAIL_LINK_PROVIDER_ID } from '@/lib/auth/email-link/constants'

// Computed field: speaker is an organizer if referenced in any conference's organizers array
const IS_ORGANIZER_FIELD =
  '"isOrganizer": _id in *[_type == "conference"].organizers[]._ref'

// Computed field (CaaS T1-2, #614): the ORG-SCOPED organizer capability — the
// `organization._ref`s of the conferences whose `organizers[]` contain this
// speaker. Conferences with no `organization` (pre-044-backfill) are filtered
// out; duplicate refs (a speaker organizing several conferences of one org) are
// deduped in `applySpeakerToToken`. This is the source of the session token's
// `organizerOrgIds`, which the authorization middleware/gates key on.
const ORGANIZER_ORG_IDS_FIELD =
  '"organizerOrgIds": *[_type == "conference" && ^._id in organizers[]._ref && defined(organization._ref)].organization._ref'

/**
 * PUBLIC schedule predicate. A conference now keeps several `schedule` documents
 * per day — private `draft`s the organizers are still moving talks around in and
 * `archived` snapshots of every previously-published day — so a reverse lookup
 * that matches ANY document containing the talk resolves to whichever the store
 * happens to return first. After a single promote cycle an archived doc always
 * exists, which made the public speaker page show a stale (or never-published)
 * time slot at random.
 *
 * Legacy days written before the draft feature carry NO `status` at all: a bare
 * `status == "official"` would blank the program for every existing conference,
 * so a missing status counts as official — the same fallback `getScheduleData`
 * applies in `src/lib/schedule/server.ts`.
 */
const OFFICIAL_SCHEDULE_FILTER = '(status == "official" || !defined(status))'

/**
 * MINIMAL projection for the two hot login queries (`findSpeakerByProvider`,
 * `findSpeakersByEmails`). These run on EVERY login and cannot be indexed
 * (Sanity), so we never spread the full document (`...`) — that dragged along
 * bio/links/gender and, worse, the web-push blobs. We project exactly the fields
 * the auth flow needs:
 *   - token shape (`applySpeakerToToken`): _id, slug, name, email, image, flags,
 *     isOrganizer
 *   - account linking (`linkProviderToSpeaker`): providers, knownEmails, email
 *   - org-preference resolution (#615): organizations (as a flat id array)
 * `_createdAt` is kept so the email path can order oldest-first deterministically.
 */
const LOGIN_SPEAKER_PROJECTION = `{
    _id,
    _createdAt,
    name,
    email,
    flags,
    providers,
    knownEmails,
    "organizations": organizations[]._ref,
    "slug": slug.current,
    "image": coalesce(image.asset->url, imageURL),
    ${IS_ORGANIZER_FIELD},
    ${ORGANIZER_ORG_IDS_FIELD}
  }`

/**
 * Org-membership + participation predicate for ADMIN-facing speaker lists
 * (#615). A speaker belongs to an org's admin surface when they are either an
 * explicit member (`organizations[]._ref` — post-044-backfill everyone is) OR,
 * as a PRE-BACKFILL FALLBACK, they have a talk at any conference owned by the
 * org. The fallback means org-less legacy speakers who participated still
 * appear; once the backfill has stamped memberships, the membership clause
 * carries every speaker and the fallback is a harmless superset. Applied only
 * when an org id resolves — a null org id (unresolvable tenant) skips scoping
 * entirely so admin surfaces degrade to the prior global behaviour rather than
 * showing nothing.
 */
const SPEAKER_ORG_FILTER = `($orgId in coalesce(organizations, [])[]._ref || count(*[_type == "talk" && references(^._id) && conference->organization._ref == $orgId]) > 0)`

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
      `*[ _type == "speaker" && $id in providers][0]${LOGIN_SPEAKER_PROJECTION}`,
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
 *
 * GLOBAL by design: identity is a global person (a returning speaker from
 * another org's conference must still resolve to their existing account), so
 * this cross-tenant join is intentionally not org-scoped. Org PREFERENCE among
 * ambiguous matches is applied by the caller (`getOrCreateSpeaker`), which is
 * why `organizations` is projected here. Result set is bounded to 5.
 */
async function findSpeakersByEmails(
  emails: string[],
): Promise<{ speakers: Speaker[]; err: Error | null }> {
  if (emails.length === 0) {
    return { speakers: [], err: null }
  }

  try {
    const speakers = (await clientRead.fetch(
      // groq-global: cross-tenant identity join — a returning global person must
      // resolve regardless of which org they first belonged to (#615).
      groq`*[_type == "speaker" && (lower(email) in $emails || count((knownEmails[])[lower(@) in $emails]) > 0)] | order(_createdAt asc) [0...5] ${LOGIN_SPEAKER_PROJECTION}`,
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

/**
 * Append the CURRENT conference's organization to a speaker's `organizations`
 * membership array, idempotently (CaaS T1-1, #613). A speaker is a global
 * person; membership in a tenant accrues as they participate in it, so every
 * login stamps the current org if not already present.
 *
 * BEST-EFFORT: this is tenant bookkeeping, never a login gate. Any failure — no
 * resolvable organization (a legacy conference before the 044 backfill), no
 * request-domain context, or a transient write error — is swallowed so login
 * always proceeds. Append-if-absent is guarded by a membership check so repeated
 * logins never accumulate duplicate references.
 */
async function ensureSpeakerOrgMembership(speakerId: string): Promise<void> {
  try {
    const orgRef = await getOrganizationRefForCurrentConference()
    if (!orgRef) return
    const alreadyMember = await clientRead.fetch<boolean>(
      // groq-global-scoped: the filter DOES carry a tenant predicate —
      // `$orgRef in organizations[]._ref` — the rule just doesn't recognise
      // `$orgRef` as a tenant parameter name. `$orgRef` is resolved server-side
      // from the request domain (`getOrganizationRefForCurrentConference`, one
      // line above), never from input, so this counts membership in the CURRENT
      // tenant only.
      `count(*[_id == $speakerId && $orgRef in coalesce(organizations, [])[]._ref]) > 0`,
      { speakerId, orgRef },
    )
    if (alreadyMember) return
    await clientWrite
      .patch(speakerId)
      .setIfMissing({ organizations: [] })
      .insert('after', 'organizations[-1]', [
        { _type: 'reference', _ref: orgRef, _key: orgRef },
      ])
      .commit()
  } catch (error) {
    console.error('Failed to ensure speaker org membership', error)
  }
}

/**
 * Link an incoming provider into an existing speaker AND accrue the current-org
 * membership for that person (#615). Closes the gap where the email-match link
 * path linked the account but never stamped the tenant membership the way the
 * provider-match and create paths do. Membership stamping is best-effort and is
 * skipped when the link itself failed.
 */
async function linkAndAccrue(
  speaker: Speaker,
  providerAccountId: string,
  verifiedIncoming: string[],
  primaryEmail: string,
): Promise<{ speaker: Speaker; err: Error | null }> {
  const result = await linkProviderToSpeaker(
    speaker,
    providerAccountId,
    verifiedIncoming,
    primaryEmail,
  )
  if (!result.err && result.speaker?._id) {
    await ensureSpeakerOrgMembership(result.speaker._id)
  }
  return result
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
    // Accrue current-org membership for this returning person (CaaS T1-1).
    await ensureSpeakerOrgMembership(providerResult.speaker._id)
    return { speaker: providerResult.speaker, err: null }
  }

  // 2. Gather the VERIFIED emails for this login. Only verified emails may
  //    auto-link into an existing speaker (never link on an unverified email).
  // DISPLAY/recipient form (`canonicalEmail`, no NFKC) — `primaryEmail` is only
  // ever written to the deliverable `email` field, never used as a match key
  // (matching runs on `verifiedIncoming`). See `./email` for why the two forms
  // differ.
  const primaryEmail = canonicalEmail(user.email)
  const verifiedIncoming = await computeVerifiedEmails(user, account, profile)

  // 3. Attempt to match an existing speaker by verified email intersection.
  //
  //    SECURITY — the two stored match keys do NOT have the same standing, and
  //    this comment used to claim they did. Read it as a statement of what each
  //    key is actually worth:
  //
  //    `knownEmails` is verified-owned as far as THIS path is concerned: it is
  //    written here from `computeVerifiedEmails` output, never by `updateEmail`
  //    or an admin edit. (The speaker MERGE is a second writer and does not hold
  //    to that — it promotes both documents' display emails into the set. That
  //    is #808, not something this path can defend against.)
  //
  //    The legacy display `email` is NOT, in general. Most values are fine (a
  //    provider primary seeded at creation, or `speaker.updateEmail`, which
  //    requires the caller's provider-verified set), but `speaker.admin.
  //    updateEmail` sets this field from ORGANIZER input with no proof of
  //    ownership — it exists so an organizer can maintain contact details for a
  //    speaker they administer. An unverified value therefore reaches an
  //    authentication decision here, which is the wrong shape.
  //
  //    That endpoint is now scoped to speakers EXCLUSIVE to the organizer's own
  //    tenant (#742), so the primitive cannot cross a tenant boundary or reach
  //    a person another org also holds. Both keys are kept on that basis.
  //    Whether the display `email` should be a match key at all — and how to
  //    stop being one without breaking the invitee-claim flow that depends on
  //    it — is #807.
  if (verifiedIncoming.length > 0) {
    const { speakers, err } = await findSpeakersByEmails(verifiedIncoming)
    if (err) {
      console.error('Error fetching speaker profile by email', err)
      return { speaker: {} as Speaker, err }
    }

    if (speakers.length === 1) {
      // Exactly one verified-email match: unambiguously the same person.
      return linkAndAccrue(
        speakers[0],
        providerAccountId,
        verifiedIncoming,
        primaryEmail,
      )
    }

    if (speakers.length > 1) {
      // Multiple verified-email matches (the provider-id short-circuit in step 1
      // already handled the "same account" case, so this is a duplicate-account
      // situation). PREFER the current-org member (#615): a returning person who
      // is already active in THIS tenant is the unambiguous link target even
      // when the global match is ambiguous. If the matches narrow to exactly one
      // current-org member, link into it.
      const orgRef = await getOrganizationRefForCurrentConference()
      const orgMembers = orgRef
        ? speakers.filter((s) => (s.organizations || []).includes(orgRef))
        : []
      if (orgMembers.length === 1) {
        console.info(
          `ambiguous global email match narrowed to a single current-org member (${orgMembers[0]._id}); linking into it`,
        )
        return linkAndAccrue(
          orgMembers[0],
          providerAccountId,
          verifiedIncoming,
          primaryEmail,
        )
      }

      // H1 — still genuinely ambiguous (zero or several current-org members). Do
      // NOT auto-link into any of them: silently picking the oldest is
      // attacker-influenceable and could merge a login into the wrong account.
      // Fall through to create a fresh speaker so the user still gets a working
      // session, and surface the ambiguous ids for admin / Phase-4 reconciliation.
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
  //
  //    The display `email` is stored NORMALIZED (#684) rather than as the raw
  //    provider value: it is also a login match key, so writing the canonical
  //    form keeps new documents self-consistent with `knownEmails` and with
  //    every comparison performed elsewhere. Only new writes are affected —
  //    existing documents are left untouched and are folded at query time.
  const _id = randomUUID()
  const knownEmails = uniqueEmails(verifiedIncoming)
  const slugValue = await generateUniqueSlug(user.name, _id)

  const speaker = {
    _id,
    email: primaryEmail,
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

    // Seed the new person's first tenant membership (CaaS T1-1).
    await ensureSpeakerOrgMembership(updatedSpeaker._id)

    return { speaker: updatedSpeaker, err: null }
  } catch (error) {
    const err = error as Error
    return { speaker, err }
  }
}

/**
 * A human-ish display name derived from an address's local part, used ONLY when
 * a magic-link sign-in creates a brand-new speaker (there is no profile to read
 * a name from). `jane.doe+cfp@example.com` → `Jane Doe`. The user is prompted to
 * correct it on their first visit to the profile page.
 */
function nameFromEmailLocalPart(email: string): string {
  const local = email.split('@')[0]?.split('+')[0] ?? ''
  const words = local
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  return words.join(' ') || 'New speaker'
}

/**
 * Resolve (or create) the speaker behind an address whose ownership has ALREADY
 * been proven — today that means a redeemed email sign-in link, where delivery
 * IS the verification.
 *
 * WHY THIS EXISTS SEPARATELY FROM {@link getOrCreateSpeaker}: that function is
 * built around an OAuth `Account` and derives its verified-email set from the
 * provider (`computeVerifiedEmails`), whose `default` branch verifies NOTHING.
 * Calling it with a synthetic email account would therefore match nobody and
 * mint a duplicate speaker on every magic-link sign-in — precisely the
 * duplicate-profile problem #267 tracks, made worse by adding a third sign-in
 * route. This function reuses the SAME matching primitives instead:
 *
 *  1. exact prior email-link account (`providers[]`),
 *  2. the verified-email match-set (`lower(email)` + `knownEmails[]`), oldest
 *     first, with the current-org preference (#615) applied to ambiguity,
 *  3. otherwise a new speaker, seeded with this address as its first
 *     `knownEmails` entry.
 *
 * AMBIGUITY (several existing speakers share the verified address and none is
 * uniquely a member of the current org) follows the SAME H1 rule as the OAuth
 * path: create a fresh speaker rather than guess. Silently adopting the oldest
 * would be attacker-influenceable; refusing sign-in outright would strand a
 * legitimate user behind a data problem they cannot fix. #267's merge tooling
 * remains the cleanup path.
 *
 * The address joins `knownEmails` — the VERIFIED match-set — which is sound
 * because possession of the mailbox was just demonstrated. That is the same bar
 * `computeVerifiedEmails` applies to provider-asserted addresses.
 */
export async function getOrCreateSpeakerForVerifiedEmail(
  email: string,
  options: { nameHint?: string } = {},
): Promise<{ speaker: Speaker; err: Error | null }> {
  const normalized = normalizeEmail(email)
  const primaryEmail = canonicalEmail(email)
  if (!normalized) {
    const err = new Error('Missing email for verified-email speaker resolution')
    console.error(err)
    return { speaker: {} as Speaker, err }
  }

  const providerAccountId = providerAccount(EMAIL_LINK_PROVIDER_ID, normalized)

  // 1. This address has signed in by link before.
  const providerResult = await findSpeakerByProvider(providerAccountId)
  if (providerResult.err) {
    console.error(
      'Error fetching speaker profile by email-link account id',
      providerResult.err,
    )
    return { speaker: providerResult.speaker, err: providerResult.err }
  }
  if (providerResult.speaker?._id) {
    await backfillSlugIfMissing(providerResult.speaker)
    await ensureSpeakerOrgMembership(providerResult.speaker._id)
    return { speaker: providerResult.speaker, err: null }
  }

  // 2. Match an existing account by the verified-email set.
  const { speakers, err } = await findSpeakersByEmails([normalized])
  if (err) {
    console.error('Error fetching speaker profile by email', err)
    return { speaker: {} as Speaker, err }
  }

  if (speakers.length === 1) {
    return linkAndAccrue(
      speakers[0],
      providerAccountId,
      [normalized],
      primaryEmail,
    )
  }

  if (speakers.length > 1) {
    const orgRef = await getOrganizationRefForCurrentConference()
    const orgMembers = orgRef
      ? speakers.filter((s) => (s.organizations || []).includes(orgRef))
      : []
    if (orgMembers.length === 1) {
      console.info(
        `ambiguous global email match narrowed to a single current-org member (${orgMembers[0]._id}); linking into it`,
      )
      return linkAndAccrue(
        orgMembers[0],
        providerAccountId,
        [normalized],
        primaryEmail,
      )
    }
    console.warn(
      `ambiguous verified-email match on email sign-in: ${speakers
        .map((s) => s._id)
        .join(
          ', ',
        )} — creating a new speaker instead of linking into an ambiguous account`,
    )
  }

  // 3. New person.
  const _id = randomUUID()
  const name = options.nameHint?.trim() || nameFromEmailLocalPart(normalized)
  const slugValue = await generateUniqueSlug(name, _id)

  try {
    const created = await clientWrite.create({
      _id,
      _type: 'speaker',
      email: primaryEmail,
      name,
      imageURL: '',
      providers: [providerAccountId],
      knownEmails: [normalized],
      slug: { _type: 'slug', current: slugValue },
    })
    const speaker = { ...created, slug: slugValue } as Speaker
    await ensureSpeakerOrgMembership(speaker._id)
    return { speaker, err: null }
  } catch (error) {
    return { speaker: {} as Speaker, err: error as Error }
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
  // DISPLAY/recipient form (`canonicalEmail`, no NFKC) — `primaryEmail` is only
  // ever written to the deliverable `email` field, never used as a match key
  // (matching runs on `verifiedIncoming`). See `./email` for why the two forms
  // differ.
  const primaryEmail = canonicalEmail(user.email)
  const verifiedIncoming = await computeVerifiedEmails(user, account, profile)
  const { speaker, err } = await linkProviderToSpeaker(
    target,
    providerAccountId,
    verifiedIncoming,
    primaryEmail,
  )

  // Accrue current-org membership for this participating person (#615), mirroring
  // the login paths. Best-effort; never gates the link.
  if (!err && speaker?._id) {
    await ensureSpeakerOrgMembership(speaker._id)
  }

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
      ${EXCLUDE_PUSH_FIELDS},
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL),
      ${IS_ORGANIZER_FIELD},
      ${ORGANIZER_ORG_IDS_FIELD}
    }`,
      { speakerId },
      { cache: 'no-store' },
    )
  } catch (error) {
    err = error as Error
  }

  return { speaker, err }
}

/**
 * The ADMIN-DETAIL read behind `speaker.admin.getById`, explicitly projected
 * against {@link SpeakerAdminDetail} (#863).
 *
 * WHY IT IS A SEPARATE FUNCTION rather than a narrower `getSpeaker`. That one is
 * the SELF read — the CFP profile page, `speaker.getCurrent` and the auth token
 * all go through it and legitimately need the whole document, including the
 * login/identity fields. Narrowing it would break a person's own profile editor.
 * What was wrong was an ADMIN endpoint reusing the self read and so returning a
 * person's `knownEmails`, `providers` and other-tenant `organizations` to an
 * organizer. See the type for exactly what is dropped and what stays.
 *
 * IT IS NOT A TENANCY GUARD. The `_id` is a dataset-wide key, so this is still a
 * global by-id read; the caller MUST prove standing over `speakerId` first
 * (`requireSpeakerInCurrentOrg`), which is why the router guards BEFORE calling
 * this and never after. Speaker ownership is membership ∪ participation, which
 * has one authoritative implementation in `src/server/tenancy.ts` — expressing it
 * a third time as a GROQ predicate here would be a copy to keep in lockstep, and
 * the copy that drifts is the one that fails open.
 */
export async function getSpeakerAdminDetail(
  speakerId: string,
): Promise<{ speaker: SpeakerAdminDetail | null; err: Error | null }> {
  let speaker: SpeakerAdminDetail | null = null
  let err = null

  try {
    speaker = await clientRead.fetch<SpeakerAdminDetail | null>(
      `*[ _type == "speaker" && _id == $speakerId][0]{
      _id,
      _createdAt,
      _updatedAt,
      name,
      title,
      bio,
      email,
      links,
      flags,
      gender,
      genderSelfDescribe,
      country,
      consent,
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL)
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
            "schedule": *[_type == "schedule" && conference._ref == $conferenceId && ${OFFICIAL_SCHEDULE_FILTER} && ^._id in tracks[].talks[].talk._ref] | order(date asc) [0]
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
  orgId?: string | null,
): Promise<{
  speakers: (Speaker & { proposals: ProposalExisting[] })[]
  err: Error | null
}> {
  'use cache'
  cacheLife('hours')
  cacheTag('content:speakers')
  if (conferenceId) {
    cacheTag(conferenceTag(conferenceId))
  }

  let speakers: (Speaker & { proposals: ProposalExisting[] })[] = []
  let err = null

  // TENANT SCOPING (#616): with neither a conference nor an org there is no
  // predicate to scope EITHER the speaker list or the nested proposals, so the
  // query would read the whole dataset. Refuse instead of running it.
  if (!conferenceId && !orgId) {
    return {
      speakers,
      err: new Error(
        'getSpeakers requires a conferenceId or an orgId (tenant scoping, #616)',
      ),
    }
  }

  try {
    const conferenceFilter = conferenceId
      ? `&& conference._ref == $conferenceId`
      : ''
    const statusFilter = statuses.map((status) => `"${status}"`).join(', ')

    // ORG SCOPING (#615): when an org id resolves, restrict the admin list to
    // speakers who belong to the current org — either by explicit membership or,
    // pre-backfill, by participation in one of the org's conferences (see
    // SPEAKER_ORG_FILTER). A null/absent orgId leaves the list unscoped so the
    // surface degrades to prior behaviour rather than showing nothing.
    const orgFilter = orgId ? `&& ${SPEAKER_ORG_FILTER}` : ''

    // Crossing conferences must still stay INSIDE the org: without this, an
    // org-scoped speaker list would expose a shared speaker's proposals from
    // ANOTHER organization's conferences.
    //
    // FAILS CLOSED when no org resolves (#616). The fallback used to be `''` —
    // an entirely UNSCOPED nested projection — so a caller that asked for
    // cross-conference proposals without an org id (the admin badge page and the
    // admin speakers page both did) rendered a shared speaker's proposals from
    // EVERY organization. Falling back to the single-conference filter keeps the
    // page working (it just stops crossing editions) and can never cross tenants.
    const proposalsConferenceFilter = includeProposalsFromOtherConferences
      ? orgId
        ? '&& conference->organization._ref == $orgId'
        : conferenceFilter
      : conferenceFilter

    const query = groq`*[_type == "speaker" && count(*[_type == "talk" && references(^._id) && status in [${statusFilter}] ${conferenceFilter}]) > 0 ${orgFilter}] {
      ...,
      ${EXCLUDE_PUSH_FIELDS},
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

    const params: Record<string, unknown> = {}
    if (conferenceId) params.conferenceId = conferenceId
    if (orgId) params.orgId = orgId

    speakers = await clientRead.fetch(query, params, { cache: 'no-store' })
  } catch (error) {
    err = error as Error
  }

  return { speakers, err }
}

/**
 * The ORG-SCOPED corpus for duplicate detection (#267).
 *
 * Deliberately WIDER than `getSpeakers`: that one only returns speakers who have
 * a talk in one of the requested statuses, and a duplicate document is very
 * often the one with NO accepted talk (that is exactly why the person's
 * dashboard looks empty). The predicate here is `SPEAKER_ORG_FILTER` alone —
 * membership ∨ participation — which is the same set `requireSpeakerInCurrentOrg`
 * grants standing over, so detection can never surface a speaker the organizer
 * could not already see or act on.
 *
 * FAILS CLOSED on an unresolvable org (#616): with no `$orgId` the root filter
 * would be a bare `*[_type == "speaker"]` over the shared dataset, i.e. a
 * cross-tenant listing of every person's email and login providers. Refuse
 * instead of degrading to global, which is the opposite of what `getSpeakers`
 * does — that one is a page that should still render, this one is a privacy
 * surface with nothing safe to show.
 *
 * Talk counts are org-scoped too, so they answer the only question that matters
 * when picking a survivor: what would THIS organization lose by deleting this
 * document. Read-only and uncached — an organizer who has just merged must see
 * the result immediately.
 */
export async function getDuplicateSpeakerCandidateRecords(
  orgId: string | null | undefined,
): Promise<{ records: DuplicateSpeakerInput[]; err: Error | null }> {
  if (!orgId) {
    return {
      records: [],
      err: new Error(
        'getDuplicateSpeakerCandidateRecords requires an orgId (tenant scoping, #616)',
      ),
    }
  }

  try {
    // groq-global-scoped: the root predicate IS `SPEAKER_ORG_FILTER`
    // (`$orgId in organizations[]._ref` ∨ a talk at one of this org's
    // conferences) — the same tenant predicate the admin speaker lists use. The
    // `$orgId` param can never be absent; the guard above refuses that case.
    const query = groq`*[_type == "speaker" && ${SPEAKER_ORG_FILTER}]{
      _id,
      name,
      email,
      knownEmails,
      providers,
      _createdAt,
      "slug": slug.current,
      "talkCount": count(*[_type == "talk" && references(^._id) && conference->organization._ref == $orgId]),
      "confirmedTalkCount": count(*[_type == "talk" && references(^._id) && status == "confirmed" && conference->organization._ref == $orgId])
    }`

    const records = await clientRead.fetch<DuplicateSpeakerInput[]>(
      query,
      { orgId },
      { cache: 'no-store' },
    )
    return { records: records ?? [], err: null }
  } catch (error) {
    return { records: [], err: error as Error }
  }
}

export async function getSpeakersWithAcceptedTalks(
  conferenceId?: string,
  includeProposalsFromOtherConferences: boolean = false,
  orgId?: string | null,
): Promise<{
  speakers: (Speaker & { proposals: ProposalExisting[] })[]
  err: Error | null
}> {
  return getSpeakers(
    conferenceId,
    [Status.accepted, Status.confirmed],
    includeProposalsFromOtherConferences,
    orgId,
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

/**
 * The organizers of the given org's conferences — an exact scope (organizers are
 * defined by `conference.organizers`, so no membership fallback is needed).
 *
 * FAILS CLOSED (was the #723 shape). A null `orgId` used to return the GLOBAL
 * organizer set — every organizer of every tenant — and was reachable by simply
 * omitting the argument, which fed an admin speaker list directly. It now
 * returns an empty list and an error WITHOUT issuing any query, mirroring
 * `getSpeakers` and the notification-module sibling closed in #728. No caller
 * wants the cross-org superset, so no escape hatch is exported; if one ever
 * does, add an explicitly-named export rather than reinstating this default
 * (that is what `getAllOrganizerSpeakerIdsAcrossOrgs` does in
 * `src/lib/notification/sanity.ts`).
 *
 * `orgId` is REQUIRED (though nullable) so no call site can fall through to the
 * global set by omission — the way the previous default did.
 */
export async function getOrganizers(orgId: string | null | undefined): Promise<{
  speakers: Speaker[]
  err: Error | null
}> {
  if (!orgId) {
    return {
      speakers: [],
      err: new Error(
        'getOrganizers: refusing to list organizers without a resolved organization',
      ),
    }
  }

  let speakers: Speaker[] = []
  let err = null

  try {
    // The tenant boundary is the UNCONDITIONAL `organization._ref == $orgId`
    // predicate on the organizer sub-query below.
    // groq-global: `speaker` is the deliberate cross-tenant identity type (#615) and carries no tenant key.
    const query = groq`*[_type == "speaker" && _id in *[_type == "conference" && organization._ref == $orgId].organizers[]._ref] {
      ...,
      ${EXCLUDE_PUSH_FIELDS},
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL),
      "isOrganizer": true
    } | order(name asc)`

    speakers = await clientRead.fetch(
      query,
      { orgId },
      {
        cache: 'no-store',
      },
    )
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
      ${EXCLUDE_PUSH_FIELDS},
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
