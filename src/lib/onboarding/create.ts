/**
 * Onboarding S1 — pure, dependency-light building blocks for the CONCIERGE
 * organization-creation flow (RunKonf/platform#4, first slice).
 *
 * WHAT THIS IS: the platform operator (not public signup — no billing entity
 * exists yet) creates a brand-new TENANT: one `organization` document, that
 * org's FIRST `conference` document, and the organizer membership for a named
 * user — all in ONE Sanity transaction (see `onboarding.createOrganization`).
 *
 * These builders are React-free and Sanity-client-free so they can be
 * unit-tested directly and reused by the server mutation AND the wizard UI.
 * They mirror the SE-5 edition builder (`@/lib/conference/edition`) — but where
 * the edition wizard CLONES an existing edition's structure, this one starts
 * from BLANK with sane defaults:
 *
 *   - `visibility: 'unlisted'` — a new tenant is NEVER publicly discoverable
 *     on creation (absent-means-live, see `@/lib/conference/visibility`).
 *   - `registrationEnabled: false` — registration never opens on creation.
 *   - `formats` are SEEDED with {@link STARTER_SESSION_FORMATS} so the format
 *     half of the CFP needs no work at all — see that constant for why a blank
 *     list was the wrong default.
 *   - `topics` are LEFT EMPTY, deliberately: a topic list is far more
 *     conference-specific than a session length, so any seed we picked would be
 *     one conference's subject matter imposed on every tenant. The public CFP
 *     page renders greyed placeholder topics until an organizer picks real
 *     ones, and the activation checklist carries the row.
 *   - conference contact/CFP/sponsor emails default to the org contact email.
 *   - NO plan/billing fields: the organization schema deliberately excludes
 *     them until the billing issue lands (see `sanity/schemaTypes/organization.ts`).
 *
 * WHAT THAT LEAVES ON DAY ONE: a submitted proposal requires BOTH a format and
 * at least one topic (`validateProposalForm`, `ProposalInputSchema`), so a
 * freshly provisioned CFP still cannot accept a submission until the organizer
 * picks topics — `canAcceptProposals` says so, and the public CFP page and the
 * submit page both defer to it rather than offering a form nobody can complete.
 * The starter formats remove ONE of the two day-one blockers; seeding the other
 * would mean guessing what the conference is about.
 */

import { normalizeDomain } from '@/lib/conference/domains'
import { Format } from '@/lib/proposal/types'

/**
 * The session formats a newly provisioned conference starts with.
 *
 * WHY THESE EXIST AT ALL: provisioning used to write no formats, on the theory
 * that the activation checklist would walk the organizer through choosing them.
 * It does — but a proposal cannot be submitted without a format, so until the
 * organizer found that row their public CFP link accepted nothing (and, before
 * #824, 500'd outright). An empty format list is never the right answer for any
 * conference, so it is a bad default; a fresh tenant should get an organizer who
 * EDITS the list, not one who discovers it is empty.
 *
 * WHY THIS SET: ids come from the fixed {@link Format} vocabulary — this is a
 * closed enum, not free text, so a starter set can only pick from it.
 *
 *   - `lightning_10` — the short-slot staple, and the format
 *     `ProposalDraftSchema` falls back to when a draft carries none. Seeding it
 *     means that default is always a format the conference actually offers.
 *   - `presentation_25` — a talk that fits a 30-minute grid slot with changeover.
 *   - `presentation_45` — a talk that fits a 60-minute grid slot with changeover.
 *
 * WHAT IS DELIBERATELY ABSENT: workshops. `workshop_120`/`workshop_240` commit a
 * conference to rooms, instructors and a separate track — the public CFP page
 * renders a whole "Hands-on Workshops" section promising them — so they are an
 * opt-in, not a default. `presentation_20`/`presentation_40` are omitted as
 * near-duplicates of the two lengths above; a starter list that offers five
 * talk lengths is a menu to prune, not a default to accept.
 *
 * These are ORDINARY formats once written. Nothing marks them as defaults and
 * nothing should: the organizer's edits are the only state worth keeping, and a
 * "still the defaults" flag would be state to maintain forever for no behaviour.
 */
export const STARTER_SESSION_FORMATS: readonly Format[] = [
  Format.lightning_10,
  Format.presentation_25,
  Format.presentation_45,
]

/** Same normalization as the organization schema's `slugify` (and the 044
 * backfill migration) — strip punctuation and edge dashes, not just whitespace. */
export function slugifyOrganizationName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

/** A valid stored org slug: kebab-case alphanumeric, no edge/double dashes. */
export const ORG_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface OnboardingOrganizationInput {
  name: string
  slug: string
  contactEmail: string
  billingEmail?: string | null
}

