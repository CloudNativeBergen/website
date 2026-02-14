import { ProposalExisting } from '@/lib/proposal/types'
import { getSpeaker } from '@/lib/speaker/sanity'
import { Action } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { Volunteer } from '@/lib/volunteer/types'
import {
  postSlackMessage,
  type SlackBlock,
  type SlackMessage,
} from '@/lib/slack/client'

async function sendSlackNotification(
  message: SlackMessage,
  conference: Conference,
) {
  try {
    await postSlackMessage(message, {
      channel: conference.cfpNotificationChannel,
    })
  } catch (error) {
    console.error('Error sending Slack notification:', error)
  }
}

async function sendSalesNotification(
  message: SlackMessage,
  conference: Conference,
) {
  try {
    await postSlackMessage(message, {
      channel: conference.salesNotificationChannel,
    })
  } catch (error) {
    console.error('Error sending Slack sales notification:', error)
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
  speakerNames?: string,
) {
  const names = speakerNames || (await resolveSpeakerNames(proposal))
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
    ...createProposalInfoBlocks(proposal, names),
  ]

  if (domain) {
    blocks.push(
      createAdminButton(proposal, domain, 'View in Admin', 'view_proposal'),
    )
  }

  const message = { blocks }
  await sendSlackNotification(message, conference)
}

export async function notifyNewProposal(
  proposal: ProposalExisting,
  conference: Conference,
  speakerNames?: string,
) {
  const names = speakerNames || (await resolveSpeakerNames(proposal))
  const domain = getDomainFromConference(conference)

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📥 New Talk Proposal',
        emoji: true,
      },
    },
    ...createProposalInfoBlocks(proposal, names),
  ]

  if (domain) {
    blocks.push(
      createAdminButton(proposal, domain, 'Review Proposal', 'review_proposal'),
    )
  }

  const message = { blocks }
  await sendSlackNotification(message, conference)
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
  await sendSlackNotification(message, conference)
}

export async function notifySponsorRegistrationComplete(
  sponsorName: string,
  tierTitle: string | null,
  contractValue: number | null,
  contractCurrency: string | null,
  conference: Conference,
) {
  const domain = getDomainFromConference(conference)

  const valueStr =
    contractValue && contractCurrency
      ? `${contractValue.toLocaleString()} ${contractCurrency}`
      : null

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '✅ Sponsor Registration Complete',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Sponsor:*\n${sponsorName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Tier:*\n${tierTitle || 'Not set'}`,
        },
      ],
    },
  ]

  if (valueStr) {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Contract Value:*\n${valueStr}`,
        },
      ],
    })
  }

  if (domain) {
    blocks.push(
      createAdminLinkButton(
        domain,
        '/admin/sponsors/crm',
        'Open Sponsor CRM',
        'open_sponsor_crm',
      ),
    )
  }

  const message = { blocks }
  await sendSalesNotification(message, conference)
}
