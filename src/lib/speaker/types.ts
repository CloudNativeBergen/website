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
  isOrganizer?: boolean
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
}

export interface SpeakerWithTalks extends Speaker {
  talks?: ProposalExisting[]
}

export interface SpeakerWithReviewInfo extends Speaker {
  submittedTalks?: ProposalExisting[]
  previousAcceptedTalks?: ProposalExisting[]
}
