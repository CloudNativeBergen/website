import { NextAuthRequest, auth } from '@/lib/auth'
import {
  validateOrganizerAccess,
  validateRequiredFields,
  getEmailRouteConference,
  parsePortableTextMessage,
} from '@/lib/email/route-helpers'
import { sendIndividualEmail } from '@/lib/email/broadcast'
import { clientReadUncached } from '@/lib/sanity/client'

interface SponsorDiscountEmailRequest {
  sponsorId: string
  discountCode: string
  subject: string
  message: string
  ticketUrl: string
}

export const POST = auth(async (req: NextAuthRequest) => {
  const accessError = validateOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const {
      sponsorId,
      discountCode,
      subject,
      message,
      ticketUrl,
    }: SponsorDiscountEmailRequest = await req.json()

    const validationError = validateRequiredFields(
      { sponsorId, discountCode, subject, message, ticketUrl },
      ['sponsorId', 'discountCode', 'subject', 'message', 'ticketUrl'],
    )
    if (validationError) {
      return validationError
    }

    const { messagePortableText, error: parseError } =
      parsePortableTextMessage(message)
    if (parseError) {
      return parseError
    }

    const { conference, error: conferenceError } =
      await getEmailRouteConference()
    if (conferenceError) {
      return conferenceError
    }

    // Fetch contacts from the CRM record (sponsorForConference)
    const sfc = await clientReadUncached.fetch<{
      _id: string
      sponsor: { name: string }
      contact_persons?: Array<{
        _key: string
        name: string
        email: string
        phone?: string
        role?: string
      }>
    }>(
      `*[_type == "sponsorForConference" && sponsor._ref == $sponsorId && conference._ref == $conferenceId][0]{
        _id,
        sponsor->{ name },
        contact_persons[]{ _key, name, email, phone, role }
      }`,
      { sponsorId, conferenceId: conference!._id },
    )

    if (!sfc) {
      return Response.json(
        { error: 'Sponsor not found in this conference' },
        { status: 404 },
      )
    }

    const sponsorName = sfc.sponsor.name

    const ccEmails: string[] = []

    if (sfc.contact_persons) {
      sfc.contact_persons.forEach(
        (contact: {
          _key: string
          name: string
          email: string
          phone?: string
          role?: string
        }) => {
          if (contact.email && contact.email.trim().length > 0) {
            ccEmails.push(contact.email.trim())
          }
        },
      )
    }

    if (ccEmails.length === 0) {
      return Response.json(
        {
          error: `No valid contact person email addresses found for sponsor ${sponsorName}. Please add contact persons with valid email addresses in the sponsor CRM. Billing emails are not used for discount code distribution.`,
        },
        { status: 400 },
      )
    }

    const discountInfo = `
      <div style="background-color: #E0F2FE; padding: 20px; border-radius: 12px; margin: 24px 0; border: 1px solid #CBD5E1;">
        <h3 style="color: #1D4ED8; margin-top: 0; margin-bottom: 16px; font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; font-weight: 600;">
          Your Discount Code
        </h3>
        <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 15px; line-height: 1.6;">
          <li style="margin-bottom: 8px;"><strong>Discount Code:</strong> <code style="background-color: #F1F5F9; padding: 4px 8px; border-radius: 4px; font-family: Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;">${discountCode}</code></li>
          <li style="margin-bottom: 8px;"><strong>Ticket Registration:</strong> <a href="${ticketUrl}" style="color: #1D4ED8; text-decoration: none; font-weight: 500;">${ticketUrl}</a></li>
          <li style="margin-bottom: 0;"><strong>Instructions:</strong> Enter the discount code during checkout to receive your sponsor tickets</li>
        </ul>
      </div>
    `

    const primaryEmail = ccEmails[0]

    const ccList = ccEmails.slice(1)

    const emailResponse = await sendIndividualEmail({
      conference: conference!,
      subject,
      messagePortableText: messagePortableText!,
      primaryRecipient: primaryEmail,
      ccRecipients: ccList,
      additionalContent: discountInfo,
    })

    if (emailResponse.ok) {
      const responseData = await emailResponse.json()
      return Response.json({
        ...responseData,
        sponsorName,
        discountCode,
      })
    }

    return emailResponse
  } catch (error) {
    console.error('Sponsor discount email error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
