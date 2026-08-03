import type { SponsorForConferenceExpanded } from './types'
import { evaluateBilling, invoiceFormatLabel } from './billing'
import { SPONSOR_STATUS_LABELS } from './labels'

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
 * Characters that make a spreadsheet treat a cell as a formula. Sponsor-entered
 * text (names, billing comments) ends up in this file, so cells starting with
 * one are prefixed with an apostrophe — the standard defence against CSV
 * injection when the export is opened in Excel or Sheets.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

function escapeCell(value: string | undefined | null): string {
  const raw = (value ?? '').replace(/\r?\n/g, ' ').trim()
  const safe = FORMULA_PREFIXES.some((prefix) => raw.startsWith(prefix))
    ? `'${raw}`
    : raw
  return /[",;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function row(cells: Array<string | undefined | null>): string {
  return cells.map(escapeCell).join(',')
}

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
  const lines = [COLUMNS.join(',')]

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
      lines.push(row([...sponsorCells, '', '', '', '', '', ...billingCells]))
      continue
    }

    for (const contact of contacts) {
      lines.push(
        row([
          ...sponsorCells,
          contact.name,
          contact.email,
          contact.phone,
          contact.role,
          contact.isPrimary ? 'Yes' : 'No',
          ...billingCells,
        ]),
      )
    }
  }

  // UTF-8 BOM: without it Excel mis-reads Norwegian characters in sponsor names.
  return `﻿${lines.join('\n')}\n`
}

/** Filename stem for the export, e.g. `sponsor-contacts-cloud-native-days-2026`. */
export function contactsCsvFilename(conferenceTitle: string): string {
  const slug = conferenceTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `sponsor-contacts${slug ? `-${slug}` : ''}.csv`
}
