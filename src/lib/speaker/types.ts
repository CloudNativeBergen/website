import { ProposalExisting } from '@/lib/proposal/types'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { PushPreferences, PushSubscriptionRecord } from '@/lib/push/types'

export enum Flags {
  localSpeaker = 'local',
  firstTimeSpeaker = 'first-time',
  diverseSpeaker = 'diverse',
  requiresTravelFunding = 'requires-funding',
}

export const flags = new Map([
  [Flags.localSpeaker, 'Local Speaker'],
  [Flags.firstTimeSpeaker, 'First Time Speaker'],
  [Flags.diverseSpeaker, 'Diverse Speaker'],
  [Flags.requiresTravelFunding, 'Requires Travel Funding'],
])

// Optional self-reported gender presets. Diversity data collected only for
// aggregate reporting. When `preferToSelfDescribe` is chosen, an optional
// free-text value is stored separately in `genderSelfDescribe`.
export const genderOptions = [
  'Woman',
  'Man',
  'Non-binary',
  'Prefer to self-describe',
  'Prefer not to say',
] as const

export type Gender = (typeof genderOptions)[number]

export const genderPreferToSelfDescribe: Gender = 'Prefer to self-describe'

export interface ConsentRecord {
  granted: boolean
  grantedAt?: string
  withdrawnAt?: string
  ipAddress?: string
}

export interface SpeakerConsent {
  dataProcessing?: ConsentRecord
  marketing?: ConsentRecord
  publicProfile?: ConsentRecord
  photography?: ConsentRecord
  privacyPolicyVersion?: string
}

interface SpeakerBase {
  name: string
  slug?: string
  title?: string
  bio?: string
  links?: string[]
  flags?: Flags[]
  // `null` explicitly clears a previously-set value on update (see updateSpeaker).
  gender?: Gender | null
  genderSelfDescribe?: string | null
  country?: string | null
  consent?: SpeakerConsent
  galleryImages?: GalleryImageWithSpeakers[]
}

/**
 * Speaker data accepted by write paths (create / update).
 *
 * The `image` field is deliberately kept separate from the read-model
 * {@link Speaker.image} because the two carry different values despite sharing
 * the `string` type — this is the type ambiguity tracked in issue #353.
 */
export interface SpeakerInput extends SpeakerBase {
  /**
   * Write-side image value: a Sanity asset ID (e.g.
   * `image-abc123-500x500-png`) produced by the image upload API when a new
   * file is uploaded. `updateSpeaker()` only persists it when it matches the
   * `image-` asset-ID shape; any other value (such as a resolved CDN URL
   * round-tripped from a read model) is ignored. Forms should only include
   * this field when a new image was actually uploaded.
   */
  image?: string
  /**
   * Messaging email default (M4). Writable from the profile page's autosaving
   * "Message emails" toggle (V2a). Absent means ENABLED. Mirrors the read-model
   * {@link Speaker.messagingEmailDefault}.
   */
  messagingEmailDefault?: boolean
  /**
   * "Don't tag me in social posts" (#1148, MARKETING_TAGGING_SPEC §3.2).
   *
   * NOT a consent grant, so it is not in {@link SpeakerConsent}: every member
   * there records a permission granted, this records one withheld. Absent
   * counts as NOT opted out.
   *
   * The companion `socialTagOptOutAt` is DELIBERATELY ABSENT from this type.
   * It is the server's record of when the opt-out was made and is stamped by
   * `updateSpeaker`; a client-supplied value is discarded.
   */
  socialTagOptOut?: boolean
}

/**
 * One organizer-granted ticket address. See
 * {@link Speaker.ticketEmailGrants}.
 */
