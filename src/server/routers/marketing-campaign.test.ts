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
  tree: vi.fn(),
  deleteTree: vi.fn(),
  readCampaign: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  getPlanId: vi.fn(),
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
vi.mock('@/lib/marketing/deletion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/marketing/deletion')>()),
  readDeletionTree: h.tree,
  deletePlanTree: h.deleteTree,
}))
vi.mock('@/lib/marketing/editing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/marketing/editing')>()),
  readCampaignForEditing: h.readCampaign,
  createCampaign: h.createCampaign,
  updateCampaign: h.updateCampaign,
}))
vi.mock('@/lib/marketing/sanity', () => ({
  getPlanId: h.getPlanId,
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

import type { DeletionTree } from '@/lib/marketing/deletion/types'
import type { VariantStatus } from '@/lib/social/types'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import type {
  LedgerSnapshot,
  StoredCampaignLedger,
} from '@/lib/marketing/types'
import { libraryEntry } from '@/lib/marketing/library'
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
  cfpStartDate: '2027-01-01',
  cfpEndDate: '2027-02-01',
  cfpNotifyDate: '2027-03-01',
  programDate: '2027-04-01',
  startDate: '2027-06-01',
  endDate: '2027-06-02',
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
  h.readCampaign.mockResolvedValue({
    _id: 'camp-ours',
    _rev: 'rev',
    planId: 'plan',
    key: 'cfp',
    title: 'CFP',
    primaryOutcome: 'cfpSubmissions',
    startMilestone: 'CFP_OPEN',
    startOffsetDays: 0,
    endMilestone: 'CFP_CLOSE',
    endOffsetDays: 0,
  })
  h.tree.mockResolvedValue({
    plan: { _id: 'plan', _rev: 'p' },
    campaigns: [{ _id: 'camp-ours', _rev: 'c', key: 'cfp' }],
    tasks: [],
    snapshots: 9,
    strongOwnerRefs: 0,
    danglingPrerequisites: 0,
    heldMedia: 0,
    unpreservedSnapshots: 0,
    draftOnlyRecords: 0,
  } satisfies DeletionTree)
  h.deleteTree.mockResolvedValue(true)
  h.getPlanId.mockResolvedValue('plan')
  h.createCampaign.mockResolvedValue(true)
  h.updateCampaign.mockResolvedValue(true)
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

const window = {
  startMilestone: 'CFP_OPEN' as const,
  startOffsetDays: 10,
  endMilestone: 'EARLY_BIRD_END' as const,
  endOffsetDays: 0,
}
describe('Campaign structural editing', () => {
  it('creates server-scoped custom keys and materialized windows', async () => {
    await marketing().campaign.create({
      title: 'New campaign',
      primaryOutcome: 'cfpSubmissions',
      window,
      target: 0,
    })
    expect(h.createCampaign.mock.calls[0][0]).toMatchObject({
      conferenceId: CONF_A,
      planId: 'plan',
      title: 'New campaign',
      startDate: '2027-01-11',
      endDate: '2027-04-01',
      provisional: true,
      target: 0,
      triggers: [],
      optional: false,
    })
    expect(h.createCampaign.mock.calls[0][0].key).toMatch(
      /^custom-[0-9a-f-]{36}$/,
    )
  })
  it('stores the optional flag on create and on update, so a saved Template can ask', async () => {
    await marketing().campaign.create({
      title: 'Side event',
      primaryOutcome: 'cfpSubmissions',
      window,
      optional: true,
    })
    expect(h.createCampaign.mock.calls[0][0].optional).toBe(true)
    await marketing().campaign.update({
      campaignId: 'camp-ours',
      rev: 'rev',
      optional: true,
    })
    expect(h.updateCampaign.mock.calls[0][3]).toEqual({ optional: true })
  })
  it('opens the editor with the Library Recipes the Campaign carries, as edits', async () => {
    const entry = libraryEntry('speakerCard')
    h.readCampaign.mockResolvedValue({
      ...(await h.readCampaign()),
      optional: true,
      recipes: [
        { key: 'cfpOpen:bluesky', beat: 'cfpOpen', kind: 'publishing' },
        ...entry.recipes.map((r) => ({ ...r, title: `${r.title}!` })),
      ],
    })
    const editing = await marketing().campaign.editing({
      campaignId: 'camp-ours',
    })
    expect(editing.optional).toBe(true)
    expect(editing.attached.map((a) => [a.entry, a.edits.title])).toEqual([
      ['speakerCard', 'Speaker card!'],
    ])
    expect(editing).not.toHaveProperty('recipes')
  })
  it('rejects a client-provided campaign key rather than silently accepting it', async () => {
    await expect(
      marketing().campaign.update({
        campaignId: 'camp-ours',
        rev: 'rev',
        key: 'other',
      } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      marketing().campaign.create({
        title: 'New',
        primaryOutcome: 'cfpSubmissions',
        window,
        key: 'other',
      } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
  it('rematerializes the exact window and warns about measurement', async () => {
    const result = await marketing().campaign.update({
      campaignId: 'camp-ours',
      rev: 'rev',
      window,
    })
    expect(h.updateCampaign).toHaveBeenCalledWith(
      'camp-ours',
      'rev',
      'plan',
      expect.objectContaining({
        startDate: '2027-01-11',
        endDate: '2027-04-01',
        provisional: true,
      }),
    )
    expect(result.measurementWarning).toContain('future Snapshots')
  })
  it('refuses a foreign Campaign before reading or mutating it', async () => {
    await expect(
      marketing().campaign.update({
        campaignId: 'camp-theirs',
        rev: 'rev',
        title: 'Changed',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.readCampaign).not.toHaveBeenCalled()
    expect(h.updateCampaign).not.toHaveBeenCalled()
  })
  it('rejects foreign conference injection on creation before reading the plan', async () => {
    await expect(
      marketing().campaign.create({
        title: 'New',
        primaryOutcome: 'cfpSubmissions',
        window,
        conferenceId: CONF_B,
      } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.getPlanId).not.toHaveBeenCalled()
  })
  it('nullable fields clear while absent fields do not overwrite', async () => {
    const result = await marketing().campaign.update({
      campaignId: 'camp-ours',
      rev: 'rev',
      target: null,
      outcomeTargetPage: null,
    })
    expect(h.updateCampaign).toHaveBeenCalledWith('camp-ours', 'rev', 'plan', {
      target: null,
      outcomeTargetPage: null,
    })
    expect(result.measurementWarning).toBeNull()
  })
})

describe('Campaign cascade gates', () => {
  const treeWith = (status: VariantStatus): DeletionTree => ({
    plan: { _id: 'plan', _rev: 'p' },
    campaigns: [{ _id: 'camp-ours', _rev: 'c', key: 'cfp' }],
    tasks: [
      {
        _id: 't',
        _rev: 't-rev',
        shortCode: null,
        variant: {
          _id: 'v',
          _rev: 'v-rev',
          shortCode: null,
          status,
          postId: 'post',
          ownPost: true,
          siblingVariantIds: [],
          survivingTaskIds: [],
        },
        survivingDependantIds: [],
        hasDraftTwin: false,
      },
    ],
    snapshots: 9,
    unpreservedSnapshots: 0,
    draftOnlyRecords: 0,
    danglingPrerequisites: 0,
    heldMedia: 0,
    strongOwnerRefs: 0,
  })
  it('computes all counts and typed-gate decision from the same read', async () => {
    h.tree.mockResolvedValue(treeWith('published'))
    expect(
      await marketing().campaign.deletionPreview({ campaignId: 'camp-ours' }),
    ).toEqual({
      campaigns: 1,
      tasks: 1,
      publishedTasks: 1,
      snapshots: 9,
      requiresTypedConfirmation: true,
      conferenceTitle: CONFERENCE.title,
    })
    expect(h.tree).toHaveBeenCalledTimes(1)
  })
  it('refuses foreign delete and preview before reading the tree', async () => {
    await expect(
      marketing().campaign.delete({ campaignId: 'camp-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      marketing().campaign.deletionPreview({ campaignId: 'camp-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.tree).not.toHaveBeenCalled()
    expect(h.deleteTree).not.toHaveBeenCalled()
  })
  it('refuses publishing before preview and again on acceptance', async () => {
    h.tree.mockResolvedValue(treeWith('publishing'))
    await expect(
      marketing().campaign.deletionPreview({ campaignId: 'camp-ours' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The post is being published right now. Try again in a minute.',
    })
    await expect(
      marketing().campaign.delete({
        campaignId: 'camp-ours',
        confirmTitle: CONFERENCE.title,
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The post is being published right now. Try again in a minute.',
    })
  })
  it('enforces the typed gate on direct mutation calls and allows exact confirmation', async () => {
    h.tree.mockResolvedValue(treeWith('published'))
    await expect(
      marketing().campaign.delete({
        campaignId: 'camp-ours',
        confirmTitle: 'wrong',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Type the conference title to confirm deletion.',
    })
    expect(
      await marketing().campaign.delete({
        campaignId: 'camp-ours',
        confirmTitle: CONFERENCE.title,
      }),
    ).toEqual({ success: true })
    expect(h.deleteTree).toHaveBeenCalledWith({
      conferenceId: CONF_A,
      tree: treeWith('published'),
      deletePlan: false,
    })
  })
  it('deletes awaiting-manual without a typed title', async () => {
    h.tree.mockResolvedValue(treeWith('awaiting-manual'))
    expect(
      await marketing().campaign.delete({ campaignId: 'camp-ours' }),
    ).toEqual({ success: true })
  })
})

it('refuses an update with no loaded revision rather than overwriting blind', async () => {
  // An omitted `rev` used to skip the guard AND bind the write to the revision
  // the server had just read — a plain read-then-write that silently discards a
  // concurrent edit. The editor's mounted-copy latch exists precisely to stop
  // that, and one missing field defeated it, so the field is now required.
  await expect(
    marketing().campaign.update({
      campaignId: 'camp-ours',
      title: 'Updated',
    } as unknown as Parameters<
      ReturnType<typeof marketing>['campaign']['update']
    >[0]),
  ).rejects.toThrow(/rev/)
  expect(h.updateCampaign).not.toHaveBeenCalled()
})

it('writes against the revision the caller loaded', async () => {
  await marketing().campaign.update({
    campaignId: 'camp-ours',
    rev: 'rev',
    title: 'Updated',
  })
  expect(h.updateCampaign).toHaveBeenCalledWith('camp-ours', 'rev', 'plan', {
    title: 'Updated',
  })
})
