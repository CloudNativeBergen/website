/**
 * SE-5 — pure, dependency-light building blocks for the "Create next edition"
 * wizard. These functions are React-free and Sanity-client-free so they can be
 * unit-tested directly and reused verbatim by the server mutation
 * (`conference.createEdition`) AND the client wizard.
 *
 * WHAT THE WIZARD DOES: it seeds a NEW conference document that clones the
 * STRUCTURE of the current edition (topics, formats, teams, tiers, templates,
 * copy, goals, …) with fresh dates + domains, so an organizer never has to open
 * Sanity Studio to bootstrap next year. It never touches the source document.
 *
 * ── The conference-referencing document map (grounding) ────────────────────
 * Docs that carry a `conference` reference fall into two buckets:
 *
 *   STRUCTURE (cloned → NEW docs pointing at the new conference):
 *     - sponsorTier          (per-conference; conference._ref)
 *     - contractTemplate     (per-conference; conference._ref + tier._ref)
 *
 *   CONTENT (per-edition; NEVER cloned — a new edition starts empty):
 *     - talk / schedule / review / speakerBadge / travelSupport / volunteer /
 *       imageGallery / conversation / message / workshopAnnouncement /
 *       workshopSignup / coSpeakerInvitation / notification /
 *       sponsorForConference / dashboardConfig
 *
 * GLOBAL docs (shared by every edition; not conference-scoped, so nothing to
 * clone — they attach to the new edition automatically):
 *     - topic                (referenced by conference.topics[])
 *     - sponsorEmailTemplate (NO conference ref — global template library)
 *     - staff / speaker      (global people)
 *
 * On the conference document itself, field groups are copied per the clone
 * flags; identity fields (city/country/venue/logos/org legal info) are ALWAYS
 * copied, and content fields (schedules, featured, announcement, vanity
 * metrics, ticketing, checkin ids, registration link) are NEVER copied.
 */

import type { Reference } from 'sanity'
import { normalizeDomain } from './domains'

/** The structural families the wizard can clone. Content is never listed here. */
export const CLONE_FAMILIES = [
  'topics',
  'formats',
  'organizers',
  'teams',
  'sponsorTiers',
  'contractTemplates',
  'sponsorshipCopy',
  'cfpGoals',
  'agentConfig',
  'emailsAndChannels',
] as const

export type CloneFamily = (typeof CLONE_FAMILIES)[number]

export type CloneFlags = Record<CloneFamily, boolean>

/** Human labels + descriptions for the wizard's clone checklist. */
export const CLONE_FAMILY_META: Record<
  CloneFamily,
  { label: string; description: string }
> = {
  topics: {
    label: 'Topics',
    description: 'The CFP topic tags (shared topic documents, referenced).',
  },
  formats: {
    label: 'Formats',
    description:
      'Talk formats offered in the CFP (lightning, talk, workshop…).',
  },
  organizers: {
    label: 'Organizers',
    description: 'The organizer team — cloned by default for continuity.',
  },
  teams: {
    label: 'Organizer teams',
    description: 'Sub-teams used for notification routing and mail identities.',
  },
  sponsorTiers: {
    label: 'Sponsor tiers',
    description: 'Fresh tier documents pointing at the new edition.',
  },
  contractTemplates: {
    label: 'Contract templates',
    description: 'Fresh contract templates pointing at the new edition.',
  },
  sponsorshipCopy: {
    label: 'Sponsorship copy',
    description: 'Prospectus copy, benefits, signing provider and CRM cadence.',
  },
  cfpGoals: {
    label: 'CFP & revenue goals',
    description: 'Submission, format and sponsor-revenue targets.',
  },
  agentConfig: {
    label: 'AI agent configuration',
    description: 'Conference context and reviewer/CRM agent instructions.',
  },
  emailsAndChannels: {
    label: 'Emails & Slack channels',
    description: 'From-addresses, notification channels and social links.',
  },
}

/** Structure defaults ON; the maintainer can trim before creating. */
export const DEFAULT_CLONE_FLAGS: CloneFlags = {
  topics: true,
  formats: true,
  organizers: true,
  teams: true,
  sponsorTiers: true,
  contractTemplates: true,
  sponsorshipCopy: true,
  cfpGoals: true,
  agentConfig: true,
  emailsAndChannels: true,
}

// ── Next-edition heuristics ────────────────────────────────────────────────

