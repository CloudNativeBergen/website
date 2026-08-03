import type { InvoiceRow } from './invoice'
import { csvDocument, csvFilename } from '@/lib/csv'
import { INVOICE_STATUS_LABELS } from './labels'
import { extractDateFromISO } from '@/lib/time'

/**
 * Column order follows how an invoice is actually keyed in: who to bill, what
 * it costs, how to deliver it, then the CRM's own tracking state at the end.
 */
const COLUMNS = [
  'Sponsor',
  'Org. number',
  'Address',
  'Amount ex VAT',
  'Currency',
  'Amount source',
  'Tier',
  'Add-ons',
  'Invoice format',
  'Billing email',
  'Reference / PO',
  'Billing comments',
  'Contract signed',
  'Invoice status',
  'Invoice sent',
  'Invoice paid',
  'Blockers',
] as const

/**
 * ISO timestamp → `YYYY-MM-DD`, the form a spreadsheet parses as a date.
 * Deliberately NOT a localised format: this column is read by an accounting
 * system, and "14. mars 2026" is not a date to anything but a human.
 */
function isoDate(value: string | undefined): string {
  return value ? extractDateFromISO(value) : ''
}

/**
 * The invoice underlag: one line per sponsor to bill, ready to work down or
 * import into an accounting system.
 *
 * Rows that are not ready are still exported, with their blockers spelled out
 * in the last column — an omitted row reads as "nothing to do here", which is
 * the opposite of the truth.
 */
export function buildInvoicesCsv(rows: InvoiceRow[]): string {
  return csvDocument(
    COLUMNS,
    rows.map((row) => [
      row.sponsorName,
      row.orgNumber,
      row.address,
      // Plain number: the importing system applies its own formatting, and a
      // thousands separator would be read as a column break.
      row.amount,
      row.currency,
      row.amountFromTier
        ? 'Tier price (no negotiated value)'
        : 'Contract value',
      row.tierTitle,
      row.addonTitles.join('; '),
      row.invoiceFormat ?? 'Not set',
      row.billingEmail,
      row.reference,
      row.comments,
      isoDate(row.contractSignedAt),
      INVOICE_STATUS_LABELS[row.invoiceStatus] ?? row.invoiceStatus,
      isoDate(row.invoiceSentAt),
      isoDate(row.invoicePaidAt),
      row.readiness.ready
        ? ''
        : row.readiness.blockers.map((blocker) => blocker.label).join('; '),
    ]),
  )
}

export function invoicesCsvFilename(conferenceTitle: string): string {
  return csvFilename('sponsor-invoices', conferenceTitle)
}
