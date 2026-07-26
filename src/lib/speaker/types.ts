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
   * authorization (CaaS T1-2, #614): access is now org-SCOPED. Retained in the
   * token as a backward-compat/migration bridge — the org-scoped middleware and
   * gates fall back to this ONLY when the request's organization cannot be
   * resolved (pre-044-backfill data / unknown domain). Prefer
   * `isOrganizerForOrg`/`isOrganizerForCurrentOrg` (src/lib/authz/organizer.ts).
   * UI still reads it this wave; a follow-up removes both the reads and the bridge.
   */
  isOrganizer?: boolean
  /**
   * Org-scoped organizer capability (CaaS T1-2, #614): the organization ids where
   * this speaker is an organizer — derived at login as the (deduped) set of
   * `organization._ref`s of the conferences whose `organizers[]` contain this
   * speaker. The authorization boundary keys on membership of the REQUEST's org
   * in this set; the request's org always comes from the domain-resolved
   * conference, never from client input. A handful of ids at most, so it is safe
   * to bake into the JWT. Additive/optional; a legacy token without it degrades
   * to the {@link isOrganizer} bridge.
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
}

export interface SpeakerWithTalks extends Speaker {
  talks?: ProposalExisting[]
}

export interface SpeakerWithReviewInfo extends Speaker {
  submittedTalks?: ProposalExisting[]
  previousAcceptedTalks?: ProposalExisting[]
}