export interface TicketEmailGrant {
  _key?: string
  /** Normalized form — the exact string written into `knownEmails`. */
  email: string
  /** The address exactly as it appears on the ticket. */
  registeredEmail?: string
  /** The ticket provider's own id for the ticket that attested it. */
  ticketId?: number
  /** Speaker document id of the organizer who added it. */
  addedBy?: string
  addedByName?: string
  /**
   * Organization the grant was made in. A speaker is a GLOBAL person, so an
   * organizer of another tenant they belong to can read this list; who linked
   * the address, and off which ticket, is redacted for them.
   */
  addedByOrg?: string
  addedAt?: string
}

export interface Speaker extends SpeakerBase {
  _id: string
  _rev: string
  _createdAt: string
  _updatedAt: string
  email: string
  /**
   * Normalized (lowercased) match-set of every verified email known to belong
   * to this speaker across their linked OAuth providers. Distinct from the
   * single display {@link email}; used by `getOrCreateSpeaker` to link a second
   * provider whose verified email matches, avoiding duplicate speaker records.
   * Additive/optional — legacy documents without it remain valid.
   */
  knownEmails?: string[]
  /**
   * Provenance for the {@link knownEmails} entries an ORGANIZER added by
   * matching a ticket for this event, rather than a login proving them.
   *
   * The address itself lives in `knownEmails` and is a full sign-in identity
   * like any other entry there — the attestation is the ticket purchase, on the
   * reasoning that an attendee registers under an address they control because
   * that is where the ticket is delivered. These records are what makes that
   * decision reversible: who added the address, when, and off which ticket.
   * Removing an entry here is also what REVOKES the sign-in, so the two are
   * written and removed together.
   */
  ticketEmailGrants?: TicketEmailGrant[]
  providers?: string[]
  /**
   * Org-membership refs — the tenants this GLOBAL person belongs to (CaaS T1-1,
   * #613/#615). Accrues on every login via `ensureSpeakerOrgMembership`. Login
   * and admin queries project it as a flat id array (`organizations[]._ref`) for
   * org-preference resolution and org-scoped admin lists. Additive/optional;
   * legacy documents (pre-044 backfill) have no key and remain valid.
   */
  organizations?: string[]
  /**
   * Read-side image value: a fully-resolved display URL projected by GROQ as
   * `coalesce(image.asset->url, imageURL)`. It is either a Sanity CDN URL (from
   * an uploaded image) or an external OAuth avatar URL (the {@link imageURL}
   * fallback) — never a raw Sanity image object or a bare asset ID. Pass it
   * through `speakerImageUrl()` for display transforms.
   */
  image?: string
  /**
   * Legacy OAuth provider avatar URL (GitHub / LinkedIn), stored on first
   * sign-in by `getOrCreateSpeaker()`. Read queries do not project this field
   * directly; it is the fallback source for the resolved {@link image} URL
   * above.
   */
  imageURL?: string
  /**
   * @deprecated GLOBAL organizer flag — true iff this speaker is in ANY
   * conference's `organizers[]`. Superseded by {@link organizerOrgIds} for
   * authorization (CaaS T1-2, #614): access is org-SCOPED, and this flag takes NO
   * part in any authorization decision — both migration bridges that once fell
   * back to it are removed. NEVER gate access on it: being an organizer of ANY org
   * is not being an organizer of THIS one. Use
   * `isOrganizerForOrg`/`isOrganizerForCurrentOrg` (src/lib/authz/organizer.ts).
   * Still minted into the token and read by UI/recipient-selection code; a
   * follow-up removes those reads and the field.
   */
  isOrganizer?: boolean
  /**
   * Org-scoped organizer capability (CaaS T1-2, #614): the organization ids where
   * this speaker is an organizer — derived at login as the (deduped) set of
   * `organization._ref`s of the conferences whose `organizers[]` contain this
   * speaker. The authorization boundary keys on membership of the REQUEST's org
   * in this set; the request's org always comes from the domain-resolved
   * conference, never from client input. A handful of ids at most, so it is safe
   * to bake into the JWT. Additive/optional in the type, but REQUIRED in practice:
   * a legacy token minted before #635 lacks it and is therefore denied organizer
   * access everywhere until the holder signs in again.
   */
  organizerOrgIds?: string[]
  /**
   * Opt-in web push subscriptions for this speaker (#444). Additive/optional —
   * legacy documents without it remain valid. Managed exclusively by the tRPC
   * `push` router, always scoped to the authenticated caller's own `_id`.
   */
  pushSubscriptions?: PushSubscriptionRecord[]
  /**
   * Per-category web push preferences (#444). Absent means "all enabled" — see
   * {@link normalizePushPreferences}. Additive/optional; no migration required.
   */
  pushPreferences?: PushPreferences
  /**
   * Messaging email default (M4 flipped this to ON by default). The speaker is
   * emailed for new conversation messages whose per-conversation override is
   * 'default' unless this is EXPLICITLY false. Absent means ENABLED — covers
   * all existing speaker docs with no migration.
   */
  messagingEmailDefault?: boolean
  /**
   * The speaker asked not to be @-mentioned in marketing posts about them or
   * their talk (#1148). Absent means NOT opted out. Mirrors the write-side
   * {@link SpeakerInput.socialTagOptOut}.
   */
  socialTagOptOut?: boolean
  /**
   * When {@link socialTagOptOut} was set, stamped SERVER-SIDE. Written and
   * cleared only together with the boolean, and never accepted from a client.
   */
  socialTagOptOutAt?: string
}

