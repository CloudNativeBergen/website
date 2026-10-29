import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { clientWrite } from '@/lib/sanity/client'
import { alertSponsorOwner } from '@/lib/sponsor-crm/slack-alerts'
import { osloTodayDateString } from '@/lib/time'

/**
 * Daily Slack alert for sponsors whose follow-up date has passed (#1687 N1).
 * Once per follow-up date: the date is stamped into `followUpAlertedFor`
 * before the alert, on the revision this sweep read, so a rerun or an
 * overlapping sweep skips it. A new follow-up date alerts again. If Slack
 * fails, the stamp is removed again (on the revision the stamp wrote), so the
 * next sweep retries.
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
    const candidates = await clientWrite.fetch<
      Array<{ _id: string; _rev: string; nextFollowUpAt: string }>
    >(
      // groq-global: a system sweep over EVERY tenant's sponsors; the alert
      // resolves its tenant (channel, token, domain) off the sponsor's own
      // conference.
      `*[_type == "sponsorForConference"
        && status != "closed-lost"
        && dateTime(nextFollowUpAt) < dateTime(now())
        && nextFollowUpAt != followUpAlertedFor
      ]{ _id, _rev, nextFollowUpAt }`,
    )

    let alerted = 0
    let failed = 0
    for (const sfc of candidates ?? []) {
      let stampedRev: string
      try {
        stampedRev = (
          await clientWrite
            .patch(sfc._id)
            .ifRevisionId(sfc._rev)
            .set({ followUpAlertedFor: sfc.nextFollowUpAt })
            .commit()
        )._rev
      } catch {
        continue // changed since the read, or another sweep claimed it
      }
      const ok = await alertSponsorOwner(
        sfc._id,
        '📅 Follow-up date passed',
        `The follow-up planned for ${osloTodayDateString(new Date(sfc.nextFollowUpAt))} is due.`,
      )
      if (ok) {
        alerted++
        continue
      }
      failed++
      try {
        await clientWrite
          .patch(sfc._id)
          .ifRevisionId(stampedRev)
          .unset(['followUpAlertedFor'])
          .commit()
      } catch (error) {
        // Changed since the stamp: that edit decides what happens next.
        console.error(
          `[sponsor-follow-ups] could not clear the alert stamp on ${sfc._id}:`,
          error,
        )
      }
    }

    return NextResponse.json({ success: true, alerted, failed })
  } catch (error) {
    console.error('Sponsor follow-ups cron error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
