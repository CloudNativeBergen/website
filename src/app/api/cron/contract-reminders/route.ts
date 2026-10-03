import { NextRequest, NextResponse } from 'next/server'
import { clientWrite } from '@/lib/sanity/client'
import { sendContractReminderBySystem } from '@/lib/sponsor-crm/contract-communication'
import { unstable_noStore as noStore } from 'next/cache'

const MAX_REMINDERS = 2
const REMINDER_THRESHOLD_DAYS = 5

/**
 * Signing reminders for contracts that have sat unsigned for a while — the
 * SAME send an organizer's "Send reminder" performs (#1264), with a system
 * actor, so every reminder is a full record on the sponsor's timeline:
 * recipient, body as sent, template and provider id.
 */
export async function GET(request: NextRequest) {
  noStore()
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      )
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('Invalid or missing authorization token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Pending signatures, sent more than N days ago, under the reminder limit.
    const thresholdDate = new Date(
      Date.now() - REMINDER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()

    const pendingContracts = await clientWrite.fetch<
      Array<{ _id: string; sponsorName: string | null }>
    >(
      // groq-global: a system sweep over EVERY tenant's pending contracts;
      // each send then resolves its tenant off the sponsor's own conference.
      `*[_type == "sponsorForConference"
        && signatureStatus == "pending"
        && defined(signatureId)
        && contractSentAt < $threshold
        && (reminderCount == null || reminderCount < $maxReminders)
      ]{ _id, "sponsorName": sponsor->name }`,
      { threshold: thresholdDate, maxReminders: MAX_REMINDERS },
    )

    if (!pendingContracts || pendingContracts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending contracts need reminders',
        sent: 0,
      })
    }

    let sent = 0
    let failed = 0

    for (const contract of pendingContracts) {
      try {
        const outcome = await sendContractReminderBySystem(contract._id)
        if (outcome.ok) {
          sent++
          console.log(
            `Sent signing reminder to ${outcome.recipient} for ${contract.sponsorName} (${contract._id})`,
          )
        } else {
          failed++
          console.warn(
            `Skipped reminder for ${contract.sponsorName} (${contract._id}): ${outcome.reason}${outcome.message ? ` — ${outcome.message}` : ''}`,
          )
        }
      } catch (error) {
        failed++
        console.error(
          `Failed to send reminder for ${contract.sponsorName} (${contract._id}):`,
          error,
        )
      }
    }

    return NextResponse.json({
      success: true,
      total: pendingContracts.length,
      sent,
      failed,
    })
  } catch (error) {
    console.error('Contract reminders cron error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
