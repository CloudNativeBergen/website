import { auth, NextAuthRequest } from '@/lib/auth'
import {
  setupEmailRoute,
  convertPortableTextToHTML,
  renderEmailTemplate,
  createEmailSuccessResponse,
  createEmailErrorResponse,
} from '@/lib/email/route-helpers'
import { resend, retryWithBackoff } from '@/lib/email/config'
import { getSponsor } from '@/lib/sponsor/sanity'
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
      sponsorContact: true,
    })

    if (error) return error

    const { conference, messagePortableText, subject } = context!

    // Fetch sponsor contacts
    const { sponsor, error: sponsorError } = await getSponsor(sponsorId, true)
    if (sponsorError || !sponsor) {
      return createEmailErrorResponse(
        sponsorError?.message || 'Sponsor not found',
        404,
      )
    }

    const contacts = 'contact_persons' in sponsor ? sponsor.contact_persons : []
    const recipients = contacts
      ?.filter((c) => c.email)
      .map((c) => ({ email: c.email, name: c.name }))

    if (!recipients || recipients.length === 0) {
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

    if (!conference.sponsor_email) {
      return createEmailErrorResponse(
        'Missing sponsor_email in conference configuration',
        500,
      )
    }

    const result = await retryWithBackoff(async () => {
      return await resend.emails.send({
        from: `${conference.organizer || 'Cloud Native Days'} <${conference.sponsor_email}>`,
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

      // Find the sponsor-for-conference relationship
      const sfc = await clientRead.fetch<{ _id: string; status: string }>(
        `*[_type == "sponsorForConference" && sponsor._ref == $sponsorId && conference._ref == $conferenceId][0]{_id, status}`,
        { sponsorId, conferenceId: conference._id },
      )

      if (sfc && userId) {
        // 1. Log the interaction
        await logEmailSent(sfc._id, subject, userId)

        // 2. Automatically move to 'contacted' if currently in 'prospect'
        if (sfc.status === 'prospect') {
          await clientWrite.patch(sfc._id).set({ status: 'contacted' }).commit()

          await logStageChange(sfc._id, 'prospect', 'contacted', userId)
        }
      }
    } catch (crmError) {
      console.warn('[SponsorIndividualEmail] CRM tracking failed:', crmError)
      // We don't fail the request if tracking fails, as the email was already sent
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
