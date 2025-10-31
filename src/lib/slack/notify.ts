import {
  ProposalExisting,
  formats,
  levels,
  languages,
  audiences,
} from '@/lib/proposal/types'
import { PortableTextBlock } from 'sanity'
import { getSpeaker } from '@/lib/speaker/sanity'
import { Action } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { Volunteer } from '@/lib/volunteer/types'

type SlackBlock = {
  type: string
  text?: {
    type: string
    text: string
    emoji?: boolean
  }
  fields?: Array<{
    type: string
    text: string
  }>
  elements?: Array<{
    type: string
    text: {
      type: string
      text: string
      emoji?: boolean
    }
    url?: string
    action_id?: string
  }>
}

type SlackMessage = {
  blocks: SlackBlock[]
}

async function sendSlackMessage(message: SlackMessage) {
  const webhookUrl = process.env.CFP_BOT

  if (process.env.NODE_ENV === 'development') {
    console.log('Slack notification (development mode):')
    console.log(JSON.stringify(message, null, 2))
    return
  }

  if (!webhookUrl) {
    console.warn('CFP_BOT is not configured')
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error)
  }
}

async function resolveSpeakerNames(
  proposal: ProposalExisting,
): Promise<string> {
  if (
    !proposal.speakers ||
    !Array.isArray(proposal.speakers) ||
    proposal.speakers.length === 0
  ) {
    return 'Unknown'
  }

  const speakerPromises = proposal.speakers.map(async (speaker) => {
    if (speaker && '_ref' in speaker) {
      const { speaker: speakerData, err } = await getSpeaker(speaker._ref)
      if (!err && speakerData?.name) {
        return speakerData.name
      }
    }
    return 'Unknown'
  })

  const resolvedSpeakers = await Promise.all(speakerPromises)
  return resolvedSpeakers.join(', ')
}

function formatDescription(
  description: PortableTextBlock[] | undefined,
): string {
  if (!description || description.length === 0) {
    return 'No description provided'
  }

  return description
    .map((block: PortableTextBlock) => {
      const children = block.children as { text: string }[] | undefined
      return children?.[0]?.text || ''
    })
    .join('\n')
}

function getDomainFromConference(conference: Conference): string | null {
  return conference.domains && conference.domains.length > 0
    ? conference.domains[0]
    : null
}

function createAdminLinkButton(
  domain: string,
  path: string,
  text: string,
  actionId: string,
): SlackBlock {
  const adminUrl = `https://${domain}${path}`
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: text,
          emoji: true,
        },
        url: adminUrl,
        action_id: actionId,
      },
    ],
  }
}

function createAdminButton(
  proposal: ProposalExisting,
  domain: string,
  buttonText: string,
  actionId: string,
): SlackBlock {
  return createAdminLinkButton(
    domain,
    `/admin/proposals/${proposal._id}`,
    buttonText,
    actionId,
  )
}

function createProposalInfoBlocks(
  proposal: ProposalExisting,
  speakerNames: string,
): SlackBlock[] {
  return [
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Title:*\n${proposal.title}`,
        },
        {
          type: 'mrkdwn',
          text: `*Speaker:*\n${speakerNames}`,
        },
      ],
    },
  ]
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function notifyNewProposal(
  proposal: ProposalExisting,
  conference: Conference,
) {
  const speakerNames = await resolveSpeakerNames(proposal)
  const domain = getDomainFromConference(conference)

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🎉 New CFP Submission',
        emoji: true,
      },
    },
    ...createProposalInfoBlocks(proposal, speakerNames),
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Format:*\n${formats.get(proposal.format) || proposal.format}`,
        },
        {
          type: 'mrkdwn',
          text: `*Level:*\n${levels.get(proposal.level) || proposal.level}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Language:*\n${languages.get(proposal.language) || proposal.language}`,
        },
        {
          type: 'mrkdwn',
          text: `*Audience:*\n${proposal.audiences ? proposal.audiences.map((aud) => audiences.get(aud) || aud).join(', ') : 'Not specified'}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Description:*\n${formatDescription(proposal.description)}`,
      },
    },
  ]

  if (domain) {
    blocks.push(
      createAdminButton(proposal, domain, 'Review in Admin', 'review_proposal'),
    )
  }

  const message = { blocks }
  await sendSlackMessage(message)
}

function getActionEmoji(action: Action): string {
  switch (action) {
    case Action.confirm:
      return '✅'
    case Action.withdraw:
      return '🚫'
    default:
      return '📝'
  }
}

function getActionText(action: Action): string {
  switch (action) {
    case Action.confirm:
      return 'Confirmed'
    case Action.withdraw:
      return 'Withdrawn'
    default:
      return 'Status Changed'
  }
}

export async function notifyProposalStatusChange(
  proposal: ProposalExisting,
  action: Action,
  conference: Conference,
) {
  const speakerNames = await resolveSpeakerNames(proposal)
  const domain = getDomainFromConference(conference)

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${getActionEmoji(action)} Talk ${getActionText(action)}`,
        emoji: true,
      },
    },
    ...createProposalInfoBlocks(proposal, speakerNames),
  ]

  if (domain) {
    blocks.push(
      createAdminButton(proposal, domain, 'View in Admin', 'view_proposal'),
    )
  }

  const message = { blocks }
  await sendSlackMessage(message)
}

export async function notifyNewVolunteer(
  volunteer: Volunteer,
  conference: Conference,
) {
  const domain = getDomainFromConference(conference)

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🙋 New Volunteer Application',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Conference:* ${conference.title}`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Name:*\n${volunteer.name}`,
        },
        {
          type: 'mrkdwn',
          text: `*Email:*\n${volunteer.email}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Phone:*\n${volunteer.phone}`,
        },
        {
          type: 'mrkdwn',
          text: `*Occupation:*\n${volunteer.occupation.charAt(0).toUpperCase() + volunteer.occupation.slice(1)}`,
        },
      ],
    },
  ]

  // Add volunteer details section if any optional fields are provided
  const detailFields: Array<{ type: string; text: string }> = []

  if (volunteer.availability) {
    detailFields.push({
      type: 'mrkdwn',
      text: `*Availability:*\n${volunteer.availability}`,
    })
  }

  if (volunteer.preferredTasks && volunteer.preferredTasks.length > 0) {
    detailFields.push({
      type: 'mrkdwn',
      text: `*Preferred Tasks:*\n${volunteer.preferredTasks.join(', ')}`,
    })
  }

  if (volunteer.tshirtSize) {
    detailFields.push({
      type: 'mrkdwn',
      text: `*T-Shirt Size:*\n${volunteer.tshirtSize}`,
    })
  }

  if (volunteer.dietaryRestrictions) {
    detailFields.push({
      type: 'mrkdwn',
      text: `*Dietary Restrictions:*\n${volunteer.dietaryRestrictions}`,
    })
  }

  if (detailFields.length > 0) {
    blocks.push({
      type: 'section',
      fields: detailFields,
    })
  }

  // Add other info section if it exists
  if (volunteer.otherInfo) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Other Information:*\n${volunteer.otherInfo}`,
      },
    })
  }

  // Add admin button if domain exists
  if (domain) {
    blocks.push(
      createAdminLinkButton(
        domain,
        '/admin/volunteers',
        'Review in Admin',
        'review_volunteer',
      ),
    )
  }

  const message = { blocks }
  await sendSlackMessage(message)
}
