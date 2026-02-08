import { Conference } from '@/lib/conference/types'
import type { TicketAnalysisResult } from '@/lib/tickets/types'
import type { SponsorPipelineData } from '@/lib/sponsor-crm/pipeline'
import { calculateFreeTicketClaimRate } from '@/lib/tickets/utils'
import { formatCurrency } from '@/lib/format'
import { postSlackMessage, type SlackBlock } from '@/lib/slack/client'

export type { SponsorPipelineData } from '@/lib/sponsor-crm/pipeline'

export interface ProposalSummaryData {
  submitted: number
  accepted: number
  confirmed: number
  rejected: number
  withdrawn: number
  total: number
}

export interface WeeklyUpdateData {
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
  sponsorPipeline?: SponsorPipelineData | null
  proposalSummary?: ProposalSummaryData | null
  lastUpdated: string
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

export function createProposalSummaryBlocks(
  summary: ProposalSummaryData,
): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📝 CFP / Proposals*',
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Proposals:*\n${summary.total}`,
        },
        {
          type: 'mrkdwn',
          text: `*Submitted:*\n${summary.submitted}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Accepted:*\n${summary.accepted}`,
        },
        {
          type: 'mrkdwn',
          text: `*Confirmed:*\n${summary.confirmed}`,
        },
      ],
    },
  ]

  if (summary.rejected > 0 || summary.withdrawn > 0) {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Rejected:*\n${summary.rejected}`,
        },
        {
          type: 'mrkdwn',
          text: `*Withdrawn:*\n${summary.withdrawn}`,
        },
      ],
    })
  }

  return blocks
}

export function createSponsorPipelineBlocks(
  pipeline: SponsorPipelineData,
  currency: string,
): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🤝 Sponsor Pipeline*',
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Sponsors:*\n${pipeline.totalSponsors}`,
        },
        {
          type: 'mrkdwn',
          text: `*Active Deals:*\n${pipeline.activeDeals}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Closed Won:*\n${pipeline.closedWonCount}`,
        },
        {
          type: 'mrkdwn',
          text: `*Closed Lost:*\n${pipeline.closedLostCount}`,
        },
      ],
    },
  ]

  if (pipeline.totalContractValue > 0) {
    const closedDeals = pipeline.closedWonCount + pipeline.closedLostCount
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Contract Value:*\n${formatCurrency(pipeline.totalContractValue, currency)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Win Rate:*\n${closedDeals > 0 ? ((pipeline.closedWonCount / closedDeals) * 100).toFixed(0) : 0}%`,
        },
      ],
    })
  }

  const stageEntries = Object.entries(pipeline.byStatus).filter(
    ([, count]) => count > 0,
  )
  if (stageEntries.length > 0) {
    const stageText = stageEntries
      .map(([stage, count]) => `${stage}: ${count}`)
      .join(' · ')
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Pipeline Stages:* ${stageText}`,
      },
    })
  }

  const invoiceEntries = Object.entries(pipeline.byInvoiceStatus).filter(
    ([, count]) => count > 0,
  )
  if (invoiceEntries.length > 0) {
    const invoiceText = invoiceEntries
      .map(([status, count]) => `${status}: ${count}`)
      .join(' · ')
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Invoice Status:* ${invoiceText}`,
      },
    })
  }

  const contractEntries = Object.entries(pipeline.byContractStatus).filter(
    ([, count]) => count > 0,
  )
  if (contractEntries.length > 0) {
    const contractText = contractEntries
      .map(([status, count]) => `${status}: ${count}`)
      .join(' · ')
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Contract Status:* ${contractText}`,
      },
    })
  }

  return blocks
}

export async function sendWeeklyUpdateToSlack(
  data: WeeklyUpdateData,
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
    sponsorPipeline,
    proposalSummary,
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
        text: `📊 Weekly Update - ${conference.title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary as of ${formattedDate}*`,
      },
    },
  ]

  // Sponsor pipeline first — most actionable early on
  if (sponsorPipeline && sponsorPipeline.totalSponsors > 0) {
    blocks.push(
      ...createSponsorPipelineBlocks(
        sponsorPipeline,
        sponsorPipeline.contractCurrency,
      ),
    )
  }

  // Proposal summary second — key activity indicator
  if (proposalSummary && proposalSummary.total > 0) {
    blocks.push(...createProposalSummaryBlocks(proposalSummary))
  }

  // Ticket overview — compact summary
  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🎟️ Tickets*',
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
          text: `*Total Tickets:*\n${totalTickets}`,
        },
        {
          type: 'mrkdwn',
          text: `*Complimentary:*\n${sponsorTickets + speakerTickets + organizerTickets} (claimed ${freeTicketsClaimed}, rate ${calculateFreeTicketClaimRate(freeTicketsClaimed, sponsorTickets + speakerTickets + organizerTickets).toFixed(1)}%)`,
        },
      ],
    },
  )

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
  await postSlackMessage(message, {
    channel: conference.sales_notification_channel,
    forceSlack,
  })
}
