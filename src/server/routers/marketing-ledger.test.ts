/**
 * @vitest-environment node
 *
 * The Campaign ledger and the on-demand refresh through the tRPC caller
 * (#1018). The tenancy guard runs for REAL against a stubbed
 * `clientReadUncached.fetch`, so a foreign Campaign id is refused BY THE GUARD
 * and the ledger read is asserted never to have happened. The snapshot engine
 * is mocked at its module boundary; what it does with real dependencies is
 * `src/lib/marketing/snapshots/engine.test.ts`.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  tenantRead: vi.fn(),
  getCampaignLedger: vi.fn(),
  getOrganizersByConference: vi.fn(),
  chargeSnapshotRefresh: vi.fn(),
  runConferenceSnapshots: vi.fn(),
  snapshotDeps: vi.fn(() => ({ fake: true })),
  conferenceOrgId: vi.fn(async () => 'org-A'),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch: vi.fn(), fetch: vi.fn() },
  clientReadUncached: { fetch: h.tenantRead },
}))
vi.mock('@/lib/marketing/sanity', () => ({
  commitSeedPlan: vi.fn(),
  getPlanView: vi.fn(),
  getCampaignLedger: h.getCampaignLedger,
  getTaskEditorData: vi.fn(),
  isConferenceOrganizer: vi.fn(),
  setPlanOwner: vi.fn(),
  setTaskDate: vi.fn(),
  updateTaskFields: vi.fn(),
  approveTask: vi.fn(),
  deleteTask: vi.fn(),
}))
vi.mock('@/lib/marketing/snapshots', () => ({
  chargeSnapshotRefresh: h.chargeSnapshotRefresh,
  runConferenceSnapshots: h.runConferenceSnapshots,
  snapshotDeps: h.snapshotDeps,
  conferenceOrgId: h.conferenceOrgId,
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getOrganizersByConference: h.getOrganizersByConference,
}))
vi.mock('@/lib/marketing/ceiling-check', () => ({
  channelCeilingWarnings: vi.fn(async () => []),
  ceilingWarningsFor: vi.fn(async () => []),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import type {
  LedgerSnapshot,
  StoredCampaignLedger,
} from '@/lib/marketing/types'
import { marketingRouter } from './marketing'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'
const CONF_B = 'conf-B'

const TENANTS: Record<string, { _type: string; conferenceId: string }> = {
  'camp-ours': { _type: 'marketingCampaign', conferenceId: CONF_A },
  'camp-theirs': { _type: 'marketingCampaign', conferenceId: CONF_B },
  'task-ours': { _type: 'marketingTask', conferenceId: CONF_A },
}

function ctx(): Context {
  const speaker = { _id: 'sp-admin', name: 'Admin', organizerOrgIds: [ORG_A] }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const marketing = () => t.createCallerFactory(marketingRouter)(ctx())

const CONFERENCE = {
  _id: CONF_A,
  organization: { _ref: ORG_A },
  title: 'Cloud Native Bergen 2027',
  domains: ['cloudnativebergen.dev'],
}

function snapshot(overrides: Partial<LedgerSnapshot> = {}): LedgerSnapshot {
  return {
    date: '2027-01-14',
    measuredWindow: null,
    measuredOutcome: null,
    measuredBeforeReseed: false,
    takenAt: '2027-01-15T04:00:00.000Z',
    source: { posthog: 'ok', bluesky: 'ok' },
    primaryValue: 42,
    primaryAttributed: true,
    primaryAttributedValue: null,
    secondary: {
      attributedSessions: 42,
      checkoutClickThrough: 6,
      blueskyInteractions: 11,
    },
    perTask: [
      { taskId: 'task-ours', sessions: 42, clicks: 6, blueskyInteractions: 11 },
    ],
    ...overrides,
  }
}

function ledger(
  overrides: Partial<StoredCampaignLedger> = {},
): StoredCampaignLedger {
  return {
    campaign: {
      _id: 'camp-ours',
      key: 'cfp',
      title: 'Call for papers',
      startDate: '2027-01-10',
      endDate: '2027-03-01',
      provisional: false,
      startMilestone: 'CFP_OPEN',
      endMilestone: 'CFP_CLOSE',
      primaryOutcome: 'attributedSessions',
      outcomeTargetPage: '/cfp',
      target: 100,
      optional: false,
    },
    tasks: [
      {
        _id: 'task-ours',
        campaignId: 'camp-ours',
        key: 'cfp:launch:bluesky',
        title: 'CFP is open',
        kind: 'publishing',
        channel: 'bluesky',
        date: '2027-01-10T18:00:00.000Z',
        provisional: false,
        milestone: 'CFP_OPEN',
        status: 'published',
        complete: true,
        prerequisiteIds: [],
        variantId: 'variant-1',
        assigneeId: 'sp-1',
        approvedAt: '2027-01-09T10:00:00.000Z',
      },
    ],
    snapshot: snapshot(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({ conference: CONFERENCE, error: null })
  h.getCampaignLedger.mockResolvedValue(ledger())
  h.getOrganizersByConference.mockResolvedValue({
    speakers: [{ _id: 'sp-1', name: 'Ada' }],
  })
  h.chargeSnapshotRefresh.mockResolvedValue(true)
  h.runConferenceSnapshots.mockResolvedValue({
    conferenceId: CONF_A,
    date: '2027-01-14',
    written: 3,
    source: { posthog: 'ok', bluesky: 'ok' },
    notes: [],
  })
  h.tenantRead.mockImplementation(
    async (_query: string, params: { id?: string }) => {
      const tenant = params?.id ? TENANTS[params.id] : undefined
      if (!tenant) return null
      return {
        _type: tenant._type,
        orgId: null,
        conferenceId: tenant.conferenceId,
        conferenceOrgId: tenant.conferenceId === CONF_A ? ORG_A : 'org-B',
        memberOrgIds: [],
      }
    },
  )
})

describe('campaign.get — the ledger read', () => {
  it('returns the Campaign, its Tasks, the stored reading and the organizer roster', async () => {
    const result = await marketing().campaign.get({ campaignId: 'camp-ours' })

    expect(h.getCampaignLedger).toHaveBeenCalledWith('camp-ours', CONF_A)
    expect(result.campaign.title).toBe('Call for papers')
    expect(result.campaign.target).toBe(100)
    expect(result.campaign.outcomeTargetPage).toBe('/cfp')
    expect(result.tasks).toHaveLength(1)
    expect(result.snapshot?.primaryValue).toBe(42)
    expect(result.snapshot?.perTask).toEqual([
      { taskId: 'task-ours', sessions: 42, clicks: 6, blueskyInteractions: 11 },
    ])
    // The roster is returned ONCE so the Task table shows names without a
    // read per row.
    expect(result.organizers).toEqual([{ _id: 'sp-1', name: 'Ada' }])
  })

  it('reports the previous-edition comparison as unavailable rather than inventing one', async () => {
    const result = await marketing().campaign.get({ campaignId: 'camp-ours' })
    expect(result.previousEdition).toBeNull()
  })

  it('returns a ledger with no reading yet, rather than zeros', async () => {
    h.getCampaignLedger.mockResolvedValue(ledger({ snapshot: null }))
    const result = await marketing().campaign.get({ campaignId: 'camp-ours' })
    expect(result.snapshot).toBeNull()
    expect(result.tasks).toHaveLength(1)
  })

  it('keeps an unavailable source as null, never as a zero', async () => {
    h.getCampaignLedger.mockResolvedValue(
      ledger({
        snapshot: snapshot({
          source: { posthog: 'unavailable', bluesky: 'ok' },
          primaryValue: null,
          secondary: {
            attributedSessions: null,
            checkoutClickThrough: null,
            blueskyInteractions: 11,
          },
          perTask: [
            {
              taskId: 'task-ours',
              sessions: null,
              clicks: null,
              blueskyInteractions: 11,
            },
          ],
        }),
      }),
    )
    const result = await marketing().campaign.get({ campaignId: 'camp-ours' })
    expect(result.snapshot?.primaryValue).toBeNull()
    expect(result.snapshot?.source.posthog).toBe('unavailable')
    expect(result.snapshot?.perTask[0].sessions).toBeNull()
  })

  it('carries the not-attributed label through to the ledger', async () => {
    h.getCampaignLedger.mockResolvedValue(
      ledger({
        snapshot: snapshot({ primaryAttributed: false, primaryValue: 18 }),
      }),
    )
    const result = await marketing().campaign.get({ campaignId: 'camp-ours' })
    expect(result.snapshot?.primaryAttributed).toBe(false)
  })
})

describe('campaign.get — tenancy', () => {
  it("refuses another conference's Campaign WITHOUT reading it", async () => {
    await expect(
      marketing().campaign.get({ campaignId: 'camp-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getCampaignLedger).not.toHaveBeenCalled()
  })

  it('refuses an id of the wrong type, and a nonexistent one, the same way', async () => {
    await expect(
      marketing().campaign.get({ campaignId: 'task-ours' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      marketing().campaign.get({ campaignId: 'camp-nobody' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getCampaignLedger).not.toHaveBeenCalled()
  })

  it('is NOT_FOUND when the guard passes but the read comes back empty', async () => {
    h.getCampaignLedger.mockResolvedValue(null)
    await expect(
      marketing().campaign.get({ campaignId: 'camp-ours' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('refreshSnapshots', () => {
  it('runs the engine for the request conference and reports what it wrote', async () => {
    const result = await marketing().refreshSnapshots()

    expect(h.conferenceOrgId).toHaveBeenCalledWith(CONF_A)
    expect(h.runConferenceSnapshots).toHaveBeenCalledTimes(1)
    expect(h.runConferenceSnapshots.mock.calls[0][0]).toBe(CONF_A)
    expect(result).toMatchObject({
      date: '2027-01-14',
      written: 3,
      source: { posthog: 'ok', bluesky: 'ok' },
    })
  })

  it('CHARGES the per-conference budget before doing any work', async () => {
    h.chargeSnapshotRefresh.mockResolvedValue(false)
    await expect(marketing().refreshSnapshots()).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    })
    expect(h.runConferenceSnapshots).not.toHaveBeenCalled()
    expect(h.chargeSnapshotRefresh).toHaveBeenCalledWith(CONF_A)
  })

  it('surfaces the sources the run could not read', async () => {
    h.runConferenceSnapshots.mockResolvedValue({
      conferenceId: CONF_A,
      date: '2027-01-14',
      written: 3,
      source: { posthog: 'unavailable', bluesky: 'ok' },
      notes: ['posthog: rate-limited — slow down'],
    })
    const result = await marketing().refreshSnapshots()
    expect(result.source.posthog).toBe('unavailable')
    expect(result.notes).toContain('posthog: rate-limited — slow down')
  })

  it('says so when the edition has no plan to snapshot', async () => {
    h.runConferenceSnapshots.mockResolvedValue({
      conferenceId: CONF_A,
      date: '2027-01-14',
      written: 0,
      skipped: 'no plan',
      source: { posthog: 'unavailable', bluesky: 'unavailable' },
      notes: [],
    })
    expect(await marketing().refreshSnapshots()).toMatchObject({
      written: 0,
      skipped: 'no plan',
    })
  })
})
