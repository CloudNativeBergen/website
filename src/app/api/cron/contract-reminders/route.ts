import { NextRequest, NextResponse } from 'next/server'
import { clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import { sendReminder } from '@/lib/adobe-sign'
import { unstable_noStore as noStore } from 'next/cache'

const MAX_REMINDERS = 2
const REMINDER_THRESHOLD_DAYS = 5

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

    // Find sponsors with pending signatures, sent more than N days ago, under reminder limit
    const thresholdDate = new Date(
      Date.now() - REMINDER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()

    const pendingContracts = await clientWrite.fetch(
      `*[_type == "sponsorForConference"
        && signatureStatus == "pending"
        && defined(signatureId)
        && contractSentAt < $threshold
        && (reminderCount == null || reminderCount < $maxReminders)
      ]{
        _id,
        signatureId,
        reminderCount,
        "sponsorName": sponsor->name
      }`,
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
        await sendReminder(contract.signatureId)

        const newCount = (contract.reminderCount || 0) + 1
        await clientWrite
          .patch(contract._id)
          .set({ reminderCount: newCount })
          .commit()

        // Log reminder activity
        await clientWrite.create({
          _type: 'sponsorActivity',
          sponsorForConference: { _type: 'reference', _ref: contract._id },
          activityType: 'contract_reminder_sent',
          description: `Signing reminder #${newCount} sent via Adobe Sign for ${contract.sponsorName || 'sponsor'}`,
          metadata: {
            additionalData: `reminder_count:${newCount}`,
            timestamp: getCurrentDateTime(),
          },
          createdBy: { _type: 'reference', _ref: 'system' },
          createdAt: getCurrentDateTime(),
        })

        sent++
        console.log(
          `Sent reminder ${newCount} for ${contract.sponsorName} (${contract._id})`,
        )
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
