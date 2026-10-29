import type { ActionItemType } from '@/components/admin/sponsor-crm/utils'
import type { ActionItem } from './action-items'
import { isInvoicePastDue } from './invoice'
import type { SponsorForConferenceExpanded, SponsorStatus } from './types'
import { calculateSponsorValue } from './value'

/** How many items "Needs you" lists; the board has the rest. */
export const NEEDS_YOU_LIMIT = 5

/** Converts an amount in `currency` to NOK. */
export type ToNOK = (amount: number, currency: string) => number

const ACTION_COUNT_LABELS: Record<ActionItemType, [string, string]> = {
  overdue: ['overdue invoice', 'overdue invoices'],
  'needs-invoice': ['invoice to send', 'invoices to send'],
  'needs-contract': ['contract needed', 'contracts needed'],
  'missing-contract': ['contract waiting', 'contracts waiting'],
  'awaiting-signature': ['awaiting signature', 'awaiting signature'],
  'registration-complete': ['contract to send', 'contracts to send'],
  'registration-pending': ['registration pending', 'registrations pending'],
  'signature-rejected': ['signature rejected', 'signatures rejected'],
  'signature-expired': ['signature expired', 'signatures expired'],
  'high-priority': ['urgent prospect', 'urgent prospects'],
  'follow-up': ['follow-up', 'follow-ups'],
  'missing-contact': ['missing contact', 'missing contacts'],
  stale: ['stale deal', 'stale deals'],
  unassigned: ['no owner', 'no owner'],
}

/**
 * One count per item type, in the order the most urgent item of each type
 * appears. Renewal reminders live on last year's board, so they are left out:
 * every count here matches what its board link shows.
 */
export function actionTypeCounts(
  items: ActionItem[],
): { type: ActionItemType; count: number; label: string }[] {
  const counts = new Map<ActionItemType, number>()
  for (const item of items) {
    if (item.id.endsWith('-renewal')) continue
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1)
  }
  return [...counts].map(([type, count]) => ({
    type,
    count,
    label: `${count} ${ACTION_COUNT_LABELS[type][count === 1 ? 0 : 1]}`,
  }))
}

/** The board's chip text for an `?action=` filter. */
export function actionFilterLabel(filter: string): string {
  if (filter === 'all') return 'Any open item'
  const labels = ACTION_COUNT_LABELS[filter as ActionItemType]
  return labels ? labels[1] : filter
}

export const PIPELINE_STAGES: { status: SponsorStatus; label: string }[] = [
  { status: 'prospect', label: 'Prospect' },
  { status: 'contacted', label: 'Contacted' },
  { status: 'negotiating', label: 'Negotiating' },
  { status: 'closed-won', label: 'Won' },
  { status: 'closed-lost', label: 'Lost' },
]

function valueNOK(s: SponsorForConferenceExpanded, toNOK: ToNOK): number {
  const { value, currency } = calculateSponsorValue(s)
  return value ? toNOK(value, currency) : 0
}

/** Count and NOK value per pipeline stage. */
export function pipelineStageTotals(
  sponsors: SponsorForConferenceExpanded[],
  toNOK: ToNOK,
) {
  return PIPELINE_STAGES.map(({ status, label }) => {
    const inStage = sponsors.filter((s) => s.status === status)
    return {
      status,
      label,
      count: inStage.length,
      value: inStage.reduce((sum, s) => sum + valueNOK(s, toNOK), 0),
    }
  })
}

export const MONEY_SEGMENTS = [
  { key: 'signed', label: 'Signed, not invoiced' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
] as const

export type MoneyKey = (typeof MONEY_SEGMENTS)[number]['key']

/**
 * Where the signed money stands, in NOK. Each deal lands in one bucket so the
 * bar stacks: overdue (marked, or sent and past due), paid, invoiced, or
 * signed with no invoice yet. Cancelled invoices and lost deals count nowhere.
 */
export function moneyTotals(
  sponsors: SponsorForConferenceExpanded[],
  toNOK: ToNOK,
  now: Date = new Date(),
): Record<MoneyKey, number> {
  const totals: Record<MoneyKey, number> = {
    signed: 0,
    invoiced: 0,
    paid: 0,
    overdue: 0,
  }
  for (const s of sponsors) {
    if (s.status === 'closed-lost') continue
    const key: MoneyKey | null =
      s.invoiceStatus === 'overdue' || isInvoicePastDue(s, now)
        ? 'overdue'
        : s.invoiceStatus === 'paid'
          ? 'paid'
          : s.invoiceStatus === 'sent'
            ? 'invoiced'
            : s.contractStatus === 'contract-signed' &&
                s.invoiceStatus !== 'cancelled'
              ? 'signed'
              : null
    if (key) totals[key] += valueNOK(s, toNOK)
  }
  return totals
}

/**
 * Tier capacity used: won deals in tiers with a set `maxQuantity`, against the
 * sum of those maxima. The fallback when the conference has no revenue goal.
 */
export function tierCapacity(
  sponsors: SponsorForConferenceExpanded[],
  tiers: { _id: string; maxQuantity?: number | null }[],
): { used: number; total: number } {
  const capped = new Map(
    tiers.filter((t) => t.maxQuantity).map((t) => [t._id, t.maxQuantity!]),
  )
  return {
    used: sponsors.filter(
      (s) => s.status === 'closed-won' && s.tier && capped.has(s.tier._id),
    ).length,
    total: [...capped.values()].reduce((a, b) => a + b, 0),
  }
}

/** The facts the sponsor rows of the event checklist read, from `crm.list`. */
export function sponsorLogoFacts(sponsors: SponsorForConferenceExpanded[]) {
  const won = sponsors.filter((s) => s.status === 'closed-won' && s.sponsor)
  return {
    sponsors: won.length,
    sponsorsWithoutLogo: won.filter(
      (s) => !s.sponsor.logo && !s.sponsor.logoBright,
    ).length,
  }
}
