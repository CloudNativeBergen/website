import { NextAuthRequest, auth } from '@/lib/auth'
import { setupEmailRoute } from '@/lib/email/route-helpers'
import { sendBroadcastEmail } from '@/lib/email/broadcast'
import { logBulkEmailSent } from '@/lib/sponsor-crm/activity'
import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'

export const POST = auth(async (req: NextAuthRequest) => {
  const startTime = Date.now()

  try {
    const { subject, message } = await req.json()

    const { context, error } = await setupEmailRoute(req, { subject, message })
    if (error) {
      console.warn('[SponsorBroadcast] Setup failed:', {
        status: error.status,
      })
      return error
    }

    const { conference } = context!

    const result = await sendBroadcastEmail({
      conference,
      subject: context!.subject,
      messagePortableText: context!.messagePortableText,
      audienceType: 'sponsors',
    })

    if (!result.ok) {
      const duration = Date.now() - startTime
      const errorData = await result.json()
      console.error('[SponsorBroadcast] Broadcast failed:', {
        status: result.status,
        error: errorData,
        durationMs: duration,
      })
      return result
    }

    // CRM Tracking Logic for Broadcast
    try {
      const userId = req.auth?.speaker?._id

      // Fetch all sponsor-for-conference relationships for this conference
      const sponsors = await clientRead.fetch<
        Array<{ _id: string; status: string }>
      >(
        `*[_type == "sponsorForConference" && conference._ref == $conferenceId]{_id, status}`,
        { conferenceId: conference._id },
      )

      if (sponsors.length > 0 && userId) {
        const sponsorIds = sponsors.map((s) => s._id)

        // 1. Log the broadcast for everyone
        await logBulkEmailSent(sponsorIds, context!.subject, userId)

        // 2. Transition 'prospect' to 'contacted'
        const prospectIds = sponsors
          .filter((s) => s.status === 'prospect')
          .map((s) => s._id)

        if (prospectIds.length > 0) {
          const transaction = clientWrite.transaction()
          for (const id of prospectIds) {
            transaction.patch(id, { set: { status: 'contacted' } })
            // We'll skip individual activity logs here to avoid blowing up the transaction size
            // and because the broadcast log is already there
          }
          await transaction.commit()
        }
      }
    } catch (crmError) {
      console.warn('[SponsorBroadcast] CRM tracking failed:', crmError)
    }

    return result
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('[SponsorBroadcast] Unexpected error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name,
      durationMs: duration,
    })
    return Response.json(
      {
        error: 'Internal server error during broadcast',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
})
