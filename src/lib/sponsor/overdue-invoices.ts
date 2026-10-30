import { escapeMrkdwn, type SlackMessage } from '@/lib/slack/client'
import { formatCurrency } from '@/lib/format'
import {
  calculateSponsorValue,
  type SponsorValueFields,
} from '@/lib/sponsor-crm/value'

export interface InvoiceRow extends SponsorValueFields {
  sponsorName: string | null
  invoiceStatus: string | null
  invoiceDueAt: string | null // YYYY-MM-DD
  invoicePaidAt: string | null
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
        amount: formatAmount(row),
        daysOverdue,
      },
    ]
  })
}

/** Same value as the invoice page (contract value, else tier price). */
function formatAmount(row: InvoiceRow): string {
  const { value, currency } = calculateSponsorValue(row)
  if (!value) return 'amount not set'
  return formatCurrency(value, currency)
}

/** Slack rejects a section text over 3000 characters. */
const SECTION_LIMIT = 3000

function chunkLines(lines: string[]): string[] {
  const chunks: string[] = []
  for (const line of lines) {
    const last = chunks.length - 1
    if (last >= 0 && chunks[last].length + 1 + line.length <= SECTION_LIMIT)
      chunks[last] += `\n${line}`
    else chunks.push(line.slice(0, SECTION_LIMIT))
  }
  return chunks
}

export function buildOverdueInvoicesMessage(
  invoices: OverdueInvoice[],
  conferenceTitle: string,
  baseUrl: string,
): SlackMessage {
  const headline = `💸 ${conferenceTitle}: ${invoices.length} overdue sponsor invoice${invoices.length === 1 ? '' : 's'}`
  const lines = invoices.map(
    (i) =>
      `• *${escapeMrkdwn(i.sponsorName)}*: ${escapeMrkdwn(i.amount)}, ${i.daysOverdue} day${i.daysOverdue === 1 ? '' : 's'} overdue`,
  )
  return {
    text: headline,
    blocks: [
      // Slack caps header text at 150 characters.
      {
        type: 'header',
        text: { type: 'plain_text', text: headline.slice(0, 150) },
      },
      ...chunkLines(lines).map((text) => ({
        type: 'section',
        text: { type: 'mrkdwn', text },
      })),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '_Mark paid or cancelled to stop these reminders._',
        },
      },
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