export interface OnboardingConferenceInput {
  title: string
  city: string
  country: string
  /** Optional — a concierge tenant may not have dates yet; the activation
   * checklist prompts for them later. */
  startDate?: string | null
  endDate?: string | null
}

export interface OnboardingOrganizerInput {
  name: string
  /** Normalized (lowercased/trimmed) by the caller. */
  email: string
}

export interface OnboardingInput {
  organization: OnboardingOrganizationInput
  conference: OnboardingConferenceInput
  organizer: OnboardingOrganizerInput
  /** Optional at creation — a tenant can start on NO domain and attach one
   * later from settings; until then the conference simply doesn't route. */
  domains: string[]
}

/** A brand-new Sanity document stub (always carries an `_id` + `_type`). */
export type NewDocument = Record<string, unknown> & {
  _id: string
  _type: string
}

export interface BuildOnboardingResult {
  organization: NewDocument
  conference: NewDocument
  /**
   * The speaker document to CREATE for the named organizer — `null` when an
   * existing speaker was matched (the mutation then PATCHES that speaker's org
   * membership in the same transaction instead).
   */
  speaker: NewDocument | null
}

/**
 * Build the tenant's documents. PURE: takes pre-minted ids and a key minter so
 * tests are deterministic and the server passes real generators. When
 * `existingSpeakerId` is set, the organizer membership references THAT speaker
 * and no new speaker document is produced.
 */
export function buildOnboardingDocuments(
  input: OnboardingInput,
  ids: {
    organizationId: string
    conferenceId: string
    /** Used only when no existing speaker matched. */
    speakerId: string
    mintKey: () => string
  },
  existingSpeakerId: string | null,
): BuildOnboardingResult {
  const { organizationId, conferenceId, speakerId, mintKey } = ids
  const org = input.organization
  const conf = input.conference

  const organization: NewDocument = {
    _id: organizationId,
    _type: 'organization',
    name: org.name,
    slug: { _type: 'slug', current: org.slug },
    contactEmail: org.contactEmail,
    ...(org.billingEmail ? { billingEmail: org.billingEmail } : {}),
    // NO plan/entitlement fields: the org schema is intentionally lean until
    // the billing issue lands — do not add them here speculatively.
  }

  const organizerSpeakerId = existingSpeakerId ?? speakerId

  const speaker: NewDocument | null = existingSpeakerId
    ? null
    : {
        _id: speakerId,
        _type: 'speaker',
        name: input.organizer.name,
        // The login flow auto-links this account on the new organizer's FIRST
        // sign-in via verified-email intersection (`lower(email) in $emails`,
        // see getOrCreateSpeaker) and backfills the slug then.
        email: input.organizer.email,
        organizations: [
          { _type: 'reference', _ref: organizationId, _key: organizationId },
        ],
      }

  const domains = input.domains.map(normalizeDomain).filter((d) => d !== '')

  const conference: NewDocument = {
    _id: conferenceId,
    _type: 'conference',
    title: conf.title,
    // Tenant ownership (CaaS T1-1): the first edition belongs to the new org.
    organization: { _type: 'reference', _ref: organizationId },
    // The organizing body defaults to the organization's display name.
    organizer: org.name,
    city: conf.city,
    country: conf.country,
    ...(conf.startDate ? { startDate: conf.startDate } : {}),
    ...(conf.endDate ? { endDate: conf.endDate } : {}),
    // Sane comms defaults: everything funnels to the org contact address until
    // the tenant configures real ones from settings.
    contactEmail: org.contactEmail,
    cfpEmail: org.contactEmail,
    sponsorEmail: org.contactEmail,
    // The named user is the FIRST organizer — this membership is what makes
    // `organizerOrgIds` (and thus /admin access) light up at their next login.
    organizers: [
      { _type: 'reference', _ref: organizerSpeakerId, _key: mintKey() },
    ],
    ...(domains.length > 0 ? { domains } : {}),
    // A new tenant NEVER opens registration or gets discovered on creation:
    // absent-means-live, so the explicit 'unlisted' is required.
    registrationEnabled: false,
    visibility: 'unlisted',
    // A usable CFP on day one: without formats a proposal cannot be submitted
    // at all (`validateProposalForm`, and the `hasSubmittableFormats` gate on
    // the CFP page, the submit form and both submit routes). The organizer
    // edits this list from admin; nothing distinguishes it from one they typed.
    // Primitive array — Sanity `_key`s apply to objects, not strings.
    formats: [...STARTER_SESSION_FORMATS],
    // `topics` stays ABSENT (empty-safe) on purpose — see the module header.
  }

  return { organization, conference, speaker }
}
