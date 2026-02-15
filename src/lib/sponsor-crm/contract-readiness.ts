import type { SponsorForConferenceExpanded } from './types'

export type ReadinessSource = 'organizer' | 'sponsor' | 'pipeline'
export type ReadinessSeverity = 'required' | 'recommended'

export interface MissingField {
  field: string
  label: string
  source: ReadinessSource
  severity: ReadinessSeverity
}

export interface ContractReadiness {
  ready: boolean
  canSend: boolean
  missing: MissingField[]
}

interface FieldDef {
  field: string
  label: string
  source: ReadinessSource
  severity: ReadinessSeverity
  check: (sfc: SponsorForConferenceExpanded) => boolean
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
    check: (sfc) =>
      !!sfc.contactPersons?.some(
        (c) =>
          c.name &&
          c.email &&
          (c.isPrimary || sfc.contactPersons?.length === 1),
      ),
  },
]

const PIPELINE_FIELDS: FieldDef[] = [
  {
    field: 'tier',
    label: 'Sponsor tier',
    source: 'pipeline',
    severity: 'recommended',
    check: (sfc) => !!sfc.tier,
  },
  {
    field: 'contractValue',
    label: 'Contract value',
    source: 'pipeline',
    severity: 'recommended',
    check: (sfc) => sfc.contractValue != null && sfc.contractValue > 0,
  },
]

export function checkContractReadiness(
  sfc: SponsorForConferenceExpanded,
): ContractReadiness {
  const missing: MissingField[] = []

  const ALL_FIELDS = [
    ...ORGANIZER_FIELDS,
    ...SPONSOR_FIELDS,
    ...PIPELINE_FIELDS,
  ]

  for (const { field, label, source, severity, check } of ALL_FIELDS) {
    if (!check(sfc)) {
      missing.push({ field, label, source, severity })
    }
  }

  const hasRequired = !missing.some((m) => m.severity === 'required')

  return {
    ready: missing.length === 0,
    canSend: hasRequired,
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
