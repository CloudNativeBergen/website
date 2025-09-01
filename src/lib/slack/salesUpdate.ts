import { Conference } from '@/lib/conference/types'

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
  totalTickets: number
  totalRevenue: number
  lastUpdated: string
}

async function sendSlackMessage(message: SlackMessage, forceSlack = false) {
  const webhookUrl = process.env.CFP_BOT

  // In development, just print the message to console unless forced to send to Slack
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('no-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function createCategoryBreakdown(
  ticketsByCategory: Record<string, number>,
): SlackBlock[] {
  const categoryBlocks: SlackBlock[] = []

  // Create pairs of categories for side-by-side display
  const categoryEntries = Object.entries(ticketsByCategory)

  for (let i = 0; i < categoryEntries.length; i += 2) {
    const fields = []

    // First category
    const [category1, count1] = categoryEntries[i]
    fields.push({
      type: 'mrkdwn',
      text: `*${category1}:*\n${count1} tickets`,
    })

    // Second category (if exists)
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
    totalTickets,
    totalRevenue,
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
          text: `*Total Complimentary:*\n${sponsorTickets + speakerTickets}`,
        },
      ],
    },
  ]

  // Add category breakdown if there are multiple categories of paid tickets
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

  // Add a divider and footer
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