/**
 * The exact payload `speaker.admin.getById` puts on the wire, and the return
 * type of {@link getSpeakerAdminDetail} — the two are narrowed in LOCKSTEP on
 * purpose (#863).
 *
 * `getSpeaker` opens with a bare `...` over the speaker document, so the admin
 * detail endpoint shipped every field the schema has and every field it ever
 * grows: `knownEmails` and `providers` (the login match-set and linked identity
 * providers), `organizations` (every OTHER tenant this person belongs to), and
 * the two whole-dataset computed fields. None of those administer a person;
 * they describe how they authenticate and who else they work with.
 *
 * WHAT DELIBERATELY STAYS: `email`, `gender`, `genderSelfDescribe`, `country`
 * and `consent`. Those are exactly the fields `SpeakerManagementModal` renders
 * and writes back through `speaker.admin.update`, so dropping them would break
 * the admin editor the moment it reads through this endpoint — the same trap
 * `bankingDetails` was in #865. They are sensitive, and the fix for reading
 * them across tenants is the ownership guard, not a thinner projection.
 *
 * An explicit projection that forgets a needed field fails SILENTLY (`undefined`,
 * not an error), so this type is the check: a consumer reading a dropped field
 * is a compile error. `sanity.projection.test.ts` additionally asserts the field
 * list against the query text, because TypeScript cannot tell a field the query
 * forgot from one the document simply lacks.
 */
export interface SpeakerAdminDetail {
  _id: string
  _createdAt: string
  _updatedAt: string
  name: string
  slug?: string
  title?: string
  bio?: string
  email: string
  links?: string[]
  flags?: Flags[]
  gender?: Gender | null
  genderSelfDescribe?: string | null
  country?: string | null
  consent?: SpeakerConsent
  image?: string
  /**
   * #1148. Projected so this endpoint cannot hand an organizer surface a
   * `false`-looking `undefined` for a speaker who HAS opted out.
   *
   * NOT a live bug today: `SpeakerManagementModal` reads its speaker from
   * `getSpeakers` (a `...` spread), and `speaker.admin.getById` has no UI
   * consumer yet. It is projected because anything that edits a speaker through
   * THIS payload would submit a withdrawal an organizer may not make, and every
   * save of that person would then be refused — a failure that arrives as
   * `undefined`, not as an error.
   */
  socialTagOptOut?: boolean
}

export interface SpeakerWithTalks extends Speaker {
  talks?: ProposalExisting[]
}

export interface SpeakerWithReviewInfo extends Speaker {
  submittedTalks?: ProposalExisting[]
  previousAcceptedTalks?: ProposalExisting[]
}
