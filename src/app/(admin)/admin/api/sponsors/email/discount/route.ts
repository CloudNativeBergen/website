import { NextAuthRequest, auth } from '@/lib/auth'
import {
  validateOrganizerAccess,
  validateRequiredFields,
  getEmailRouteConference,
  parsePortableTextMessage,
} from '@/lib/email/route-helpers'
import { sendIndividualEmail } from '@/lib/email/broadcast'
import { clientReadUncached } from '@/lib/sanity/client'

export const dynamic = 'force-dynamic'

interface SponsorDiscountEmailRequest {
  sponsorId: string
  discountCode: string
  subject: string
  message: string // JSON string of PortableText blocks
  ticketUrl: string
}

export const POST = auth(async (req: NextAuthRequest) => {
  // Check organizer access
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

    // Validate required fields
    const validationError = validateRequiredFields(
      { sponsorId, discountCode, subject, message, ticketUrl },
      ['sponsorId', 'discountCode', 'subject', 'message', 'ticketUrl'],
    )
    if (validationError) {
      return validationError
    }

    // Parse PortableText message
    const { messagePortableText, error: parseError } =
      parsePortableTextMessage(message)
    if (parseError) {
      return parseError
    }

    // Get conference
    const { conference, error: conferenceError } =
      await getEmailRouteConference()
    if (conferenceError) {
      return conferenceError
    }

    // Fetch sponsor data
    const sponsor = await clientReadUncached.fetch<{
      _id: string
      name: string
      website: string
      contact_persons?: Array<{
        _key: string
        name: string
        email: string
        phone?: string
        role?: string
      }>
      billing?: {
        email: string
        reference?: string
        comments?: string
      }
    }>(
      `*[_type == "sponsor" && _id == $sponsorId][0]{
        _id,
        name,
        website,
        contact_persons,
        billing
      }`,
      { sponsorId },
    )

    if (!sponsor) {
      return Response.json({ error: 'Sponsor not found' }, { status: 404 })
    }

    // Collect all contact emails
    const ccEmails: string[] = []

    if (sponsor.contact_persons) {
      sponsor.contact_persons.forEach(
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

    // Add billing email if different from contact persons
    if (sponsor.billing?.email && sponsor.billing.email.trim().length > 0) {
      const billingEmail = sponsor.billing.email.trim()
      if (!ccEmails.includes(billingEmail)) {
        ccEmails.push(billingEmail)
      }
    }

    if (ccEmails.length === 0) {
      const hasContactPersons =
        sponsor.contact_persons && sponsor.contact_persons.length > 0
      const hasBillingInfo = sponsor.billing && sponsor.billing.email

      let errorDetails = ''
      if (!hasContactPersons && !hasBillingInfo) {
        errorDetails = 'No contact persons or billing information found.'
      } else if (hasContactPersons && !hasBillingInfo) {
        errorDetails =
          'Contact persons exist but have no valid email addresses.'
      } else if (!hasContactPersons && hasBillingInfo) {
        errorDetails =
          'Billing information exists but has no valid email address.'
      } else {
        errorDetails =
          'Contact persons and billing information exist but have no valid email addresses.'
      }

      return Response.json(
        {
          error: `No valid email addresses found for sponsor ${sponsor.name}. ${errorDetails} Please update the sponsor contact information in the sponsor settings.`,
        },
        { status: 400 },
      )
    }

    // Create discount code information section
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

    // Use the first contact email as primary recipient
    const primaryEmail = ccEmails[0]
    // Use remaining emails as CC
    const ccList = ccEmails.slice(1)

    // Send individual email with CC support
    const emailResponse = await sendIndividualEmail({
      conference: conference!,
      subject,
      messagePortableText: messagePortableText!,
      primaryRecipient: primaryEmail,
      ccRecipients: ccList,
      additionalContent: discountInfo,
    })

    // If successful, add sponsor-specific data to response
    if (emailResponse.ok) {
      const responseData = await emailResponse.json()
      return Response.json({
        ...responseData,
        sponsorName: sponsor.name,
        discountCode,
      })
    }

    return emailResponse
  } catch (error) {
    console.error('Sponsor discount email error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
