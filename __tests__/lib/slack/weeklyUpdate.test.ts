/**
 * @jest-environment node
 */
import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals'
import {
  createSponsorPipelineBlocks,
  createProposalSummaryBlocks,
} from '@/lib/slack/weeklyUpdate'
import type {
  WeeklyUpdateData,
  SponsorPipelineData,
  ProposalSummaryData,
} from '@/lib/slack/weeklyUpdate'
import type { TicketAnalysisResult } from '@/lib/tickets/types'
import { createMockConference } from '../../testdata/conference'

const mockFetch = jest.fn() as jest.MockedFunction<typeof global.fetch>

let savedNodeEnv: string | undefined
let savedBotToken: string | undefined
let savedFetch: typeof global.fetch

function setEnv(nodeEnv: string, botToken?: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: nodeEnv,
    writable: true,
    configurable: true,
  })
  if (botToken !== undefined) {
    process.env.SLACK_BOT_TOKEN = botToken
  } else {
    delete process.env.SLACK_BOT_TOKEN
  }
}

function restoreEnv() {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: savedNodeEnv,
    writable: true,
    configurable: true,
  })
  if (savedBotToken !== undefined) {
    process.env.SLACK_BOT_TOKEN = savedBotToken
  } else {
    delete process.env.SLACK_BOT_TOKEN
  }
}

function createBaseUpdateData(
  overrides: Partial<WeeklyUpdateData> = {},
): WeeklyUpdateData {
  return {
    conference: createMockConference({
      sales_notification_channel: '#sales',
    }),
    ticketsByCategory: { Regular: 50 },
    paidTickets: 50,
    sponsorTickets: 10,
    speakerTickets: 8,
    organizerTickets: 5,
    freeTicketsClaimed: 15,
    totalTickets: 73,
    totalRevenue: 125000,
    lastUpdated: '2026-02-07T09:00:00Z',
    ...overrides,
  }
}

function createMockPipeline(
  overrides: Partial<SponsorPipelineData> = {},
): SponsorPipelineData {
  return {
    byStatus: {
      prospect: 3,
      contacted: 2,
      negotiating: 1,
      'closed-won': 5,
      'closed-lost': 1,
    },
    byStatusValue: {
      prospect: 0,
      contacted: 0,
      negotiating: 50000,
      'closed-won': 200000,
      'closed-lost': 0,
    },
    byContractStatus: {
      none: 4,
      'verbal-agreement': 1,
      'contract-sent': 1,
      'contract-signed': 6,
    },
    byInvoiceStatus: { 'not-sent': 3, sent: 2, paid: 5, overdue: 1 },
    totalContractValue: 250000,
    contractCurrency: 'NOK',
    totalSponsors: 12,
    closedWonCount: 5,
    closedLostCount: 1,
    activeDeals: 6,
    ...overrides,
  }
}

function parseSlackBody(): { blocks: Record<string, unknown>[] } {
  return JSON.parse(mockFetch.mock.calls[0][1]!.body as string)
}

type SlackBlock = {
  text?: { text: string }
  fields?: { text: string }[]
}

function allBlockText(body: { blocks: SlackBlock[] }): string {
  return body.blocks
    .map((b) => b.text?.text || b.fields?.map((f) => f.text).join(' ') || '')
    .join(' ')
}

