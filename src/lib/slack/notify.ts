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
}

type SlackMessage = {
  blocks: SlackBlock[]
}

async function sendSlackMessage(message: SlackMessage) {
  const webhookUrl = process.env.CFP_BOT

  // In development, just print the message to console
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

export async function notifyNewProposal(proposal: ProposalExisting) {
  const speakerNames = await resolveSpeakerNames(proposal)

  const message = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎉 New CFP Submission',
          emoji: true,
        },
      },
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
    ],
  }

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
) {
  const speakerNames = await resolveSpeakerNames(proposal)

  const message = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${getActionEmoji(action)} Talk ${getActionText(action)}`,
          emoji: true,
        },
      },
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
    ],
  }

  await sendSlackMessage(message)
}
