import type { SponsorForConferenceExpanded } from './types'

export type ReadinessSource = 'organizer' | 'sponsor' | 'pipeline'

export interface MissingField {
  field: string
  label: string
  source: ReadinessSource
}

export interface ContractReadiness {
  ready: boolean
  missing: MissingField[]
}

const ORGANIZER_FIELDS: Array<{
  field: string
  label: string
  check: (sfc: SponsorForConferenceExpanded) => boolean
}> = [
  {
    field: 'conference.organizer',
    label: 'Organizer name',
    check: (sfc) => !!sfc.conference.organizer,
  },
  {
    field: 'conference.organizerOrgNumber',
    label: 'Organizer org. number',
    check: (sfc) => !!sfc.conference.organizerOrgNumber,
  },
  {
    field: 'conference.organizerAddress',
    label: 'Organizer address',
    check: (sfc) => !!sfc.conference.organizerAddress,
  },
  {
    field: 'conference.startDate',
    label: 'Conference start date',
    check: (sfc) => !!sfc.conference.startDate,
  },
  {
    field: 'conference.venueName',
    label: 'Venue name',
    check: (sfc) => !!sfc.conference.venueName,
  },
  {
    field: 'conference.sponsorEmail',
    label: 'Sponsor liaison email',
    check: (sfc) => !!sfc.conference.sponsorEmail,
  },
]

const SPONSOR_FIELDS: Array<{
  field: string
  label: string
  check: (sfc: SponsorForConferenceExpanded) => boolean
}> = [
  {
    field: 'sponsor.orgNumber',
    label: 'Sponsor org. number',
    check: (sfc) => !!sfc.sponsor.orgNumber,
  },
  {
    field: 'sponsor.address',
    label: 'Sponsor address',
    check: (sfc) => !!sfc.sponsor.address,
  },
  {
    field: 'contactPersons',
    label: 'Primary contact person',
    check: (sfc) =>
      !!sfc.contactPersons?.some(
        (c) =>
          c.name &&
          c.email &&
          (c.isPrimary || sfc.contactPersons?.length === 1),
      ),
  },
]

const PIPELINE_FIELDS: Array<{
  field: string
  label: string
  check: (sfc: SponsorForConferenceExpanded) => boolean
}> = [
  {
    field: 'tier',
    label: 'Sponsor tier',
    check: (sfc) => !!sfc.tier,
  },
  {
    field: 'contractValue',
    label: 'Contract value',
    check: (sfc) => sfc.contractValue != null && sfc.contractValue > 0,
  },
]

export function checkContractReadiness(
  sfc: SponsorForConferenceExpanded,
): ContractReadiness {
  const missing: MissingField[] = []

  for (const { field, label, check } of ORGANIZER_FIELDS) {
    if (!check(sfc)) {
      missing.push({ field, label, source: 'organizer' })
    }
  }

  for (const { field, label, check } of SPONSOR_FIELDS) {
    if (!check(sfc)) {
      missing.push({ field, label, source: 'sponsor' })
    }
  }

  for (const { field, label, check } of PIPELINE_FIELDS) {
    if (!check(sfc)) {
      missing.push({ field, label, source: 'pipeline' })
    }
  }

  return { ready: missing.length === 0, missing }
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
