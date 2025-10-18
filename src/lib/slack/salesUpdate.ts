import { Conference } from '@/lib/conference/types'
import type { TicketAnalysisResult } from '@/lib/tickets/types'
import { calculateFreeTicketClaimRate } from '@/lib/tickets/utils'
import { formatCurrency } from '@/lib/format'

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

interface SalesUpdateData {
  conference: Conference
  ticketsByCategory: Record<string, number>
  paidTickets: number
  sponsorTickets: number
  speakerTickets: number
  organizerTickets: number
  freeTicketsClaimed: number
  totalTickets: number
  totalRevenue: number
  targetAnalysis?: TicketAnalysisResult | null
  lastUpdated: string
}

async function sendSlackMessage(message: SlackMessage, forceSlack = false) {
  const webhookUrl = process.env.CFP_BOT
  if (process.env.NODE_ENV === 'development' && !forceSlack) {
    console.log('Slack sales update notification (development mode):')
    console.log(JSON.stringify(message, null, 2))
    return
  }

  if (!webhookUrl) {
    console.warn('CFP_BOT webhook URL is not configured')
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
    console.error('Error sending Slack sales update notification:', error)
    throw error
  }
}

function createCategoryBreakdown(
  ticketsByCategory: Record<string, number>,
): SlackBlock[] {
  const categoryBlocks: SlackBlock[] = []
  const categoryEntries = Object.entries(ticketsByCategory)

  for (let i = 0; i < categoryEntries.length; i += 2) {
    const fields = []

    const [category1, count1] = categoryEntries[i]
    fields.push({
      type: 'mrkdwn',
      text: `*${category1}:*\n${count1} tickets`,
    })
    if (i + 1 < categoryEntries.length) {
      const [category2, count2] = categoryEntries[i + 1]
      fields.push({
        type: 'mrkdwn',
        text: `*${category2}:*\n${count2} tickets`,
      })
    }

    categoryBlocks.push({
      type: 'section',
      fields,
    })
  }

  return categoryBlocks
}

export async function sendSalesUpdateToSlack(
  data: SalesUpdateData,
  forceSlack = false,
) {
  const {
    conference,
    ticketsByCategory,
    paidTickets,
    sponsorTickets,
    speakerTickets,
    organizerTickets,
    freeTicketsClaimed,
    totalTickets,
    totalRevenue,
    targetAnalysis,
    lastUpdated,
  } = data

  const formattedDate = new Date(lastUpdated).toLocaleDateString('no-NO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 Weekly Sales Update - ${conference.title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Sales Summary as of ${formattedDate}*`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Paid Tickets:*\n${paidTickets}`,
        },
        {
          type: 'mrkdwn',
          text: `*Total Revenue:*\n${formatCurrency(totalRevenue)}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Sponsor Tickets:*\n${sponsorTickets}`,
        },
        {
          type: 'mrkdwn',
          text: `*Speaker Tickets:*\n${speakerTickets}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Tickets:*\n${totalTickets}`,
        },
        {
          type: 'mrkdwn',
          text: `*Total Complimentary:*\n${sponsorTickets + speakerTickets + organizerTickets}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🎁 Free Tickets Allocation*',
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Allocated:*\n${sponsorTickets + speakerTickets + organizerTickets}`,
        },
        {
          type: 'mrkdwn',
          text: `*Claimed:*\n${freeTicketsClaimed}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Sponsors:*\n${sponsorTickets}`,
        },
        {
          type: 'mrkdwn',
          text: `*Speakers:*\n${speakerTickets}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Organizers:*\n${organizerTickets}`,
        },
        {
          type: 'mrkdwn',
          text: `*Claim Rate:*\n${calculateFreeTicketClaimRate(freeTicketsClaimed, sponsorTickets + speakerTickets + organizerTickets).toFixed(1)}%`,
        },
      ],
    },
  ]

  if (targetAnalysis && targetAnalysis.performance) {
    const { performance } = targetAnalysis
    const statusEmoji = performance.isOnTrack ? '✅' : '⚠️'
    const varianceText =
      performance.variance >= 0
        ? `+${performance.variance.toFixed(1)}% ahead`
        : `${performance.variance.toFixed(1)}% behind`

    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${statusEmoji} Target Progress*`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Current Target:*\n${performance.targetPercentage.toFixed(1)}%`,
          },
          {
            type: 'mrkdwn',
            text: `*Actual Progress:*\n${performance.currentPercentage.toFixed(1)}%`,
          },
        ],
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Variance:*\n${varianceText}`,
          },
          {
            type: 'mrkdwn',
            text: `*Capacity:*\n${paidTickets}/${targetAnalysis.capacity} tickets`,
          },
        ],
      },
    )

    if (performance.nextMilestone) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🎯 Next Milestone:* ${performance.nextMilestone.label} in ${performance.nextMilestone.daysAway} days`,
        },
      })
    }
  }
  if (Object.keys(ticketsByCategory).length > 1) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Breakdown by Paid Ticket Category:*',
      },
    })

    blocks.push(...createCategoryBreakdown(ticketsByCategory))
  }
  blocks.push(
    {
      type: 'divider',
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_This report was generated automatically on ${new Date(lastUpdated).toLocaleString('no-NO')}_`,
      },
    },
  )

  const message = { blocks }
  await sendSlackMessage(message, forceSlack)
}