/**
 * Bump the first 4-digit year (19xx–20xx) found in a title by `by` years, e.g.
 * "Cloud Native Days Bergen 2025" → "…2026". Titles without a year are returned
 * unchanged so the maintainer can adjust them by hand.
 */
export function nextEditionTitle(title: string, by = 1): string {
  return title.replace(/\b(19|20)\d{2}\b/, (year) => String(Number(year) + by))
}

/**
 * Add `by` calendar years to a `YYYY-MM-DD` date, clamping Feb-29 to Feb-28 in
 * a non-leap target year. Returns '' for a missing/malformed input so the caller
 * can leave the field blank.
 */
export function addYearsToDate(
  date: string | undefined | null,
  by = 1,
): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const [y, m, d] = date.split('-').map(Number)
  const targetYear = y + by
  const lastDay = new Date(targetYear, m, 0).getDate() // day 0 of next month
  const day = Math.min(d, lastDay)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${targetYear}-${pad(m)}-${pad(day)}`
}

/** Prefill for the wizard's Basics step, derived from the source edition. */
export interface EditionDefaults {
  title: string
  organizer: string
  startDate: string
  endDate: string
  cfpStartDate: string
  cfpEndDate: string
  cfpNotifyDate: string
  programDate: string
}

export function nextEditionDefaults(source: {
  title?: string
  organizer?: string
  startDate?: string
  endDate?: string
  cfpStartDate?: string
  cfpEndDate?: string
  cfpNotifyDate?: string
  programDate?: string
}): EditionDefaults {
  return {
    title: nextEditionTitle(source.title ?? ''),
    organizer: source.organizer ?? '',
    startDate: addYearsToDate(source.startDate),
    endDate: addYearsToDate(source.endDate),
    cfpStartDate: addYearsToDate(source.cfpStartDate),
    cfpEndDate: addYearsToDate(source.cfpEndDate),
    cfpNotifyDate: addYearsToDate(source.cfpNotifyDate),
    programDate: addYearsToDate(source.programDate),
  }
}

// ── Document builder ───────────────────────────────────────────────────────

/** A subset of the raw source conference document the builder reads. */
export interface SourceConference {
  _id: string
  title?: string
  organizer?: string
  organizerOrgNumber?: string
  organizerAddress?: string
  city?: string
  country?: string
  venueName?: string
  venueAddress?: string
  tagline?: string
  description?: string
  logoBright?: string
  logoDark?: string
  logomarkBright?: string
  logomarkDark?: string
  topics?: Array<Reference & { _key?: string }>
  formats?: string[]
  organizers?: Array<Reference & { _key?: string }>
  teams?: Array<Record<string, unknown>>
  contactEmail?: string
  cfpEmail?: string
  sponsorEmail?: string
  salesNotificationChannel?: string
  cfpNotificationChannel?: string
  socialLinks?: string[]
  cfpSubmissionGoal?: number
  cfpLightningGoal?: number
  cfpPresentationGoal?: number
  cfpWorkshopGoal?: number
  sponsorRevenueGoal?: number
  travelSupportBudget?: number
  signingProvider?: string
  sponsorBenefits?: Array<Record<string, unknown>>
  sponsorshipCustomization?: Record<string, unknown>
  crmInactivityThresholds?: Array<Record<string, unknown>>
  agentConfig?: Record<string, unknown>
}

/** A raw sponsorTier document as stored (conference ref points at the source). */
export interface SourceSponsorTier {
  _id: string
  title?: string
  tagline?: string
  tierType?: string
  price?: Array<Record<string, unknown>>
  perks?: Array<Record<string, unknown>>
  maxQuantity?: number
  soldOut?: boolean
  mostPopular?: boolean
}

/** A raw contractTemplate document as stored. */
export interface SourceContractTemplate {
  _id: string
  title?: string
  tier?: Reference
  language?: string
  currency?: string
  sections?: Array<Record<string, unknown>>
  headerText?: string
  footerText?: string
  terms?: unknown
  isDefault?: boolean
  isActive?: boolean
}

export interface CreateEditionInput {
  title: string
  organizer?: string | null
  startDate: string
  endDate: string
  cfpStartDate?: string | null
  cfpEndDate?: string | null
  cfpNotifyDate?: string | null
  programDate?: string | null
  domains: string[]
  clone: CloneFlags
}

/** A brand-new Sanity document stub (always carries an `_id` + `_type`). */
export type NewDocument = Record<string, unknown> & {
  _id: string
  _type: string
}

export interface BuildEditionResult {
  conference: NewDocument
  sponsorTiers: NewDocument[]
  contractTemplates: NewDocument[]
  /** family → number of items cloned (scalar groups count as 1 when copied). */
  summary: Partial<Record<CloneFamily, number>>
}

function reference(id: string, key: string): Reference & { _key: string } {
  return { _type: 'reference', _ref: id, _key: key }
}

/** Re-key an array so every item carries a fresh, stable `_key`. */
function rekey<T extends Record<string, unknown>>(
  items: T[] | undefined,
  mintKey: () => string,
): Array<T & { _key: string }> {
  return (items ?? []).map((item) => ({ ...item, _key: mintKey() }))
}

/**
 * Build the new-edition documents from the source. PURE: takes an id/key minter
 * so tests are deterministic and the server can pass a real generator. Never
 * reads or mutates the source; produces brand-new documents only.
 */
export function buildEditionDocuments(
  source: {
    conference: SourceConference
    sponsorTiers: SourceSponsorTier[]
    contractTemplates: SourceContractTemplate[]
  },
  input: CreateEditionInput,
  ids: { newConferenceId: string; mintId: () => string; mintKey: () => string },
): BuildEditionResult {
  const {
    conference: src,
    sponsorTiers: srcTiers,
    contractTemplates: srcTpls,
  } = source
  const { newConferenceId, mintId, mintKey } = ids
  const flags = input.clone
  const summary: Partial<Record<CloneFamily, number>> = {}

  // ── The conference document ──────────────────────────────────────────────
  const conference: NewDocument = {
    _id: newConferenceId,
    _type: 'conference',
    // Identity — ALWAYS copied (brand + legal details persist across editions).
    title: input.title,
    organizer: input.organizer ?? src.organizer,
    ...(src.organizerOrgNumber
      ? { organizerOrgNumber: src.organizerOrgNumber }
      : {}),
    ...(src.organizerAddress ? { organizerAddress: src.organizerAddress } : {}),
    ...(src.city ? { city: src.city } : {}),
    ...(src.country ? { country: src.country } : {}),
    ...(src.venueName ? { venueName: src.venueName } : {}),
    ...(src.venueAddress ? { venueAddress: src.venueAddress } : {}),
    ...(src.tagline ? { tagline: src.tagline } : {}),
    ...(src.description ? { description: src.description } : {}),
    ...(src.logoBright ? { logoBright: src.logoBright } : {}),
    ...(src.logoDark ? { logoDark: src.logoDark } : {}),
    ...(src.logomarkBright ? { logomarkBright: src.logomarkBright } : {}),
    ...(src.logomarkDark ? { logomarkDark: src.logomarkDark } : {}),
    // Fresh dates + domains from the wizard.
    startDate: input.startDate,
    endDate: input.endDate,
    ...(input.cfpStartDate ? { cfpStartDate: input.cfpStartDate } : {}),
    ...(input.cfpEndDate ? { cfpEndDate: input.cfpEndDate } : {}),
    ...(input.cfpNotifyDate ? { cfpNotifyDate: input.cfpNotifyDate } : {}),
    ...(input.programDate ? { programDate: input.programDate } : {}),
    domains: input.domains.map(normalizeDomain),
    // A new edition NEVER opens registration on creation.
    registrationEnabled: false,
  }

  if (flags.topics && src.topics && src.topics.length > 0) {
    conference.topics = src.topics.map((t) => reference(t._ref, mintKey()))
    summary.topics = src.topics.length
  }
  if (flags.formats && src.formats && src.formats.length > 0) {
    conference.formats = [...src.formats]
    summary.formats = src.formats.length
  }
  if (flags.organizers && src.organizers && src.organizers.length > 0) {
    conference.organizers = src.organizers.map((o) =>
      reference(o._ref, mintKey()),
    )
    summary.organizers = src.organizers.length
  }
  if (flags.teams && src.teams && src.teams.length > 0) {
    conference.teams = rekey(src.teams, mintKey)
    summary.teams = src.teams.length
  }
  if (flags.cfpGoals) {
    let copied = false
    for (const key of [
      'cfpSubmissionGoal',
      'cfpLightningGoal',
      'cfpPresentationGoal',
      'cfpWorkshopGoal',
      'sponsorRevenueGoal',
      'travelSupportBudget',
    ] as const) {
      const value = src[key]
      if (typeof value === 'number') {
        conference[key] = value
        copied = true
      }
    }
    if (copied) summary.cfpGoals = 1
  }
  if (flags.agentConfig && src.agentConfig) {
    conference.agentConfig = { ...src.agentConfig }
    summary.agentConfig = 1
  }
  if (flags.emailsAndChannels) {
    let copied = false
    for (const key of [
      'contactEmail',
      'cfpEmail',
      'sponsorEmail',
      'salesNotificationChannel',
      'cfpNotificationChannel',
    ] as const) {
      if (src[key]) {
        conference[key] = src[key]
        copied = true
      }
    }
    if (src.socialLinks && src.socialLinks.length > 0) {
      conference.socialLinks = [...src.socialLinks]
      copied = true
    }
    if (copied) summary.emailsAndChannels = 1
  }
  if (flags.sponsorshipCopy) {
    let copied = false
    if (src.sponsorBenefits && src.sponsorBenefits.length > 0) {
      conference.sponsorBenefits = rekey(src.sponsorBenefits, mintKey)
      copied = true
    }
    if (src.sponsorshipCustomization) {
      conference.sponsorshipCustomization = { ...src.sponsorshipCustomization }
      copied = true
    }
    if (src.signingProvider) {
      conference.signingProvider = src.signingProvider
      copied = true
    }
    if (src.crmInactivityThresholds && src.crmInactivityThresholds.length > 0) {
      conference.crmInactivityThresholds = rekey(
        src.crmInactivityThresholds,
        mintKey,
      )
      copied = true
    }
    if (copied) summary.sponsorshipCopy = 1
  }

  // ── Sponsor tiers → NEW docs pointing at the new conference ───────────────
  const tierIdMap = new Map<string, string>()
  const sponsorTiers: NewDocument[] = []
  if (flags.sponsorTiers) {
    for (const tier of srcTiers) {
      const newId = mintId()
      tierIdMap.set(tier._id, newId)
      sponsorTiers.push({
        _id: newId,
        _type: 'sponsorTier',
        ...(tier.title !== undefined ? { title: tier.title } : {}),
        ...(tier.tagline !== undefined ? { tagline: tier.tagline } : {}),
        ...(tier.tierType !== undefined ? { tierType: tier.tierType } : {}),
        ...(tier.price ? { price: rekey(tier.price, mintKey) } : {}),
        ...(tier.perks ? { perks: rekey(tier.perks, mintKey) } : {}),
        ...(tier.maxQuantity !== undefined
          ? { maxQuantity: tier.maxQuantity }
          : {}),
        ...(tier.soldOut !== undefined ? { soldOut: tier.soldOut } : {}),
        ...(tier.mostPopular !== undefined
          ? { mostPopular: tier.mostPopular }
          : {}),
        conference: { _type: 'reference', _ref: newConferenceId },
      })
    }
    if (sponsorTiers.length > 0) summary.sponsorTiers = sponsorTiers.length
  }

  // ── Contract templates → NEW docs; remap tier ref to the cloned tier ──────
  const contractTemplates: NewDocument[] = []
  if (flags.contractTemplates) {
    for (const tpl of srcTpls) {
      // Only carry the tier ref forward when that tier was cloned in THIS run;
      // otherwise it would dangle against the source edition's tier. The field
      // is optional, so dropping it keeps the template valid.
      const mappedTier = tpl.tier?._ref
        ? tierIdMap.get(tpl.tier._ref)
        : undefined
      contractTemplates.push({
        _id: mintId(),
        _type: 'contractTemplate',
        ...(tpl.title !== undefined ? { title: tpl.title } : {}),
        conference: { _type: 'reference', _ref: newConferenceId },
        ...(mappedTier
          ? { tier: { _type: 'reference', _ref: mappedTier } }
          : {}),
        ...(tpl.language !== undefined ? { language: tpl.language } : {}),
        ...(tpl.currency !== undefined ? { currency: tpl.currency } : {}),
        ...(tpl.sections ? { sections: rekey(tpl.sections, mintKey) } : {}),
        ...(tpl.headerText !== undefined ? { headerText: tpl.headerText } : {}),
        ...(tpl.footerText !== undefined ? { footerText: tpl.footerText } : {}),
        ...(tpl.terms !== undefined ? { terms: tpl.terms } : {}),
        ...(tpl.isDefault !== undefined ? { isDefault: tpl.isDefault } : {}),
        ...(tpl.isActive !== undefined ? { isActive: tpl.isActive } : {}),
      })
    }
    if (contractTemplates.length > 0)
      summary.contractTemplates = contractTemplates.length
  }

  return { conference, sponsorTiers, contractTemplates, summary }
}
