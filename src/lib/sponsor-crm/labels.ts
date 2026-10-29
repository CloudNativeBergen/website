import type { SponsorStatus, InvoiceStatus } from './types'

/**
 * Canonical short labels for the pipeline stages, matching the sponsor board's
 * column names. Lives in `lib` so non-React callers (CSV export, emails) share
 * the exact wording the UI uses — `components/admin/sponsor-crm/form/constants`
 * builds its icon-bearing option list on top of these.
 */
export const SPONSOR_STATUS_LABELS: Record<SponsorStatus, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  negotiating: 'Negotiating',
  'closed-won': 'Won',
  'closed-lost': 'Lost',
}

/** The stage a sponsor reaches once the deal is accepted. */
export const ACCEPTED_SPONSOR_STATUS: SponsorStatus = 'closed-won'

/** Canonical labels for the invoice axis, shared by the board and the export. */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  'not-sent': 'Not Sent',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

/**
 * One name per sponsor admin page (#1704 C2), used by the admin nav and the
 * command palette registry, the sponsors overview cards, the page headers and
 * `<title>`. Keyed by URL segment; the URLs themselves never change.
 */
export const SPONSOR_PAGE_TITLES = {
  crm: 'Sponsor Pipeline',
  contacts: 'Sponsor Contacts',
  invoices: 'Sponsor Invoices',
  contracts: 'Contract Templates',
  activity: 'Sponsor Activity',
  tiers: 'Sponsor Tiers',
  templates: 'Sponsor Email Templates',
} as const
