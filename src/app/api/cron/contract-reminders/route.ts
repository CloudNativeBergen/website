import { NextRequest, NextResponse } from 'next/server'
import { clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import { resend, retryWithBackoff } from '@/lib/email/config'
import { platformFallbackContact } from '@/lib/email/from'
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
        signerName,
        "conferenceName": conference->title,
        "conferenceCity": conference->city,
        "conferenceStartDate": conference->startDate,
        "conferenceSponsorEmail": conference->sponsorEmail,
        "conferenceOrganizer": conference->organizer,
        "conferenceTheme": conference->theme,
        "organizationRef": conference->organization._ref
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
        if (!contract.signingUrl || !contract.signerEmail) {
          failed++
          console.warn(
            `Skipping reminder for ${contract.sponsorName} (${contract._id}): missing signingUrl or signerEmail`,
          )
          continue
        }

        const newCount = (contract.reminderCount || 0) + 1

        const eventName = contract.conferenceName || 'the conference'
        const fromEmail =
          contract.conferenceSponsorEmail || platformFallbackContact()
        const fromName = contract.conferenceOrganizer || eventName

        const { renderContractEmail, CONTRACT_EMAIL_SLUGS } =
          await import('@/lib/email/contract-email')

        const emailResult = await renderContractEmail(
          CONTRACT_EMAIL_SLUGS.REMINDER,
          {
            sponsorName: contract.sponsorName || 'Sponsor',
            signerName: contract.signerName,
            conference: {
              title: eventName,
              city: contract.conferenceCity,
              startDate: contract.conferenceStartDate,
              organizer: contract.conferenceOrganizer,
              sponsorEmail: contract.conferenceSponsorEmail,
              // The projection above used to stop at `organizer`, so this cron
              // could not brand its reminders even in principle.
              theme: contract.conferenceTheme,
            },
          },
          {
            button: {
              text: 'Review &amp; Sign Agreement',
              href: contract.signingUrl,
            },
          },
        )

        if (!emailResult) {
          console.error(
            `Contract email template not found for ${contract.sponsorName}`,
          )
          failed++
          continue
        }

        await retryWithBackoff(async () => {
          return resend.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to: [contract.signerEmail],
            subject: emailResult.subject,
            react: emailResult.react,
          })
        })

        await clientWrite
          .patch(contract._id)
          .set({ reminderCount: newCount })
          .commit()

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
          // Denormalized tenant key (CaaS T1-1), from the sfc's conference.
          ...(contract.organizationRef
            ? {
                organization: {
                  _type: 'reference',
                  _ref: contract.organizationRef,
                },
              }
            : {}),
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
