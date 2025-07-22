import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import assert from 'assert'
import { auth } from '@/lib/auth'
import { getProposal } from '@/lib/proposal/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { SingleSpeakerEmailTemplate } from '@/components/email'

assert(process.env.RESEND_API_KEY, 'RESEND_API_KEY is not set')
assert(process.env.RESEND_FROM_EMAIL, 'RESEND_FROM_EMAIL is not set')

const resend = new Resend(process.env.RESEND_API_KEY as string)
const fromEmail = process.env.RESEND_FROM_EMAIL as string

interface EmailSpeakerRequest {
  proposalId: string
  speakerId: string
  subject: string
  message: string
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()

    // Check if user is authenticated and is an organizer
    if (!session?.speaker?.is_organizer) {
      return NextResponse.json(
        { error: 'Unauthorized. Only organizers can send emails to speakers.' },
        { status: 401 }
      )
    }

    const { proposalId, speakerId, subject, message }: EmailSpeakerRequest =
      await req.json()

    if (!proposalId || !speakerId || !subject || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: proposalId, speakerId, subject, message' },
        { status: 400 }
      )
    }

    // Get the conference details
    const { conference } = await getConferenceForCurrentDomain({})

    if (!conference) {
      return NextResponse.json(
        { error: 'Conference not found' },
        { status: 404 }
      )
    }

    // Get the proposal details
    const { proposal, proposalError } = await getProposal({
      id: proposalId,
      speakerId: '', // For organizer view, we don't need to filter by speaker
      isOrganizer: true,
      includeReviews: false,
      includePreviousAcceptedTalks: false,
      includeSubmittedTalks: false,
    })

    if (proposalError) {
      return NextResponse.json(
        { error: `Failed to fetch proposal: ${proposalError.message}` },
        { status: 500 }
      )
    }

    if (!proposal) {
      return NextResponse.json(
        { error: 'Proposal not found' },
        { status: 404 }
      )
    }

    // Find the speaker in the proposal
    const speakers = Array.isArray(proposal.speakers) 
      ? proposal.speakers.filter(speaker => typeof speaker === 'object' && speaker && '_id' in speaker)
      : []
    
    const speaker = speakers.find((s: { _id: string; email?: string; name: string }) => s._id === speakerId)
    
    if (!speaker || !speaker.email) {
      return NextResponse.json(
        { error: 'Speaker not found or speaker has no email' },
        { status: 404 }
      )
    }

    // Create the proposal URL
    const proposalUrl = `${conference.domains[0]}/cfp/admin/proposals/${proposalId}`

    // Create the email template
    const emailTemplate = SingleSpeakerEmailTemplate({
      speakerName: speaker.name,
      proposalTitle: proposal.title,
      proposalUrl: proposalUrl,
      eventName: conference.title,
      eventLocation: `${conference.city}, ${conference.country}`,
      eventDate: conference.start_date || '',
      eventUrl: `https://${conference.domains[0]}`,
      subject: subject,
      message: message,
      senderName: session.speaker.name || 'Conference Organizer',
      socialLinks: conference.social_links || [],
    })

    // Send the email
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [speaker.email],
      subject: subject,
      react: emailTemplate,
    })

    if (error) {
      console.error('Failed to send email:', error)
      return NextResponse.json(
        { error: `Failed to send email: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: 'Email sent successfully',
        emailId: data?.id,
        recipient: speaker.email,
        proposalTitle: proposal.title,
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Error sending speaker email:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}