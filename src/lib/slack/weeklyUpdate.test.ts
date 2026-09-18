/**
 * @vitest-environment node
 *
 * WHAT THE WEEKLY POST IS ALLOWED TO ASSERT. It reaches an organizer unprompted
 * and nobody is present to question it, so two rules from this branch apply to
 * it exactly as they apply to `/admin/tickets`:
 *
 *  - an uncountable thing is never rendered as zero. The cron route supplies
 *    `?? 0` defaults whenever `buildTicketSection` fails, and the complimentary
 *    line then posted "0" as if the rosters were genuinely empty.
 *  - one on-track rule. The verdict came from `isOnTrack` (tolerance
 *    `ON_TRACK_VARIANCE`) while the words beside it came from `variance >= 0`,
 *    so the post could show ✅ next to "-4.2% behind".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const postMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/slack/client', () => ({
  postSlackMessage: (msg: unknown, opts: unknown) => postMock(msg, opts),
  escapeMrkdwn: (s: string) => s,
}))
vi.mock('@/lib/slack/token', () => ({
  resolveConferenceSlackToken: vi.fn().mockResolvedValue('xoxb-test'),
}))

import { sendWeeklyUpdateToSlack, type WeeklyUpdateData } from './weeklyUpdate'
import { ON_TRACK_VARIANCE } from '@/lib/tickets/utils'
import type { Conference } from '@/lib/conference/types'
import type { TicketAnalysisResult } from '@/lib/tickets/types'

const conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Bergen',
  salesNotificationChannel: '#sales',
} as unknown as Conference

function analysisWithVariance(variance: number): TicketAnalysisResult {
  return {
    progression: [],
    capacity: 300,
    performance: {
      currentPercentage: 40,
      targetPercentage: 40 - variance,
      variance,
      // Deliberately the OPPOSITE of the tolerance's answer, so a surface
      // reading this stored boolean instead of the rule fails the assertions
      // below rather than agreeing with them by luck.
      isOnTrack: false,
      nextMilestone: null,
    },
    statistics: {
      totalPaidTickets: 120,
      totalRevenue: 540000,
      totalOrders: 100,
      averageTicketPrice: 4500,
      categoryBreakdown: {},
      sponsorTickets: 0,
      speakerTickets: 0,
    },
  } as unknown as TicketAnalysisResult
}

function data(overrides: Partial<WeeklyUpdateData> = {}): WeeklyUpdateData {
  return {
    conference,
    ticketsByCategory: {},
    paidTickets: 120,
    speakerTickets: 37,
    organizerTickets: 8,
    totalTickets: 166,
    totalRevenue: 540000,
    targetAnalysis: null,
    sponsorPipeline: null,
    proposalSummary: null,
    lastUpdated: '2026-03-01T09:00:00.000Z',
    ...overrides,
  }
}

/** Every mrkdwn string in the posted message, flattened. */
async function postedText(input: WeeklyUpdateData): Promise<string> {
  postMock.mockClear()
  await sendWeeklyUpdateToSlack(input)
  const { blocks } = postMock.mock.calls[0][0] as {
    blocks: { text?: { text?: string }; fields?: { text?: string }[] }[]
  }
  return blocks
    .flatMap((b) => [b.text?.text, ...(b.fields ?? []).map((f) => f.text)])
    .filter(Boolean)
    .join('\n')
}

beforeEach(() => vi.clearAllMocks())

describe('complimentary allocations it could not count', () => {
  it('states the total when both rosters were read', async () => {
    expect(await postedText(data())).toContain('Complimentary allocated:*\n45')
  })

  it('does not post a zero for a roster read that failed', async () => {
    const text = await postedText(
      data({ speakerTickets: 'unknown', organizerTickets: 8 }),
    )

    expect(text).toContain('Complimentary allocated:*\nunknown')
    expect(text).not.toContain('Complimentary allocated:*\n0')
  })

  it('will not add an unknown to a known count', async () => {
    const text = await postedText(
      data({ speakerTickets: 37, organizerTickets: 'unknown' }),
    )

    expect(text).toContain('Complimentary allocated:*\nunknown')
    expect(text).not.toContain('Complimentary allocated:*\n37')
  })
})

describe('one on-track rule, the emoji and the words from the same helper', () => {
  it('says on track INSIDE the tolerance, and never calls it behind', async () => {
    // -4.2% is inside `ON_TRACK_VARIANCE`. The post used to pair ✅ with the
    // words "-4.2% behind" in the same block.
    const text = await postedText(
      data({ targetAnalysis: analysisWithVariance(-4.2) }),
    )

    expect(text).toContain('✅')
    expect(text).toContain('on track (-4.2%)')
    expect(text).not.toContain('behind')
    expect(text).not.toContain('⚠️')
  })

  it('says behind past the tolerance', async () => {
    const text = await postedText(
      data({ targetAnalysis: analysisWithVariance(ON_TRACK_VARIANCE - 0.1) }),
    )

    expect(text).toContain('⚠️')
    expect(text).toContain('behind (-5.1%)')
    expect(text).not.toContain('✅')
  })

  it('marks a conference ahead of target with a sign', async () => {
    const text = await postedText(
      data({ targetAnalysis: analysisWithVariance(6) }),
    )

    expect(text).toContain('✅')
    expect(text).toContain('on track (+6.0%)')
  })
})
