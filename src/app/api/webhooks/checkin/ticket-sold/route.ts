import { NextRequest, NextResponse } from 'next/server'
import { sendWorkshopSignupInstructions } from '@/lib/email/workshop'
import { getConferenceByCheckinEventId } from '@/lib/conference/sanity'
import crypto from 'crypto'

const WORKSHOP_ELIGIBLE_CATEGORIES = [
  'Workshop + Conference (2 days)',
  'Sponsor discount (workshop upgrade)',
  'Speaker ticket',
]

interface CheckinWebhookPayload {
  payloadId: string
  event: string
  dataType: string
  data: {
    id: number
    eventId: number
    users: Array<{
      id: number
      crm: {
        id: number
        firstName: string
        lastName: string
        email: {
          email: string
        }
      }
      ticket: {
        id: number
        name: string
        type: string
      }
      isPaid: boolean
    }>
    orderContact: {
      crm: {
        id: number
        firstName: string
        lastName: string
        email: {
          email: string
        }
      }
    }
  }
}

function verifyCheckinSignature(
  dataField: unknown,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) {
    return false
  }

  try {
    const dataString = JSON.stringify(dataField)
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(dataString)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )
  } catch (error) {
    console.error('Checkin webhook signature verification failed:', error)
    return false
  }
}

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
    const webhookSecret = process.env.CHECKIN_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('Checkin webhook: CHECKIN_WEBHOOK_SECRET not configured')
      return NextResponse.json(
        { success: false, error: 'Webhook secret not configured' },
        { status: 500 },
      )
    }

    const signature = request.headers.get('checkin-signature')
    const isValid = verifyCheckinSignature(
      payload.data,
      signature,
      webhookSecret,
    )

    if (!isValid) {
      console.error('Checkin webhook: Invalid signature')
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 },
      )
    }

    if (payload.event !== 'event-order-created') {
      return NextResponse.json(
        { success: true, message: 'Event ignored' },
        { status: 200 },
      )
    }

    const orderData = payload.data

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
