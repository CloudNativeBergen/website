import { ProposalInput, Format, CoSpeakerInvitationStatus } from '@/lib/proposal/types'
import {
  convertJsonToProposal,
  validateProposal,
  isValidEmail,
  normalizeEmail,
} from '@/lib/proposal/validation'
import { NextAuthRequest, auth } from '@/lib/auth'
import {
  proposalListResponse,
  proposalListResponseError,
  proposalResponse,
  proposalResponseError,
} from '@/lib/proposal/server'
import { createProposal, getProposals, updateProposal } from '@/lib/proposal/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { notifyNewProposal } from '@/lib/slack/notify'
import { findSpeakerByEmail } from '@/lib/speaker/sanity'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export const GET = auth(async (req: NextAuthRequest) => {
  if (
    !req.auth ||
    !req.auth.user ||
    !req.auth.speaker ||
    !req.auth.speaker._id ||
    !req.auth.account
  ) {
    return proposalListResponseError(
      new Error('Unauthorized'),
      'Unauthorized',
      'authentication',
      401,
    )
  }

  const { proposals, proposalsError } = await getProposals(req.auth.speaker._id)
  if (proposalsError) {
    return proposalListResponseError(
      proposalsError,
      'Failed to fetch proposals',
    )
  }

  return proposalListResponse(proposals)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

export const POST = auth(async (req: NextAuthRequest) => {
  if (
    !req.auth ||
    !req.auth.user ||
    !req.auth.speaker ||
    !req.auth.speaker._id ||
    !req.auth.account
  ) {
    return proposalResponseError({
      message: 'Unauthorized',
      type: 'authentication',
      status: 401,
    })
  }

  const data = (await req.json()) as ProposalInput & { pendingCoSpeakerEmails?: string[] }
  const { pendingCoSpeakerEmails, ...proposalData } = data
  const proposal = convertJsonToProposal(proposalData)

  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference) {
    return proposalResponseError({
      error,
      message: 'Failed to fetch conference',
      type: 'precondition',
      status: 500,
    })
  }

  // @TODO check if conference is open for proposals

  const validationErrors = validateProposal(proposal)
  if (validationErrors.length > 0) {
    return proposalResponseError({
      message: 'Proposal contains invalid fields',
      validationErrors,
      type: 'validation',
      status: 400,
    })
  }

  const { proposal: created, err } = await createProposal(
    proposal,
    req.auth.speaker._id,
    conference._id,
  )
  if (err) {
    return proposalResponseError({
      error: err,
      message: 'Failed to create proposal',
    })
  }

  // Process pending co-speaker invitations if any
  if (created && pendingCoSpeakerEmails && pendingCoSpeakerEmails.length > 0 && proposal.format !== Format.lightning_10) {
    const invitations = []
    
    for (const nameEmailString of pendingCoSpeakerEmails) {
      // Parse name:email format
      const [name, email] = nameEmailString.includes(':')
        ? nameEmailString.split(':').map(s => s.trim())
        : ['', nameEmailString.trim()]
      
      if (!email || !isValidEmail(email)) continue
      if (!name) continue // Skip if no name provided
      
      const normalizedEmail = normalizeEmail(email)
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 14) // 14 days expiry
      
      // Check if speaker already exists to potentially use their registered name
      const { speaker: existingSpeaker } = await findSpeakerByEmail(normalizedEmail)
      
      invitations.push({
        email: normalizedEmail,
        name: existingSpeaker?.name || name, // Use existing speaker name if available, otherwise use provided name
        status: CoSpeakerInvitationStatus.pending,
        invitedAt: new Date().toISOString(),
        token,
        expiresAt: expiresAt.toISOString(),
      })
      
      // Send invitation email
      try {
        const inviteUrl = `${process.env.NEXT_PUBLIC_URL}/api/proposal/invite/${token}`
        
        // Use existing email sending logic from the co-speaker invite route
        const sgMail = await import('@sendgrid/mail')
        sgMail.default.setApiKey(process.env.SENDGRID_API_KEY as string)
        
        await sgMail.default.send({
          to: normalizedEmail,
          from: process.env.SENDGRID_FROM_EMAIL as string,
          templateId: process.env.SENDGRID_TEMPLATE_ID_CO_SPEAKER_INVITE as string,
          dynamicTemplateData: {
            speaker: {
              name: existingSpeaker?.name || name || email,
            },
            proposal: {
              title: created.title,
              inviteUrl,
            },
            inviter: {
              name: req.auth.speaker.name,
            },
          },
        })
      } catch (emailError) {
        console.error(`Failed to send co-speaker invitation to ${normalizedEmail}:`, emailError)
        // Continue with other invitations even if one fails
      }
    }
    
    // Update proposal with invitations
    if (invitations.length > 0) {
      await updateProposal(
        created._id,
        { coSpeakerInvitations: invitations } as ProposalInput,
        req.auth.speaker._id
      )
    }
  }

  // Send Slack notification for new proposal
  if (created) {
    await notifyNewProposal(created)
  }

  return proposalResponse(created)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
