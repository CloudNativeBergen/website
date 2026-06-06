import type { SponsorForConferenceExpanded } from './types'
import type { ContactPerson } from '@/lib/sponsor/types'

/**
 * Shared field predicates — the single definition of what counts as a valid
 * primary contact and a valid contract value, reused by both the readiness
 * check here and the transition state machine so the UI and the guards never
 * disagree.
 */
export function hasPrimaryContact(
  contactPersons: ContactPerson[] | null | undefined,
): boolean {
  if (!contactPersons) return false
  return contactPersons.some(
    (c) =>
      !!c.name && !!c.email && (c.isPrimary || contactPersons.length === 1),
  )
}

export function hasPositiveContractValue(
  value: number | null | undefined,
): boolean {
  return value != null && value > 0
}

export type ReadinessSource = 'organizer' | 'sponsor' | 'pipeline'
export type ReadinessSeverity = 'required' | 'recommended'

export interface MissingField {
  field: string
  label: string
  source: ReadinessSource
  severity: ReadinessSeverity
  /** Actionable, user-facing sentence. Falls back to `label` where absent. */
  message?: string
}

export interface ContractReadiness {
  ready: boolean
  canSend: boolean
  missing: MissingField[]
}

/**
 * A required/recommended field and how to check it. Generic over the subject so
 * the same model serves both contract readiness (the expanded record) and the
 * transition state machine (a narrower state view).
 */
export interface FieldDef<T = SponsorForConferenceExpanded> {
  field: string
  label: string
  source: ReadinessSource
  severity: ReadinessSeverity
  message?: string
  check: (subject: T) => boolean
}

/**
 * Evaluates field definitions against a subject and returns the structured
 * MissingField records for those whose check fails. Shared by the contract
 * readiness check and the transition state machine so both speak one model.
 */
export function collectMissing<T>(
  defs: FieldDef<T>[],
  subject: T,
): MissingField[] {
  return defs
    .filter((def) => !def.check(subject))
    .map(({ field, label, source, severity, message }) => ({
      field,
      label,
      source,
      severity,
      ...(message ? { message } : {}),
    }))
}

const ORGANIZER_FIELDS: FieldDef[] = [
  {
    field: 'conference.organizer',
    label: 'Organizer name',
    source: 'organizer',
    severity: 'recommended',
    check: (sfc) => !!sfc.conference.organizer,
  },
  {
    field: 'conference.organizerOrgNumber',
    label: 'Organizer org. number',
    source: 'organizer',
    severity: 'recommended',
    check: (sfc) => !!sfc.conference.organizerOrgNumber,
  },
  {
    field: 'conference.organizerAddress',
    label: 'Organizer address',
    source: 'organizer',
    severity: 'recommended',
    check: (sfc) => !!sfc.conference.organizerAddress,
  },
  {
    field: 'conference.startDate',
    label: 'Conference start date',
    source: 'organizer',
    severity: 'recommended',
    check: (sfc) => !!sfc.conference.startDate,
  },
  {
    field: 'conference.venueName',
    label: 'Venue name',
    source: 'organizer',
    severity: 'recommended',
    check: (sfc) => !!sfc.conference.venueName,
  },
  {
    field: 'conference.sponsorEmail',
    label: 'Sponsor liaison email',
    source: 'organizer',
    severity: 'recommended',
    check: (sfc) => !!sfc.conference.sponsorEmail,
  },
]

const SPONSOR_FIELDS: FieldDef[] = [
  {
    field: 'sponsor.orgNumber',
    label: 'Sponsor org. number',
    source: 'sponsor',
    severity: 'recommended',
    check: (sfc) => !!sfc.sponsor.orgNumber,
  },
  {
    field: 'sponsor.address',
    label: 'Sponsor address',
    source: 'sponsor',
    severity: 'recommended',
    check: (sfc) => !!sfc.sponsor.address,
  },
  {
    field: 'contactPersons',
    label: 'Primary contact person',
    source: 'sponsor',
    severity: 'required',
    check: (sfc) => hasPrimaryContact(sfc.contactPersons),
  },
]

const PIPELINE_FIELDS: FieldDef[] = [
  {
    field: 'tier',
    label: 'Sponsor tier',
    source: 'pipeline',
    severity: 'required',
    check: (sfc) => !!sfc.tier,
  },
  {
    field: 'contractValue',
    label: 'Contract value',
    source: 'pipeline',
    severity: 'required',
    check: (sfc) => hasPositiveContractValue(sfc.contractValue),
  },
]

export function checkContractReadiness(
  sfc: SponsorForConferenceExpanded,
): ContractReadiness {
  const missing = collectMissing(
    [...ORGANIZER_FIELDS, ...SPONSOR_FIELDS, ...PIPELINE_FIELDS],
    sfc,
  )

  const allRequiredPresent = !missing.some((m) => m.severity === 'required')

  return {
    ready: missing.length === 0,
    canSend: allRequiredPresent,
    missing,
  }
}

export function groupMissingBySource(
  missing: MissingField[],
): Record<ReadinessSource, MissingField[]> {
  return {
    organizer: missing.filter((m) => m.source === 'organizer'),
    sponsor: missing.filter((m) => m.source === 'sponsor'),
    pipeline: missing.filter((m) => m.source === 'pipeline'),
  }
}
