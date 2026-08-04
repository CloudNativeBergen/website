import type { SponsorForConferenceExpanded } from './types'
import { evaluateBilling, invoiceFormatLabel } from './billing'
import { SPONSOR_STATUS_LABELS } from './labels'
import { csvDocument, csvFilename } from '@/lib/csv'

const COLUMNS = [
  'Sponsor',
  'Org. number',
  'Status',
  'Tier',
  'Contact name',
  'Contact email',
  'Contact phone',
  'Contact role',
  'Primary contact',
  'Invoice format',
  'Billing email',
  'Billing reference',
  'Billing comments',
  'Billing status',
] as const

/**
 * Renders the contact rows exactly as the table shows them: one line per
 * contact person, and a single line with empty contact columns for a sponsor
 * that has none — so an organizer can see at a glance who is still missing.
 *
 * Billing columns repeat on every line of the same sponsor: a spreadsheet is
 * sorted and filtered per row, so blanking them on continuation lines (as the
 * table does visually) would silently drop the billing details of any sponsor
 * whose first contact is filtered out.
 */
export function buildContactsCsv(
  sponsors: SponsorForConferenceExpanded[],
): string {
  const rows: Array<Array<string | undefined>> = []

  for (const sfc of sponsors) {
    const billing = evaluateBilling(sfc)
    const billingCells = [
      invoiceFormatLabel(sfc.billing?.invoiceFormat) ?? 'Not set',
      sfc.billing?.email,
      sfc.billing?.reference,
      sfc.billing?.comments,
      billing.complete
        ? 'Complete'
        : `Missing: ${billing.gaps.map((gap) => gap.label).join('; ')}`,
    ]
    const sponsorCells = [
      sfc.sponsor.name,
      sfc.sponsor.orgNumber,
      SPONSOR_STATUS_LABELS[sfc.status] ?? sfc.status,
      sfc.tier?.title,
    ]

    const contacts = sfc.contactPersons ?? []
    if (contacts.length === 0) {
      rows.push([...sponsorCells, '', '', '', '', '', ...billingCells])
      continue
    }

    for (const contact of contacts) {
      rows.push([
        ...sponsorCells,
        contact.name,
        contact.email,
        contact.phone,
        contact.role,
        contact.isPrimary ? 'Yes' : 'No',
        ...billingCells,
      ])
    }
  }

  return csvDocument(COLUMNS, rows)
}

/** Filename stem for the export, e.g. `sponsor-contacts-cloud-native-days-2026`. */
export function contactsCsvFilename(conferenceTitle: string): string {
  return csvFilename('sponsor-contacts', conferenceTitle)
}
