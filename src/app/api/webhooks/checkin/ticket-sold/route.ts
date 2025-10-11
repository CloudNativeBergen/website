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
  data: {
    id: number
    order_id?: number
    category?: string
    crm?: {
      first_name: string
      last_name: string
      email: string
    }
    event_id?: number
    customer_id?: number
  }
}

function verifyCheckinSignature(
  dataField: unknown,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    console.error('No signature header found')
    return false
  }

  try {
    const dataString = JSON.stringify(dataField)
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(dataString)
      .digest('hex')

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )

    console.log('Signature verification:', {
      provided: signature.substring(0, 10) + '...',
      expected: expectedSignature.substring(0, 10) + '...',
      isValid,
    })

    return isValid
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload: CheckinWebhookPayload = await request.json()

    console.log('=== CHECKIN WEBHOOK RECEIVED ===')
    console.log('Timestamp:', new Date().toISOString())
    console.log('Payload ID:', payload.payloadId)
    console.log('Event:', payload.event)
    console.log('Raw Payload:', JSON.stringify(payload, null, 2))
    console.log('Headers:', JSON.stringify(Object.fromEntries(request.headers.entries()), null, 2))
    console.log('================================')

    const webhookSecret = process.env.CHECKIN_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('CHECKIN_WEBHOOK_SECRET not configured')
      return NextResponse.json(
        { success: false, error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    const signature = request.headers.get('x-checkin-signature') || request.headers.get('signature')

    const isValid = verifyCheckinSignature(payload.data, signature, webhookSecret)

    if (!isValid) {
      console.error('Invalid webhook signature')
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 }
      )
    }

    console.log('✓ Signature verified')

    if (payload.event !== 'EventTicket.Created' && payload.event !== 'EventTicket.Updated') {
      console.log('Event type not EventTicket, ignoring:', payload.event)
      return NextResponse.json(
        { success: true, message: 'Event ignored' },
        { status: 200 }
      )
    }

    const ticketData = payload.data

    if (!ticketData.category || !ticketData.crm || !ticketData.event_id) {
      console.log('Missing required ticket data')
      return NextResponse.json(
        { success: true, message: 'Incomplete ticket data' },
        { status: 200 }
      )
    }

    console.log('Processing ticket:', {
      category: ticketData.category,
      email: ticketData.crm.email,
      event_id: ticketData.event_id,
    })

    if (!WORKSHOP_ELIGIBLE_CATEGORIES.includes(ticketData.category)) {
      console.log('Non-workshop ticket category:', ticketData.category)
      return NextResponse.json(
        { success: true, message: 'Non-workshop ticket, no email sent' },
        { status: 200 }
      )
    }

    const { conference, error } = await getConferenceByCheckinEventId(ticketData.event_id)

    if (error || !conference) {
      console.error('Conference not found for event_id:', ticketData.event_id, 'Error:', error)
      return NextResponse.json(
        { success: false, error: 'Conference not found' },
        { status: 404 }
      )
    }

    console.log('Found conference:', conference.title)

    const userName = `${ticketData.crm.first_name} ${ticketData.crm.last_name}`.trim() || ticketData.crm.email

    console.log('Sending workshop signup email to:', ticketData.crm.email)

    const emailResult = await sendWorkshopSignupInstructions({
      userEmail: ticketData.crm.email,
      userName,
      conference,
      ticketCategory: ticketData.category,
    })

    if (emailResult.error) {
      console.error('Failed to send workshop signup email:', emailResult.error)
      return NextResponse.json(
        { success: false, error: 'Failed to send email' },
        { status: 500 }
      )
    }

    console.log('Email sent successfully. Email ID:', emailResult.data?.emailId)

    return NextResponse.json(
      {
        success: true,
        message: 'Workshop signup instructions sent',
        emailId: emailResult.data?.emailId,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('=== WEBHOOK ERROR ===')
    console.error('Error:', error)
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('====================')
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
