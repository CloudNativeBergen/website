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