describe('weeklyUpdate', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.restoreAllMocks()
    mockFetch.mockReset()
    savedNodeEnv = process.env.NODE_ENV
    savedBotToken = process.env.SLACK_BOT_TOKEN
    savedFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = savedFetch
    restoreEnv()
  })

  describe('sendWeeklyUpdateToSlack', () => {
    it('should log to console in development mode', async () => {
      setEnv('development')
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(createBaseUpdateData())

      expect(consoleSpy).toHaveBeenCalledWith(
        'Slack notification (development mode):',
      )
    })

    it('should warn when SLACK_BOT_TOKEN is missing', async () => {
      setEnv('production')
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(createBaseUpdateData())

      expect(warnSpy).toHaveBeenCalledWith('SLACK_BOT_TOKEN is not configured')
    })

    it('should send message via bot token in production', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(
        createBaseUpdateData({
          conference: createMockConference({
            sales_notification_channel: '#sales-updates',
          }),
        }),
      )

      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: 'Bearer xoxb-test-token',
          },
        }),
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string)
      expect(body.channel).toBe('#sales-updates')
      expect(body.blocks).toBeDefined()
      const header = body.blocks[0]
      expect(header.text?.text).toContain('Weekly Update')
      expect(header.text?.text).toContain('Cloud Native Day 2026')
    })

    it('should throw on HTTP error from Slack API', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await expect(
        sendWeeklyUpdateToSlack(
          createBaseUpdateData({
            conference: createMockConference({
              sales_notification_channel: '#test',
            }),
          }),
        ),
      ).rejects.toThrow('Slack API HTTP 500: Internal Server Error')
    })

    it('should not embed channel name in message text', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      const data = createBaseUpdateData({
        conference: createMockConference({
          sales_notification_channel: '#conference-sales',
        }),
      })
      await sendWeeklyUpdateToSlack(data)

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string)
      const summaryText = body.blocks[1]?.text?.text || ''
      expect(summaryText).toContain('Summary as of')
      expect(summaryText).not.toContain('Channel:')
    })

    it('should include target analysis section when provided', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const targetAnalysis: TicketAnalysisResult = {
        statistics: {
          totalPaidTickets: 50,
          totalRevenue: 125000,
          totalOrders: 45,
          averageTicketPrice: 2500,
          categoryBreakdown: { Regular: 50 },
          sponsorTickets: 10,
          speakerTickets: 8,
          totalCapacityUsed: 68,
        },
        progression: [],
        performance: {
          currentPercentage: 33.3,
          targetPercentage: 40.0,
          variance: -6.7,
          isOnTrack: false,
          nextMilestone: {
            date: '2026-04-01',
            label: 'Early Bird End',
            daysAway: 53,
          },
        },
        capacity: 150,
      }

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(createBaseUpdateData({ targetAnalysis }))

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).toContain('Target Progress')
      expect(text).toContain('40.0%')
      expect(text).toContain('33.3%')
      expect(text).toContain('behind')
      expect(text).toContain('Early Bird End')
    })

    it('should omit target section when targetAnalysis is null', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(
        createBaseUpdateData({ targetAnalysis: null }),
      )

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).not.toContain('Target Progress')
    })

    it('should include sponsor pipeline section when provided', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(
        createBaseUpdateData({ sponsorPipeline: createMockPipeline() }),
      )

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).toContain('Sponsor Pipeline')
      expect(text).toContain('Total Sponsors')
      expect(text).toContain('12')
      expect(text).toContain('Closed Won')
      expect(text).toContain('Active Deals')
    })

    it('should omit sponsor pipeline when not provided', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(createBaseUpdateData())

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).not.toContain('Sponsor Pipeline')
    })

    it('should include category breakdown when multiple categories', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(
        createBaseUpdateData({
          ticketsByCategory: { Regular: 30, 'Early Bird': 20 },
        }),
      )

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).toContain('Breakdown by Paid Ticket Category')
      expect(text).toContain('Regular')
      expect(text).toContain('Early Bird')
    })

    it('should omit category breakdown with single category', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(
        createBaseUpdateData({ ticketsByCategory: { Regular: 50 } }),
      )

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).not.toContain('Breakdown by Paid Ticket Category')
    })

    it('should include proposal summary section when provided', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const proposalSummary: ProposalSummaryData = {
        submitted: 15,
        accepted: 5,
        confirmed: 3,
        rejected: 2,
        withdrawn: 1,
        total: 26,
      }

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(createBaseUpdateData({ proposalSummary }))

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).toContain('CFP / Proposals')
      expect(text).toContain('Total Proposals')
      expect(text).toContain('26')
      expect(text).toContain('Submitted')
      expect(text).toContain('15')
      expect(text).toContain('Accepted')
      expect(text).toContain('Confirmed')
    })

    it('should omit proposal summary when not provided', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(createBaseUpdateData())

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).not.toContain('CFP / Proposals')
    })

    it('should include sponsor pipeline before tickets', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      await sendWeeklyUpdateToSlack(
        createBaseUpdateData({
          sponsorPipeline: createMockPipeline(),
          proposalSummary: {
            submitted: 10,
            accepted: 2,
            confirmed: 1,
            rejected: 0,
            withdrawn: 0,
            total: 13,
          },
        }),
      )

      const body = parseSlackBody()
      const allText = (body.blocks as SlackBlock[]).map(
        (b) => b.text?.text || b.fields?.map((f) => f.text).join(' ') || '',
      )
      const sponsorIdx = allText.findIndex((t) =>
        t.includes('Sponsor Pipeline'),
      )
      const proposalIdx = allText.findIndex((t) =>
        t.includes('CFP / Proposals'),
      )
      const ticketIdx = allText.findIndex((t) => t.includes('Tickets'))
      expect(sponsorIdx).toBeLessThan(proposalIdx)
      expect(proposalIdx).toBeLessThan(ticketIdx)
    })

    it('should calculate free ticket claim rate correctly', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendWeeklyUpdateToSlack } =
        await import('@/lib/slack/weeklyUpdate')
      // 15 claimed out of 23 allocated (10+8+5) = 65.2%
      await sendWeeklyUpdateToSlack(createBaseUpdateData())

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).toContain('65.2%')
    })
  })

  describe('createProposalSummaryBlocks', () => {
    it('should create blocks with proposal counts', () => {
      const summary: ProposalSummaryData = {
        submitted: 10,
        accepted: 3,
        confirmed: 2,
        rejected: 1,
        withdrawn: 1,
        total: 17,
      }
      const blocks = createProposalSummaryBlocks(summary)

      expect(blocks[0].text?.text).toContain('CFP / Proposals')
      const fieldsText = blocks
        .flatMap((b) => b.fields?.map((f) => f.text) || [])
        .join(' ')
      expect(fieldsText).toContain('17')
      expect(fieldsText).toContain('10')
      expect(fieldsText).toContain('3')
      expect(fieldsText).toContain('2')
    })

    it('should show rejected/withdrawn only when > 0', () => {
      const noRejections: ProposalSummaryData = {
        submitted: 5,
        accepted: 2,
        confirmed: 1,
        rejected: 0,
        withdrawn: 0,
        total: 8,
      }
      const blocks = createProposalSummaryBlocks(noRejections)

      const fieldsText = blocks
        .flatMap((b) => b.fields?.map((f) => f.text) || [])
        .join(' ')
      expect(fieldsText).not.toContain('Rejected')
      expect(fieldsText).not.toContain('Withdrawn')
    })

    it('should show rejected/withdrawn when present', () => {
      const withRejections: ProposalSummaryData = {
        submitted: 5,
        accepted: 2,
        confirmed: 1,
        rejected: 3,
        withdrawn: 1,
        total: 12,
      }
      const blocks = createProposalSummaryBlocks(withRejections)

      const fieldsText = blocks
        .flatMap((b) => b.fields?.map((f) => f.text) || [])
        .join(' ')
      expect(fieldsText).toContain('Rejected')
      expect(fieldsText).toContain('3')
      expect(fieldsText).toContain('Withdrawn')
    })
  })

  describe('createSponsorPipelineBlocks', () => {
    it('should create blocks with sponsor counts', () => {
      const pipeline = createMockPipeline()
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      expect(blocks.length).toBeGreaterThanOrEqual(3)
      expect(blocks[0].text?.text).toContain('Sponsor Pipeline')

      const fieldsText = blocks
        .flatMap((b) => b.fields?.map((f) => f.text) || [])
        .join(' ')
      expect(fieldsText).toContain('12')
      expect(fieldsText).toContain('6')
      expect(fieldsText).toContain('5')
      expect(fieldsText).toContain('1')
    })

    it('should include contract value and win rate when value > 0', () => {
      const pipeline = createMockPipeline({ totalContractValue: 500000 })
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      const fieldsText = blocks
        .flatMap((b) => b.fields?.map((f) => f.text) || [])
        .join(' ')
      expect(fieldsText).toContain('Total Contract Value')
      expect(fieldsText).toContain('Win Rate')
    })

    it('should omit contract value block when value is 0', () => {
      const pipeline = createMockPipeline({ totalContractValue: 0 })
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      const fieldsText = blocks
        .flatMap((b) => b.fields?.map((f) => f.text) || [])
        .join(' ')
      expect(fieldsText).not.toContain('Total Contract Value')
    })

    it('should display pipeline stages', () => {
      const pipeline = createMockPipeline()
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      const allText = blocks.map((b) => b.text?.text || '').join(' ')
      expect(allText).toContain('Pipeline Stages')
      expect(allText).toContain('prospect: 3')
      expect(allText).toContain('closed-won: 5')
    })

    it('should display invoice status breakdown', () => {
      const pipeline = createMockPipeline()
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      const allText = blocks.map((b) => b.text?.text || '').join(' ')
      expect(allText).toContain('Invoice Status')
      expect(allText).toContain('paid: 5')
      expect(allText).toContain('overdue: 1')
    })

    it('should omit stages with zero count', () => {
      const pipeline = createMockPipeline({
        byStatus: { prospect: 0, 'closed-won': 3 },
      })
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      const allText = blocks.map((b) => b.text?.text || '').join(' ')
      expect(allText).not.toContain('prospect')
      expect(allText).toContain('closed-won: 3')
    })

    it('should calculate correct win rate', () => {
      const pipeline = createMockPipeline({
        closedWonCount: 4,
        closedLostCount: 1,
        totalContractValue: 100000,
      })
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      const fieldsText = blocks
        .flatMap((b) => b.fields?.map((f) => f.text) || [])
        .join(' ')
      // 4 / (4 + 1) = 80%
      expect(fieldsText).toContain('80%')
    })

    it('should handle empty pipeline statuses', () => {
      const pipeline = createMockPipeline({
        byStatus: {},
        byInvoiceStatus: {},
        byContractStatus: {},
      })
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      const allText = blocks.map((b) => b.text?.text || '').join(' ')
      expect(allText).not.toContain('Pipeline Stages')
      expect(allText).not.toContain('Invoice Status')
      expect(allText).not.toContain('Contract Status')
    })

    it('should display contract status breakdown', () => {
      const pipeline = createMockPipeline()
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      const allText = blocks.map((b) => b.text?.text || '').join(' ')
      expect(allText).toContain('Contract Status')
      expect(allText).toContain('contract-signed: 6')
    })
  })
})
