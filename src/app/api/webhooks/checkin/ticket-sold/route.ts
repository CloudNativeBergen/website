import { NextRequest, NextResponse } from 'next/server'
import { sendWorkshopSignupInstructions } from '@/lib/email/workshop'
import { getConferenceByCheckinEventId } from '@/lib/conference/sanity'
import { isWorkshopsEnabledForConference } from '@/lib/features/workshops'
import {
  getTicketingProvider,
  platformCheckinCredentials,
  type CheckinWebhookPayload,
} from '@/lib/tickets/provider'

const WORKSHOP_ELIGIBLE_CATEGORIES = [
  'Workshop + Conference (2 days)',
  'Sponsor discount (workshop upgrade)',
  'Speaker ticket',
]

export async function POST(request: NextRequest) {
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch (e) {
    console.error('Checkin webhook: Failed to read request body:', e)
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 },
    )
  }

  let payload: CheckinWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch (e) {
    console.error('Checkin webhook: Failed to parse JSON:', e)
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400 },
    )
  }

  try {
    // Webhook verification + payload shaping live behind the ticketing
    // provider; the route keeps the same ordering (verify → order-type gate →
    // tenant resolution → email fan-out) and HTTP responses as before.
    const provider = getTicketingProvider(
      'checkin',
      platformCheckinCredentials(),
    )

    const verification = provider.verifyWebhook(rawBody, request.headers)
    if (!verification.verified) {
      if (verification.reason === 'not-configured') {
        console.error('Checkin webhook: CHECKIN_WEBHOOK_SECRET not configured')
        return NextResponse.json(
          { success: false, error: 'Webhook secret not configured' },
          { status: 500 },
        )
      }
      console.error('Checkin webhook: Invalid signature')
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 },
      )
    }

    const orderData = provider.parseOrderCreated(payload)

    if (!orderData) {
      return NextResponse.json(
        { success: true, message: 'Event ignored' },
        { status: 200 },
      )
    }

    if (!orderData.users || orderData.users.length === 0) {
      return NextResponse.json(
        { success: true, message: 'No tickets in order' },
        { status: 200 },
      )
    }

    const { conference, error } = await getConferenceByCheckinEventId(
      orderData.eventId,
    )

    if (error || !conference) {
      console.error(
        'Checkin webhook: Conference not found for eventId:',
        orderData.eventId,
      )
      return NextResponse.json(
        { success: false, error: 'Conference not found' },
        { status: 404 },
      )
    }

    // FEATURE GATE (#689) — THE SAFETY-CRITICAL ONE. These instructions link an
    // attendee into the workshop portal. For any tenant the portal is not
    // enabled for, that link cannot work (the AuthKit round-trip is sealed to
    // the platform host), so the attendee would be emailed an infinite sign-in
    // loop, automatically, on every workshop ticket sale. Emailing a link that
    // cannot work is worse than silence: send NOTHING. Fail-closed — an
    // unresolvable organization suppresses the email too.
    if (!(await isWorkshopsEnabledForConference(conference))) {
      console.warn(
        'Checkin webhook: workshops not enabled for conference',
        conference._id,
        '— suppressing workshop signup instructions for',
        orderData.users.length,
        'ticket(s)',
      )
      return NextResponse.json(
        {
          success: true,
          message: `Processed ${orderData.users.length} ticket(s), sent 0 email(s) (workshops not enabled for this organization)`,
          results: [],
        },
        { status: 200 },
      )
    }

    const emailResults: Array<{
      email: string
      success: boolean
      emailId?: string
    }> = []

    for (const user of orderData.users) {
      if (!WORKSHOP_ELIGIBLE_CATEGORIES.includes(user.ticket.name)) {
        continue
      }

      const userName = `${user.crm.firstName} ${user.crm.lastName}`.trim()

      const emailResult = await sendWorkshopSignupInstructions({
        userEmail: user.crm.email.email,
        userName,
        conference,
        ticketCategory: user.ticket.name,
      })

      if (emailResult.error) {
        console.error(
          'Checkin webhook: Failed to send email to',
          user.crm.email.email,
          emailResult.error,
        )
        emailResults.push({
          email: user.crm.email.email,
          success: false,
        })
      } else {
        emailResults.push({
          email: user.crm.email.email,
          success: true,
          emailId: emailResult.data?.emailId,
        })
      }
    }

    const successCount = emailResults.filter((r) => r.success).length

    return NextResponse.json(
      {
        success: true,
        message: `Processed ${orderData.users.length} ticket(s), sent ${successCount} email(s)`,
        results: emailResults,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Checkin webhook error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}
