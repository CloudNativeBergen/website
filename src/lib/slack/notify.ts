import { ProposalExisting } from '@/lib/proposal/types'
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
      throw new Error(
        `Failed to send Slack notification: ${response.statusText}`,
      )
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error)
  }
}

export async function notifyNewProposal(proposal: ProposalExisting) {
  // Fetch speakers details if they are references
  let speakerNames = 'Unknown'

  if (
    proposal.speakers &&
    Array.isArray(proposal.speakers) &&
    proposal.speakers.length > 0
  ) {
    const speakerPromises = proposal.speakers.map(async (speaker) => {
      if (speaker && '_ref' in speaker) {
        const { speaker: speakerData, err } = await getSpeaker(speaker._ref)
        if (!err && speakerData && speakerData.name) {
          return speakerData.name
        }
      }
      return 'Unknown'
    })

    const resolvedSpeakers = await Promise.all(speakerPromises)
    speakerNames = resolvedSpeakers.join(', ')
  } else {
    console.log('Speakers are not references or missing')
  }

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
            text: `*Format:*\n${proposal.format}`,
          },
          {
            type: 'mrkdwn',
            text: `*Level:*\n${proposal.level}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Description:*\n${
            proposal.description
              ?.map((block: PortableTextBlock) => {
                const children = block.children as
                  | { text: string }[]
                  | undefined
                return children?.[0]?.text || ''
              })
              .join('\n') || 'No description provided'
          }`,
        },
      },
    ],
  }

  await sendSlackMessage(message)
}

export async function notifyProposalStatusChange(
  proposal: ProposalExisting,
  action: Action,
) {
  // Fetch speakers details if they are references
  let speakerNames = 'Unknown'
  if (
    proposal.speakers &&
    Array.isArray(proposal.speakers) &&
    proposal.speakers.length > 0
  ) {
    const speakerPromises = proposal.speakers.map(async (speaker) => {
      if (speaker && '_ref' in speaker) {
        const { speaker: speakerData, err } = await getSpeaker(speaker._ref)
        if (!err && speakerData && speakerData.name) {
          return speakerData.name
        }
      }
      return 'Unknown'
    })

    const resolvedSpeakers = await Promise.all(speakerPromises)
    speakerNames = resolvedSpeakers.join(', ')
  }

  const getEmoji = (action: Action) => {
    switch (action) {
      case Action.confirm:
        return '✅'
      case Action.withdraw:
        return '🚫'
      default:
        return '📝'
    }
  }

  const getStatusText = (action: Action) => {
    switch (action) {
      case Action.confirm:
        return 'Confirmed'
      case Action.withdraw:
        return 'Withdrawn'
      default:
        return 'Status Changed'
    }
  }

  const message = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${getEmoji(action)} Talk ${getStatusText(action)}`,
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
