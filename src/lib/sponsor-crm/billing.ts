import type { InvoiceFormat } from '@/lib/sponsor/types'
import type { SponsorForConferenceExpanded } from './types'

/**
 * Display labels for the two stored invoice formats. Deliberately keyed on the
 * stored values only — there is no entry for "unset", because an absent format
 * is a gap to surface, never a value to guess (see {@link invoiceFormatLabel}).
 */
export const INVOICE_FORMAT_LABELS: Record<InvoiceFormat, string> = {
  ehf: 'EHF (digital invoice)',
  pdf: 'PDF via email',
}

/**
 * Label for a stored invoice format, or `null` when none is recorded.
 *
 * Callers must render the null case as a gap ("Invoice format not set") rather
 * than falling back to a format. The Sanity schema defaults new records to
 * `pdf`, but records created before that default — and any written through the
 * API without the field — carry no format at all, and telling an organizer we
 * will send a PDF when nothing was ever chosen is a guess dressed as a fact.
 */
export function invoiceFormatLabel(
  format: InvoiceFormat | null | undefined,
): string | null {
  return format ? INVOICE_FORMAT_LABELS[format] : null
}

/** A single missing piece of billing information. */
export interface BillingGap {
  /** Stable identifier, matching the underlying document path. */
  field: 'billing' | 'billing.email' | 'billing.invoiceFormat' | 'orgNumber'
  /** Short label for chips and lists. */
  label: string
  /** Actionable sentence explaining why it blocks invoicing. */
  message: string
}

export interface BillingReadiness {
  /** Whether any billing object is stored at all. */
  hasBilling: boolean
  /** True when nothing is missing — the sponsor can be invoiced as recorded. */
  complete: boolean
  gaps: BillingGap[]
}

/**
 * Evaluates whether a sponsor's billing details are complete enough to actually
 * send an invoice.
 *
 * The rules follow the delivery mechanics, not just field presence:
 *
 * - A billing email is required for **both** formats — it is the delivery
 *   address for PDF and the documented fallback when EHF delivery fails.
 * - EHF is addressed by organisation number, so an EHF sponsor without
 *   `sponsor.orgNumber` cannot be invoiced digitally even though its billing
 *   object looks filled in. `contract-readiness` treats the same field as
 *   required for contracts; this is the invoicing-side counterpart.
 */
export function evaluateBilling(
  sfc: Pick<SponsorForConferenceExpanded, 'billing' | 'sponsor'>,
): BillingReadiness {
  const billing = sfc.billing

  if (!billing) {
    return {
      hasBilling: false,
      complete: false,
      gaps: [
        {
          field: 'billing',
          label: 'Billing details',
          message:
            'No billing details recorded — this sponsor cannot be invoiced.',
        },
      ],
    }
  }

  const gaps: BillingGap[] = []

  if (!billing.email?.trim()) {
    gaps.push({
      field: 'billing.email',
      label: 'Billing email',
      message:
        'No billing email — required to deliver a PDF invoice, and as the fallback if EHF delivery fails.',
    })
  }

  if (!billing.invoiceFormat) {
    gaps.push({
      field: 'billing.invoiceFormat',
      label: 'Invoice format',
      message:
        'No invoice format chosen — pick EHF or PDF so the invoice is sent the way the sponsor expects.',
    })
  }

  if (billing.invoiceFormat === 'ehf' && !sfc.sponsor?.orgNumber?.trim()) {
    gaps.push({
      field: 'orgNumber',
      label: 'Organisation number',
      message:
        'EHF invoices are addressed by organisation number, but none is recorded for this company.',
    })
  }

  return { hasBilling: true, complete: gaps.length === 0, gaps }
}

/** Convenience predicate for filtering — see {@link evaluateBilling}. */
export function isBillingComplete(
  sfc: Pick<SponsorForConferenceExpanded, 'billing' | 'sponsor'>,
): boolean {
  return evaluateBilling(sfc).complete
}
