import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { clientReadUncached } from '@/lib/sanity/client'
import type { Conference } from '@/lib/conference/types'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { resolveTeamSlackChannel } from '@/lib/teams'
import { notifyOverdueInvoices } from '@/lib/slack/notify'
import { osloTodayDateString } from '@/lib/time'
import {
  buildOverdueInvoicesMessage,
  selectOverdueInvoices,
  type InvoiceRow,
} from '@/lib/sponsor/overdue-invoices'

/**
 * Daily Slack digest of overdue sponsor invoices, one message per conference
 * with a sales channel. Stateless: each invoice is listed on day 1 overdue and
 * every 7th day after (see `shouldRemind`), so nothing is written to Sanity.
 */
export async function GET(request: NextRequest) {
  noStore()
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set')
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const conferences = await clientReadUncached.fetch<Conference[]>(
      // groq-global: a system sweep over every tenant; each conference's
      // invoices are then read scoped to that conference.
      `*[_type == "conference" && defined(endDate) && endDate >= $cutoff]{
        ...,
        teams[]{ _key, key, title, slackChannel, emailIdentity, "members": members[]._ref }
      }`,
      {
        // Editions that ended over 90 days ago are left alone.
        cutoff: osloTodayDateString(new Date(Date.now() - 90 * 86_400_000)),
      },
      { cache: 'no-store' },
    )

    const today = osloTodayDateString()
    let posted = 0
    let failed = 0
    for (const conference of conferences ?? []) {
      if (
        !resolveTeamSlackChannel({
          conference,
          teamKey: 'sponsors',
          kind: 'sales',
        })
      )
        continue
      try {
        const rows = await clientReadUncached.fetch<InvoiceRow[]>(
          `*[_type == "sponsorForConference"
            && conference._ref == $conferenceId
            && invoiceStatus in ["sent", "overdue"]
            && !defined(invoicePaidAt)
            && defined(invoiceDueAt)
          ]{
            "sponsorName": sponsor->name,
            invoiceStatus, invoiceDueAt, invoicePaidAt,
            contractValue, contractCurrency,
            tier->{ price }
          }`,
          { conferenceId: conference._id },
          { cache: 'no-store' },
        )
        const overdue = selectOverdueInvoices(rows ?? [], today)
        if (overdue.length === 0) continue
        const ok = await notifyOverdueInvoices(
          buildOverdueInvoicesMessage(
            overdue,
            conference.title,
            conferenceBaseUrl(conference),
          ),
          conference,
        )
        if (ok) posted++
        else failed++
      } catch (error) {
        failed++
        console.error(`[overdue-invoices] ${conference.title}:`, error)
      }
    }

    return NextResponse.json({ success: true, posted, failed })
  } catch (error) {
    console.error('Overdue invoices cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
