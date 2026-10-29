import type { SponsorForConferenceExpanded, InvoiceStatus } from './types'
import { evaluateBilling, invoiceFormatLabel } from './billing'
import type { BillingGap } from './billing'
import { calculateSponsorValue } from './value'
import { osloTodayDateString } from '@/lib/time'

/**
 * A blocker that stops an invoice from being raised. Billing gaps
 * ({@link evaluateBilling}) plus the commercial preconditions that only matter
 * at invoicing time: an amount to bill and a signed contract to bill it under.
 */
export type InvoiceBlocker = BillingGap | AmountBlocker | ContractBlocker

interface AmountBlocker {
  field: 'contractValue'
  label: string
  message: string
}

interface ContractBlocker {
  field: 'contractStatus'
  label: string
  message: string
}

export interface InvoiceReadiness {
  /** Nothing blocks raising this invoice. */
  ready: boolean
  blockers: InvoiceBlocker[]
}

/**
 * Everything needed to raise one invoice, flattened into the shape a finance
 * person actually works in — no drawer-opening, no cross-referencing the
 * contacts page.
 */
export interface InvoiceRow {
  sponsorForConferenceId: string
  /** Legal entity being invoiced. */
  sponsorName: string
  orgNumber?: string
  address?: string
  /** Ex VAT, resolved through {@link calculateSponsorValue}. */
  amount: number
  currency: string
  /** True when the amount came from the tier rather than a negotiated value. */
  amountFromTier: boolean
  tierTitle?: string
  addonTitles: string[]
  billingEmail?: string
  /** Human label for the recorded format, or null when none is recorded. */
  invoiceFormat: string | null
  reference?: string
  comments?: string
  contractSignedAt?: string
  invoiceStatus: InvoiceStatus
  invoiceSentAt?: string
  invoiceDueAt?: string
  invoicePaidAt?: string
  readiness: InvoiceReadiness
}

/**
 * Whether this deal can be invoiced exactly as recorded.
 *
 * Deliberately stricter than the `invoice` axis of the state machine, which
 * guards the *write* path and only sees a billing email. This is the read-side
 * view a human works from, so it also reports the EHF organisation-number gap
 * and a missing amount — problems that otherwise surface only once someone is
 * already typing into the accounting system.
 */
export function evaluateInvoiceReadiness(
  sfc: SponsorForConferenceExpanded,
): InvoiceReadiness {
  const blockers: InvoiceBlocker[] = [...evaluateBilling(sfc).gaps]

  const { value } = calculateSponsorValue(sfc)
  if (value <= 0) {
    blockers.push({
      field: 'contractValue',
      label: 'Amount',
      message:
        'No contract value and no priced tier — there is no amount to invoice.',
    })
  }

  if (sfc.contractStatus !== 'contract-signed') {
    blockers.push({
      field: 'contractStatus',
      label: 'Signed contract',
      message:
        'The contract is not signed yet — invoicing before signature is not supported.',
    })
  }

  return { ready: blockers.length === 0, blockers }
}

/** Flattens a CRM record into the row the invoice worklist and export use. */
export function toInvoiceRow(sfc: SponsorForConferenceExpanded): InvoiceRow {
  const { value, currency } = calculateSponsorValue(sfc)

  return {
    sponsorForConferenceId: sfc._id,
    sponsorName: sfc.sponsor.name,
    orgNumber: sfc.sponsor.orgNumber,
    address: sfc.sponsor.address,
    amount: value,
    currency,
    amountFromTier: !sfc.contractValue && value > 0,
    tierTitle: sfc.tier?.title,
    addonTitles: (sfc.addons ?? []).map((addon) => addon.title),
    billingEmail: sfc.billing?.email,
    invoiceFormat: invoiceFormatLabel(sfc.billing?.invoiceFormat),
    reference: sfc.billing?.reference,
    comments: sfc.billing?.comments,
    contractSignedAt: sfc.contractSignedAt,
    invoiceStatus: sfc.invoiceStatus,
    invoiceSentAt: sfc.invoiceSentAt,
    invoiceDueAt: sfc.invoiceDueAt,
    invoicePaidAt: sfc.invoicePaidAt,
    readiness: evaluateInvoiceReadiness(sfc),
  }
}

/** Totals per currency. Amounts in different currencies are never summed. */
export function totalsByCurrency(
  rows: InvoiceRow[],
): Array<{ currency: string; amount: number; count: number }> {
  const buckets = new Map<string, { amount: number; count: number }>()

  for (const row of rows) {
    const bucket = buckets.get(row.currency) ?? { amount: 0, count: 0 }
    bucket.amount += row.amount
    bucket.count += 1
    buckets.set(row.currency, bucket)
  }

  return [...buckets.entries()]
    .map(([currency, bucket]) => ({ currency, ...bucket }))
    .sort((a, b) =>
      a.currency === 'NOK'
        ? -1
        : b.currency === 'NOK'
          ? 1
          : a.currency.localeCompare(b.currency),
    )
}

/** Days between sending an invoice and its default due date. */
export const INVOICE_PAYMENT_TERMS_DAYS = 30

/**
 * Default due date (YYYY-MM-DD) for an invoice sent at `now`: the Oslo
 * calendar day plus the payment terms. Calendar arithmetic, so DST shifts
 * never move the day.
 */
export function defaultInvoiceDueDate(now: Date = new Date()): string {
  const due = new Date(`${osloTodayDateString(now)}T00:00:00Z`)
  due.setUTCDate(due.getUTCDate() + INVOICE_PAYMENT_TERMS_DAYS)
  return due.toISOString().slice(0, 10)
}

/** True when a sent invoice's due date is before today's Oslo date. */
export function isInvoicePastDue(
  sfc: { invoiceStatus?: string; invoiceDueAt?: string | null },
  now: Date = new Date(),
): boolean {
  return (
    sfc.invoiceStatus === 'sent' &&
    !!sfc.invoiceDueAt &&
    sfc.invoiceDueAt < osloTodayDateString(now)
  )
}
