import { NextRequest, NextResponse } from 'next/server'
import { clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime, formatConferenceDateLong } from '@/lib/time'
import { resend, retryWithBackoff } from '@/lib/email/config'
import { ContractReminderTemplate } from '@/components/email/ContractReminderTemplate'
import * as React from 'react'
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
        signingUrl,
        signerEmail,
        reminderCount,
        "sponsorName": sponsor->name,
        "conferenceName": conference->title,
        "conferenceCity": conference->city,
        "conferenceStartDate": conference->startDate,
        "conferenceSponsorEmail": conference->sponsorEmail,
        "conferenceOrganizer": conference->organizer
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
        const newCount = (contract.reminderCount || 0) + 1

        // Send reminder email via Resend if we have a signing URL and signer email
        if (contract.signingUrl && contract.signerEmail) {
          const fromEmail =
            contract.conferenceSponsorEmail || 'sponsors@cloudnativeday.no'
          const fromName = contract.conferenceOrganizer || 'Cloud Native Days'
          const eventName = contract.conferenceName || 'Cloud Native Day'

          await retryWithBackoff(async () => {
            return resend.emails.send({
              from: `${fromName} <${fromEmail}>`,
              to: [contract.signerEmail],
              subject: `Reminder: Sponsorship Agreement — ${eventName}`,
              react: React.createElement(ContractReminderTemplate, {
                sponsorName: contract.sponsorName || 'Sponsor',
                signingUrl: contract.signingUrl,
                reminderNumber: newCount,
                eventName,
                eventLocation: contract.conferenceCity || 'Norway',
                eventDate: contract.conferenceStartDate
                  ? formatConferenceDateLong(contract.conferenceStartDate)
                  : '',
                eventUrl: 'https://cloudnativeday.no',
              }),
            })
          })
        } else {
          console.warn(
            `Skipping email for ${contract.sponsorName} (${contract._id}): missing signingUrl or signerEmail`,
          )
        }

        await clientWrite
          .patch(contract._id)
          .set({ reminderCount: newCount })
          .commit()

        // Log reminder activity
        await clientWrite.create({
          _type: 'sponsorActivity',
          sponsorForConference: { _type: 'reference', _ref: contract._id },
          activityType: 'contract_reminder_sent',
          description: `Signing reminder #${newCount} sent via email for ${contract.sponsorName || 'sponsor'}`,
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
