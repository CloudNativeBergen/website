import type { SponsorStatus } from './types'

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
