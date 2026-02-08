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
import { createSponsorPipelineBlocks } from '@/lib/slack/salesUpdate'
import type {
  SalesUpdateData,
  SponsorPipelineData,
} from '@/lib/slack/salesUpdate'
import type { TicketAnalysisResult } from '@/lib/tickets/types'
import { createMockConference } from '../../testdata/conference'

const mockFetch = jest.fn() as jest.MockedFunction<typeof global.fetch>

let savedNodeEnv: string | undefined
let savedBotToken: string | undefined

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

function createBaseSalesData(
  overrides: Partial<SalesUpdateData> = {},
): SalesUpdateData {
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

describe('salesUpdate', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.restoreAllMocks()
    mockFetch.mockReset()
    savedNodeEnv = process.env.NODE_ENV
    savedBotToken = process.env.SLACK_BOT_TOKEN
  })

  afterEach(() => {
    restoreEnv()
  })

  describe('sendSalesUpdateToSlack', () => {
    it('should log to console in development mode', async () => {
      setEnv('development')
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      await sendSalesUpdateToSlack(createBaseSalesData())

      expect(consoleSpy).toHaveBeenCalledWith(
        'Slack notification (development mode):',
      )
    })

    it('should warn when SLACK_BOT_TOKEN is missing', async () => {
      setEnv('production')
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { })

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      await sendSalesUpdateToSlack(createBaseSalesData())

      expect(warnSpy).toHaveBeenCalledWith('SLACK_BOT_TOKEN is not configured')
    })

    it('should send message via bot token in production', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      await sendSalesUpdateToSlack(
        createBaseSalesData({
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
      expect(header.text?.text).toContain('Weekly Sales Update')
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

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      await expect(
        sendSalesUpdateToSlack(
          createBaseSalesData({
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

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      const data = createBaseSalesData({
        conference: createMockConference({
          sales_notification_channel: '#conference-sales',
        }),
      })
      await sendSalesUpdateToSlack(data)

      const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string)
      const summaryText = body.blocks[1]?.text?.text || ''
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

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      await sendSalesUpdateToSlack(createBaseSalesData({ targetAnalysis }))

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

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      await sendSalesUpdateToSlack(
        createBaseSalesData({ targetAnalysis: null }),
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

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      await sendSalesUpdateToSlack(
        createBaseSalesData({ sponsorPipeline: createMockPipeline() }),
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

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      await sendSalesUpdateToSlack(createBaseSalesData())

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

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      await sendSalesUpdateToSlack(
        createBaseSalesData({
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

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      await sendSalesUpdateToSlack(
        createBaseSalesData({ ticketsByCategory: { Regular: 50 } }),
      )

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).not.toContain('Breakdown by Paid Ticket Category')
    })

    it('should calculate free ticket claim rate correctly', async () => {
      setEnv('production', 'xoxb-test-token')
      global.fetch = mockFetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response)

      const { sendSalesUpdateToSlack } = await import('@/lib/slack/salesUpdate')
      // 15 claimed out of 23 allocated (10+8+5) = 65.2%
      await sendSalesUpdateToSlack(createBaseSalesData())

      const text = allBlockText(parseSlackBody() as { blocks: SlackBlock[] })
      expect(text).toContain('65.2%')
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
        totalSponsors: 10,
        closedWonCount: 4,
        totalContractValue: 100000,
      })
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      const fieldsText = blocks
        .flatMap((b) => b.fields?.map((f) => f.text) || [])
        .join(' ')
      expect(fieldsText).toContain('40%')
    })

    it('should handle empty pipeline statuses', () => {
      const pipeline = createMockPipeline({
        byStatus: {},
        byInvoiceStatus: {},
      })
      const blocks = createSponsorPipelineBlocks(pipeline, 'NOK')

      const allText = blocks.map((b) => b.text?.text || '').join(' ')
      expect(allText).not.toContain('Pipeline Stages')
      expect(allText).not.toContain('Invoice Status')
    })
  })
})
