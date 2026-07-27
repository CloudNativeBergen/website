/**
 * Pure, React-free step logic for the onboarding S2 "New organization"
 * concierge wizard (RunKonf/platform#4). Kept separate from the component —
 * mirroring the SE-5 new-edition wizard — so gating/validation is unit-testable
 * without rendering internals.
 */

import {
  validateStringList,
  buildStringListPayload,
} from '@/components/admin/editConferenceLists'
import { ORG_SLUG_RE, slugifyOrganizationName } from '@/lib/onboarding/create'

/** The four wizard steps, in order. The done screen replaces the wizard. */
export const WIZARD_STEPS = [
  'organization',
  'conference',
  'domains',
  'review',
] as const
export type WizardStepId = (typeof WIZARD_STEPS)[number]

export const WIZARD_STEP_TITLES: Record<WizardStepId, string> = {
  organization: 'Organization',
  conference: 'First conference',
  domains: 'Domains',
  review: 'Review & create',
}

export function stepIndex(id: WizardStepId): number {
  return WIZARD_STEPS.indexOf(id)
}

export interface OrganizationState {
  name: string
  slug: string
  /** Whether the operator has hand-edited the slug (stops auto-derivation). */
  slugTouched: boolean
  contactEmail: string
  billingEmail: string
}

export interface ConferenceState {
  title: string
  city: string
  country: string
  startDate: string
  endDate: string
}

export interface WizardState {
  organization: OrganizationState
  conference: ConferenceState
  domains: string[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The slug shown for the current name until the operator edits it by hand. */
export function derivedSlug(org: OrganizationState): string {
  return org.slugTouched ? org.slug : slugifyOrganizationName(org.name)
}

/**
 * Validate the Organization step. Name, slug and contact email are required;
 * billing email is optional but must be well-formed when present. Server-side
 * slug availability is layered on top via `slugTaken`.
 */
export function validateOrganization(
  org: OrganizationState,
  slugTaken: boolean,
): Record<string, string> {
  const errs: Record<string, string> = {}
  const slug = derivedSlug(org)
  if (org.name.trim() === '') errs.name = 'Organization name is required'
  if (slug === '') errs.slug = 'Slug is required'
  else if (!ORG_SLUG_RE.test(slug))
    errs.slug =
      'Use lowercase letters, digits and single dashes (no leading/trailing dash)'
  else if (slugTaken) errs.slug = 'Already used by another organization'
  if (org.contactEmail.trim() === '')
    errs.contactEmail = 'Contact email is required'
  else if (!EMAIL_RE.test(org.contactEmail.trim()))
    errs.contactEmail = 'Enter a valid email address'
  if (org.billingEmail.trim() !== '' && !EMAIL_RE.test(org.billingEmail.trim()))
    errs.billingEmail = 'Enter a valid email address'
  return errs
}

/**
 * Validate the First-conference step. Title, city and country are required;
 * dates are OPTIONAL but travel as an ordered pair (a single-day event sets
 * both to the same date).
 */
export function validateConference(c: ConferenceState): Record<string, string> {
  const errs: Record<string, string> = {}
  if (c.title.trim() === '') errs.title = 'Conference title is required'
  if (c.city.trim() === '') errs.city = 'City is required'
  if (c.country.trim() === '') errs.country = 'Country is required'
  if (c.startDate !== '' && !DATE_RE.test(c.startDate))
    errs.startDate = 'Invalid date'
  if (c.endDate !== '' && !DATE_RE.test(c.endDate))
    errs.endDate = 'Invalid date'
  if (!errs.startDate && !errs.endDate) {
    if (Boolean(c.startDate) !== Boolean(c.endDate)) {
      errs[c.startDate ? 'endDate' : 'startDate'] =
        'Provide both dates, or neither'
    } else if (c.startDate && c.endDate && c.endDate < c.startDate) {
      errs.endDate = 'End date must be on or after the start date'
    }
  }
  return errs
}

/**
 * Local (shape) validation for the OPTIONAL domain list: blank rows are
 * ignored and an entirely empty list is VALID (a tenant can start on no domain
 * and attach one later). Global uniqueness is a server concern layered on via
 * `takenDomains`.
 */
export function domainsLocalErrors(domains: string[]): Record<string, string> {
  return validateStringList(
    {
      name: 'domains',
      itemType: 'hostname',
      itemLabel: 'domain',
      allowEmptyList: true,
    },
    domains,
  )
}

/** The cleaned, deduped domain payload sent to the server (may be empty). */
export function cleanDomains(domains: string[]): string[] {
  return buildStringListPayload(domains).map((d) => d.trim().toLowerCase())
}

export function organizationComplete(
  org: OrganizationState,
  slugTaken: boolean,
): boolean {
  return Object.keys(validateOrganization(org, slugTaken)).length === 0
}

export function conferenceComplete(c: ConferenceState): boolean {
  return Object.keys(validateConference(c)).length === 0
}

export function domainsComplete(
  domains: string[],
  takenDomains: readonly string[],
): boolean {
  if (Object.keys(domainsLocalErrors(domains)).length > 0) return false
  const taken = new Set(takenDomains.map((d) => d.trim().toLowerCase()))
  return cleanDomains(domains).every((d) => !taken.has(d))
}

/** Organizer identity (asked on the Organization step alongside the org). */
export interface OrganizerState {
  name: string
  email: string
}

export function validateOrganizer(o: OrganizerState): Record<string, string> {
  const errs: Record<string, string> = {}
  if (o.name.trim() === '') errs.organizerName = 'Organizer name is required'
  if (o.email.trim() === '') errs.organizerEmail = 'Organizer email is required'
  else if (!EMAIL_RE.test(o.email.trim()))
    errs.organizerEmail = 'Enter a valid email address'
  return errs
}

export function organizerComplete(o: OrganizerState): boolean {
  return Object.keys(validateOrganizer(o)).length === 0
}

/**
 * Whether the wizard may advance FROM `step`. Review has no "next".
 *
 * `organizerAmbiguous` mirrors the server's AMBIGUOUS_ORGANIZER_EMAIL rule
 * (the probe's `matchCount > 1`): createOrganization deterministically rejects
 * such an email, so the Organization step must not let the operator walk into
 * a guaranteed failure — the duplicates have to be merged first.
 */
export function canProceed(
  step: WizardStepId,
  state: WizardState,
  organizer: OrganizerState,
  slugTaken: boolean,
  takenDomains: readonly string[],
  organizerAmbiguous: boolean,
): boolean {
  switch (step) {
    case 'organization':
      return (
        organizationComplete(state.organization, slugTaken) &&
        organizerComplete(organizer) &&
        !organizerAmbiguous
      )
    case 'conference':
      return conferenceComplete(state.conference)
    case 'domains':
      return domainsComplete(state.domains, takenDomains)
    case 'review':
      return false
  }
}

/** The final gate on the Create button (same ambiguity rule as `canProceed`). */
export function canCreate(
  state: WizardState,
  organizer: OrganizerState,
  slugTaken: boolean,
  takenDomains: readonly string[],
  organizerAmbiguous: boolean,
): boolean {
  return (
    organizationComplete(state.organization, slugTaken) &&
    organizerComplete(organizer) &&
    !organizerAmbiguous &&
    conferenceComplete(state.conference) &&
    domainsComplete(state.domains, takenDomains)
  )
}
