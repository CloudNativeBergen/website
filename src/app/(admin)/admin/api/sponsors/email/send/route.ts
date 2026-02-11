import { auth, NextAuthRequest } from '@/lib/auth'
import {
  setupEmailRoute,
  convertPortableTextToHTML,
  renderEmailTemplate,
  createEmailSuccessResponse,
  createEmailErrorResponse,
} from '@/lib/email/route-helpers'
import { resend, retryWithBackoff } from '@/lib/email/config'
import { logEmailSent, logStageChange } from '@/lib/sponsor-crm/activity'
import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'

export const POST = auth(async (req: NextAuthRequest) => {
  try {
    const body = await req.json()
    const { sponsorId } = body

    if (!sponsorId) {
      return createEmailErrorResponse('sponsorId is required', 400)
    }

    const { context, error } = await setupEmailRoute(req, body, {
      sponsors: true,
    })

    if (error) return error

    const { conference, messagePortableText, subject } = context!

    // Fetch contacts from the CRM record (sponsorForConference)
    const sfc = await clientRead.fetch<{
      _id: string
      status: string
      contactPersons?: Array<{ name: string; email: string }>
    }>(
      `*[_type == "sponsorForConference" && sponsor._ref == $sponsorId && conference._ref == $conferenceId][0]{
        _id,
        status,
        contactPersons[]{ name, email }
      }`,
      { sponsorId, conferenceId: conference._id },
    )

    if (!sfc) {
      return createEmailErrorResponse(
        'Sponsor not found in this conference',
        404,
      )
    }

    const contacts = sfc.contactPersons || []
    const recipients = contacts
      .filter((c) => c.email)
      .map((c) => ({ email: c.email, name: c.name }))

    if (recipients.length === 0) {
      return createEmailErrorResponse(
        'Sponsor has no contact persons with email addresses',
        400,
      )
    }

    const { htmlContent, error: htmlError } =
      await convertPortableTextToHTML(messagePortableText)
    if (htmlError) return htmlError

    const emailTemplate = renderEmailTemplate({
      conference,
      subject,
      htmlContent: htmlContent!,
    })

    if (!conference.sponsorEmail) {
      return createEmailErrorResponse(
        'Missing sponsorEmail in conference configuration',
        500,
      )
    }

    const result = await retryWithBackoff(async () => {
      return await resend.emails.send({
        from: `${conference.organizer || 'Cloud Native Days'} <${conference.sponsorEmail}>`,
        to: recipients.map((r) => r.email),
        subject,
        react: emailTemplate,
      })
    })

    if (result.error) {
      return createEmailErrorResponse(result.error.message, 500)
    }

    // CRM Tracking Logic
    try {
      const userId = req.auth?.speaker?._id

      if (sfc && userId) {
        try {
          await logEmailSent(sfc._id, subject, userId)
        } catch (logError) {
          console.error(
            '[SponsorIndividualEmail] Failed to log email activity:',
            logError,
          )
        }

        if (sfc.status === 'prospect') {
          try {
            await clientWrite
              .patch(sfc._id)
              .set({ status: 'contacted' })
              .commit()

            await logStageChange(sfc._id, 'prospect', 'contacted', userId)
          } catch (statusError) {
            console.error(
              '[SponsorIndividualEmail] Failed to update sponsor status:',
              statusError,
            )
          }
        }
      }
    } catch (crmError) {
      console.warn('[SponsorIndividualEmail] CRM tracking failed:', crmError)
    }

    return createEmailSuccessResponse({
      emailId: result.data?.id,
      recipientCount: recipients.length,
    })
  } catch (err) {
    console.error('[SponsorIndividualEmail] Unexpected error:', err)
    return createEmailErrorResponse(
      err instanceof Error ? err.message : 'Failed to send email',
      500,
    )
  }
})
