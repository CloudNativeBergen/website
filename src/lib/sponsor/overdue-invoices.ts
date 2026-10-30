import { escapeMrkdwn, type SlackMessage } from '@/lib/slack/client'
import { formatCurrency } from '@/lib/format'

export interface InvoiceRow {
  sponsorName: string | null
  invoiceStatus: string | null
  invoiceDueAt: string | null // YYYY-MM-DD
  invoicePaidAt: string | null
  contractValue: number | null
  contractCurrency: string | null
}

export interface OverdueInvoice {
  sponsorName: string
  amount: string
  daysOverdue: number
}

/**
 * Stateless cadence: remind on day 1 and then every 7th day overdue (7, 14,
 * 21, ...). A day the cron does not run skips that reminder.
 */
export function shouldRemind(daysOverdue: number): boolean {
  return daysOverdue === 1 || (daysOverdue > 0 && daysOverdue % 7 === 0)
}

/** Invoices overdue on `today` (Oslo date) that are due a reminder today. */
export function selectOverdueInvoices(
  rows: InvoiceRow[],
  today: string,
): OverdueInvoice[] {
  return rows.flatMap((row) => {
    if (row.invoiceStatus !== 'sent' && row.invoiceStatus !== 'overdue')
      return []
    if (row.invoicePaidAt || !row.invoiceDueAt) return []
    const daysOverdue = Math.round(
      (Date.parse(today) - Date.parse(row.invoiceDueAt)) / 86_400_000,
    )
    if (!shouldRemind(daysOverdue)) return []
    return [
      {
        sponsorName: row.sponsorName ?? 'Unknown sponsor',
        amount:
          row.contractValue == null
            ? 'amount not set'
            : formatCurrency(row.contractValue, row.contractCurrency ?? 'NOK'),
        daysOverdue,
      },
    ]
  })
}

export function buildOverdueInvoicesMessage(
  invoices: OverdueInvoice[],
  baseUrl: string,
): SlackMessage {
  const headline = `💸 ${invoices.length} overdue sponsor invoice${invoices.length === 1 ? '' : 's'}`
  const lines = invoices
    .map(
      (i) =>
        `• *${escapeMrkdwn(i.sponsorName)}*: ${i.amount}, ${i.daysOverdue} day${i.daysOverdue === 1 ? '' : 's'} overdue`,
    )
    .join('\n')
  return {
    text: headline,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: headline } },
      { type: 'section', text: { type: 'mrkdwn', text: lines } },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open invoices' },
            url: `${baseUrl}/admin/sponsors/invoices`,
            action_id: 'view_overdue_invoices',
          },
        ],
      },
    ],
  }
}
