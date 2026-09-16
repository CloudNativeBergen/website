import type { ReportView } from '../types'
import type { CampaignView } from '../../types'

export function exportFixture(): ReportView {
  const campaign: CampaignView = {
    _id: 'campaign-a',
    key: 'cfp',
    title: 'CFP campaign',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    provisional: false,
    startMilestone: 'CFP_OPEN',
    endMilestone: 'CFP_CLOSE',
    primaryOutcome: 'cfpSubmissions',
    target: 250,
    optional: false,
  }
  return {
    conference: { id: 'conference-a', title: 'Cloud Native Days 2026' },
    plan: {
      _id: 'plan-a',
      ownerId: null,
      ownerName: null,
      templateVersion: '1',
      copiedFromTitle: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
    range: {
      from: '2026-06-01',
      to: '2026-07-08',
      defaultFrom: '2026-06-01',
      defaultTo: '2026-07-08',
      grain: 'daily',
    },
    semantics:
      'Latest measured cumulative observations in the range; not activity within the selected period.',
    rankingMetric: 'Ranked by latest measured combined clicks, then sessions.',
    summary: [
      {
        ...campaign,
        value: 137,
        attributedValue: 83,
        observationDate: '2026-06-16',
        stale: false,
      },
    ],
    channels: [{ channel: 'bluesky', sessions: 913, clicks: 71 }],
    unavailableStage:
      'Per-Channel primary conversions and separate checkout clicks are unavailable because Snapshots do not store them.',
    timeline: [
      {
        campaignId: campaign._id,
        title: campaign.title,
        outcome: campaign.primaryOutcome,
        points: [
          { date: '2026-06-01', value: 17, stale: false },
          { date: '2026-06-10', value: 140, stale: false },
          { date: '2026-06-16', value: 137, stale: false },
        ],
      },
    ],
    campaigns: [campaign],
    milestones: { CFP_CLOSE: { date: '2026-06-30', provisional: false } },
    topTasks: [
      {
        taskId: 'deleted-task',
        title: 'Deleted or unavailable Task',
        campaignId: campaign._id,
        campaignTitle: campaign.title,
        channel: null,
        sessions: 913,
        clicks: 71,
        blueskyInteractions: 29,
      },
    ],
    previousEdition: null,
    health: {
      running: true,
      total: 12,
      complete: 5,
      overdue: 3,
      waiting: 2,
      failed: 1,
      unassigned: 4,
    },
    snapshots: [
      {
        _id: 'snapshot-a',
        _type: 'marketingSnapshot',
        campaign: { _type: 'reference', _ref: campaign._id },
        conference: { _type: 'reference', _ref: 'conference-a' },
        date: '2026-06-16',
        takenAt: '2026-06-17T04:00:00Z',
        primaryOutcomeValue: 137,
        primaryOutcomeAttributed: true,
        primaryOutcomeAttributedValue: 83,
        secondary: {
          attributedSessions: 913,
          checkoutClickThrough: 42,
          blueskyInteractions: 29,
        },
        perTask: [
          {
            _key: 'deleted-task',
            _type: 'marketingSnapshotTask',
            task: { _type: 'reference', _ref: 'deleted-task', _weak: true },
            sessions: 913,
            clicks: 71,
            blueskyLikes: 20,
            blueskyReposts: 5,
            blueskyReplies: 3,
            blueskyQuotes: 1,
          },
        ],
        source: { posthog: 'ok', bluesky: 'ok' },
      },
    ],
    tasks: [],
  }
}
