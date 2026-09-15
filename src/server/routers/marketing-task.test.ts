/**
 * @vitest-environment node
 *
 * The Task editor through the tRPC caller (#1012): approve, link derivation
 * on save (in `social.updateVariant` with a Task context), completion and
 * skip, assignee and Prerequisite rules, the delete cascade and its
 * refusals, tenancy. Persistence is mocked at `@/lib/marketing/sanity` and
 * `@/lib/social/sanity`; the tenancy guard runs for REAL against a stubbed
 * `clientReadUncached.fetch`, so a foreign id is refused by the guard, and
 * the persistence read is asserted never to have happened.
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
  getTaskEditorData: vi.fn(),
  getTaskLinkInputs: vi.fn(),
  getTaskForVariant: vi.fn(),
  isConferenceOrganizer: vi.fn(),
  updateTaskFields: vi.fn(),
  approveTask: vi.fn(),
  setTaskDate: vi.fn(),
  deleteTask: vi.fn(),
  getSocialVariantEditorData: vi.fn(),
  getSocialPostVariant: vi.fn(),
  getSocialPostDefaultTime: vi.fn(),
  getSocialPostEditorInputs: vi.fn(),
  updateSocialVariantContent: vi.fn(),
  scheduleIssues: vi.fn(),
  getOrganizersByConference: vi.fn(),
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
  getTaskEditorData: h.getTaskEditorData,
  getTaskLinkInputs: h.getTaskLinkInputs,
  getTaskForVariant: h.getTaskForVariant,
  isConferenceOrganizer: h.isConferenceOrganizer,
  updateTaskFields: h.updateTaskFields,
  approveTask: h.approveTask,
  setTaskDate: h.setTaskDate,
  deleteTask: h.deleteTask,
}))
vi.mock('@/lib/social/sanity', () => ({
  getSocialVariantEditorData: h.getSocialVariantEditorData,
  getSocialPostVariant: h.getSocialPostVariant,
  getSocialPostDefaultTime: h.getSocialPostDefaultTime,
  getSocialPostEditorInputs: h.getSocialPostEditorInputs,
  updateSocialVariantContent: h.updateSocialVariantContent,
  createSocialPost: vi.fn(),
  deleteSocialPost: vi.fn(),
  updateSocialPostDefaultTime: vi.fn(),
  listSocialPostVariants: vi.fn(),
  sanitySocialVariantStore: { transition: vi.fn() },
  addSocialPostAttachment: vi.fn(),
}))
vi.mock('@/lib/social/schedule-check', () => ({
  scheduleIssues: h.scheduleIssues,
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getOrganizersByConference: h.getOrganizersByConference,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import type {
  StoredTaskEditorData,
  TaskEditorTask,
  TaskView,
} from '@/lib/marketing/types'
import type { SocialVariantEditorData } from '@/lib/social/types'
import { marketingRouter } from './marketing'
import { socialRouter } from './social'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'
const CONF_B = 'conf-B'
const ADMIN_ID = 'sp-admin'

const TENANTS: Record<string, { _type: string; conferenceId: string }> = {
  'task-ours': { _type: 'marketingTask', conferenceId: CONF_A },
  'task-check': { _type: 'marketingTask', conferenceId: CONF_A },
  'task-theirs': { _type: 'marketingTask', conferenceId: CONF_B },
  'variant-ours': { _type: 'socialPostVariant', conferenceId: CONF_A },
}

function ctx(orgId: string = ORG_A): Context {
  const speaker = { _id: ADMIN_ID, name: 'Admin', organizerOrgIds: [orgId] }
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
const social = () => t.createCallerFactory(socialRouter)(ctx())

const CONFERENCE = {
  _id: CONF_A,
  organization: { _ref: ORG_A },
  title: 'Cloud Native Bergen 2027',
  domains: ['cloudnativebergen.dev'],
}

function view(overrides: Partial<TaskView> = {}): TaskView {
  return {
    _id: 'task-ours',
    campaignId: 'camp-A',
    key: 'cfpOpen:linkedin',
    title: 'CFP open',
    kind: 'publishing',
    channel: 'linkedin',
    date: '2027-01-10T07:00:00.000Z',
    provisional: false,
    milestone: 'CFP_OPEN',
    status: 'draft',
    complete: false,
    prerequisiteIds: [],
    variantId: 'variant-ours',
    assigneeId: 'sp-1',
    approvedAt: null,
    ...overrides,
  }
}

function editorTask(overrides: Partial<TaskEditorTask> = {}): TaskEditorTask {
  return {
    ...view(),
    _rev: 'rev-task',
    approvedByName: null,
    assigneeName: 'Ada',
    targetPage: '/cfp',
    instructions: null,
    externalUrl: null,
    skipReason: null,
    subject: null,
    assetUrl: null,
    origin: 'template',
    ...overrides,
  }
}

function variantData(
  overrides: Partial<SocialVariantEditorData['variant']> = {},
): SocialVariantEditorData {
  return {
    variant: {
      _id: 'variant-ours',
      _rev: 'rev-v',
      postId: 'post-ours',
      conferenceId: CONF_A,
      orgId: ORG_A,
      platform: 'linkedin',
      body: 'CFP is open',
      status: 'draft',
      scheduledAt: '2027-01-10T07:00:00.000Z',
      usesCustomTime: false,
      claimedAt: null,
      link: 'https://cloudnativebergen.dev/cfp?utm_source=linkedin',
      attachments: [],
      publishResult: null,
      attempts: [],
      attemptCount: 0,
      ...overrides,
    },
    post: { attachments: [], defaultScheduledAt: '2027-01-10T07:00:00.000Z' },
  }
}

function stored(
  task: Partial<TaskEditorTask> = {},
  siblings: TaskView[] = [],
): StoredTaskEditorData {
  return {
    task: editorTask(task),
    campaign: { _id: 'camp-A', key: 'cfp', title: 'CFP' },
    planOwnerId: 'sp-1',
    siblings,
    variant: null,
  }
}

const CHECKLIST = {
  _id: 'task-check',
  kind: 'checklist' as const,
  channel: null,
  status: 'open' as const,
  variantId: null,
  key: 'check',
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: CONFERENCE,
    domain: 'cloudnativebergen.dev',
    error: null,
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
  h.getTaskEditorData.mockResolvedValue(stored())
  h.getSocialVariantEditorData.mockResolvedValue(variantData())
  h.getSocialPostVariant.mockResolvedValue(variantData().variant)
  h.getSocialPostDefaultTime.mockResolvedValue('2027-01-10T07:00:00.000Z')
  h.getSocialPostEditorInputs.mockResolvedValue({
    attachments: [],
    defaultScheduledAt: '2027-01-10T07:00:00.000Z',
    rev: 'rev-post',
  })
  h.scheduleIssues.mockResolvedValue([])
  h.updateTaskFields.mockResolvedValue(true)
  h.approveTask.mockResolvedValue(true)
  h.setTaskDate.mockResolvedValue(true)
  h.deleteTask.mockResolvedValue(true)
  h.updateSocialVariantContent.mockResolvedValue(true)
  h.isConferenceOrganizer.mockResolvedValue(true)
  h.getTaskForVariant.mockResolvedValue(null)
  h.getOrganizersByConference.mockResolvedValue({
    speakers: [{ _id: 'sp-1', name: 'Ada' }],
    err: null,
  })
  h.getTaskLinkInputs.mockResolvedValue({
    kind: 'publishing',
    channel: 'linkedin',
    taskKey: 'cfpOpen:linkedin',
    campaignKey: 'cfp',
    variantId: 'variant-ours',
  })
})

describe('marketing.task.get', () => {
  it('returns the Task with its variant, the derived tagged link, the page picker and the roster', async () => {
    const data = await marketing().task.get({ taskId: 'task-ours' })
    expect(h.getTaskEditorData).toHaveBeenCalledWith('task-ours', CONF_A)
    expect(data.variant?.variant._id).toBe('variant-ours')
    expect(data.baseUrl).toBe('https://cloudnativebergen.dev')
    expect(data.taggedLink).toBe(
      'https://cloudnativebergen.dev/cfp?utm_source=linkedin&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Alinkedin',
    )
    expect(data.pages.map((p) => p.path)).toContain('/tickets')
    expect(data.organizers).toEqual([{ _id: 'sp-1', name: 'Ada' }])
  })

  it('refuses a Task of another conference BEFORE reading it', async () => {
    await expect(
      marketing().task.get({ taskId: 'task-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getTaskEditorData).not.toHaveBeenCalled()
  })

  it('has no link for a non-publishing Task', async () => {
    h.getTaskEditorData.mockResolvedValue(stored(CHECKLIST))
    const data = await marketing().task.get({ taskId: 'task-check' })
    expect(data.taggedLink).toBeNull()
    expect(data.variant).toBeNull()
    expect(h.getSocialVariantEditorData).not.toHaveBeenCalled()
  })
})

describe('marketing.task.approve', () => {
  it('moves the variant draft → scheduled and records the approval, in one call', async () => {
    const result = await marketing().task.approve({ taskId: 'task-ours' })
    expect(result).toEqual({ success: true })
    expect(h.approveTask).toHaveBeenCalledWith({
      taskId: 'task-ours',
      taskRev: 'rev-task',
      by: ADMIN_ID,
      at: expect.any(String),
      variant: {
        id: 'variant-ours',
        rev: 'rev-v',
        scheduledAt: '2027-01-10T07:00:00.000Z',
      },
    })
  })

  it('approves although a Prerequisite is still open (never a block)', async () => {
    h.getTaskEditorData.mockResolvedValue(
      stored({ prerequisiteIds: ['task-render'] }, [
        view({ _id: 'task-render', kind: 'studioRender', status: 'open' }),
      ]),
    )
    await expect(
      marketing().task.approve({ taskId: 'task-ours' }),
    ).resolves.toEqual({ success: true })
  })

  it('validates the variant the way scheduling does and refuses on an issue', async () => {
    h.scheduleIssues.mockResolvedValue([{ field: 'body', message: 'too long' }])
    await expect(
      marketing().task.approve({ taskId: 'task-ours' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'body: too long' })
    expect(h.approveTask).not.toHaveBeenCalled()
  })

  it('refuses a variant that is not a draft — including failed, whose retry is not an approval', async () => {
    for (const status of ['scheduled', 'failed'] as const) {
      h.getSocialVariantEditorData.mockResolvedValue(variantData({ status }))
      await expect(
        marketing().task.approve({ taskId: 'task-ours' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /approved/ })
    }
    expect(h.approveTask).not.toHaveBeenCalled()
  })

  it('falls back to the post default time and refuses without any time', async () => {
    h.getSocialVariantEditorData.mockResolvedValue(
      variantData({ scheduledAt: null }),
    )
    await marketing().task.approve({ taskId: 'task-ours' })
    expect(h.approveTask.mock.calls[0][0].variant.scheduledAt).toBe(
      '2027-01-10T07:00:00.000Z',
    )
    h.getSocialPostDefaultTime.mockResolvedValue(null)
    await expect(
      marketing().task.approve({ taskId: 'task-ours' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /time/ })
  })

  it('approves a post again after it was pulled back to draft, and requires a target page', async () => {
    h.getTaskEditorData.mockResolvedValue(
      stored({ approvedAt: '2026-09-01T00:00:00.000Z' }),
    )
    await expect(
      marketing().task.approve({ taskId: 'task-ours' }),
    ).resolves.toEqual({ success: true })
    h.getTaskEditorData.mockResolvedValue(stored({ targetPage: null }))
    await expect(
      marketing().task.approve({ taskId: 'task-ours' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /target page/ })
    expect(h.approveTask).toHaveBeenCalledTimes(1)
  })

  it('never follows a foreign variant: a publishing Task whose variant id was gated away has nothing to approve', async () => {
    h.getTaskEditorData.mockResolvedValue(stored({ variantId: null }))
    await expect(
      marketing().task.approve({ taskId: 'task-ours' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    expect(h.getSocialVariantEditorData).not.toHaveBeenCalled()
  })

  it('records approval alone on a non-publishing Task and refuses a second approval', async () => {
    h.getTaskEditorData.mockResolvedValue(stored(CHECKLIST))
    await marketing().task.approve({ taskId: 'task-check' })
    expect(h.approveTask.mock.calls[0][0]).toMatchObject({ variant: null })
    h.getTaskEditorData.mockResolvedValue(
      stored({ ...CHECKLIST, approvedAt: '2026-09-01T00:00:00.000Z' }),
    )
    await expect(
      marketing().task.approve({ taskId: 'task-check' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /already/ })
  })

  it('does not approve a done or skipped non-publishing Task', async () => {
    for (const status of ['done', 'skipped'] as const) {
      h.getTaskEditorData.mockResolvedValue(stored({ ...CHECKLIST, status }))
      await expect(
        marketing().task.approve({ taskId: 'task-check' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /not approved/ })
    }
    expect(h.approveTask).not.toHaveBeenCalled()
  })

  it('surfaces a lost compare-and-set as CONFLICT', async () => {
    h.approveTask.mockResolvedValue(false)
    await expect(
      marketing().task.approve({ taskId: 'task-ours' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('link derivation on save (social.updateVariant with a Task context)', () => {
  const save = (targetPage: string) =>
    social().updateVariant({
      variantId: 'variant-ours',
      rev: 'rev-v',
      body: 'CFP is open',
      link: 'https://evil.example/ignored',
      attachments: [],
      timing: { mode: 'default' },
      task: { taskId: 'task-ours', rev: 'rev-task', targetPage },
    })

  it('derives the tagged link from Channel, Campaign and Task and writes it with the page', async () => {
    await save('/tickets')
    expect(h.updateSocialVariantContent).toHaveBeenCalledWith(
      'variant-ours',
      expect.objectContaining({
        link: 'https://cloudnativebergen.dev/tickets?utm_source=linkedin&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Alinkedin',
      }),
      expect.objectContaining({
        ifRevision: 'rev-v',
        task: { id: 'task-ours', rev: 'rev-task', targetPage: '/tickets' },
      }),
    )
  })

  it('keeps the stored tagged link when a Task-owned variant is saved without a Task context', async () => {
    h.getTaskForVariant.mockResolvedValue('task-ours')
    await social().updateVariant({
      variantId: 'variant-ours',
      rev: 'rev-v',
      body: 'CFP is open',
      link: 'https://evil.example/replaced',
      attachments: [],
      timing: { mode: 'default' },
    })
    expect(h.updateSocialVariantContent.mock.calls[0][1].link).toBe(
      'https://cloudnativebergen.dev/cfp?utm_source=linkedin',
    )
    // An unowned variant takes the typed link as before.
    h.getTaskForVariant.mockResolvedValue(null)
    await social().updateVariant({
      variantId: 'variant-ours',
      rev: 'rev-v',
      body: 'CFP is open',
      link: 'https://example.com/free',
      attachments: [],
      timing: { mode: 'default' },
    })
    expect(h.updateSocialVariantContent.mock.calls[1][1].link).toBe(
      'https://example.com/free',
    )
  })

  it('refuses a page that leaves our domain, and a malformed path', async () => {
    await expect(save('//evil.example')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(save('tickets')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('refuses a Task that does not own this variant', async () => {
    h.getTaskLinkInputs.mockResolvedValue({
      kind: 'publishing',
      channel: 'linkedin',
      taskKey: 'x',
      campaignKey: 'cfp',
      variantId: 'variant-other',
    })
    await expect(save('/tickets')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: /does not belong/,
    })
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('refuses a foreign Task before reading it', async () => {
    await expect(
      social().updateVariant({
        variantId: 'variant-ours',
        rev: 'rev-v',
        body: 'x',
        link: null,
        attachments: [],
        timing: { mode: 'default' },
        task: {
          taskId: 'task-theirs',
          rev: 'rev-task',
          targetPage: '/tickets',
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getTaskLinkInputs).not.toHaveBeenCalled()
  })
})

describe('completion and skip', () => {
  it('ticks a checklist done', async () => {
    h.getTaskEditorData.mockResolvedValue(stored(CHECKLIST))
    await marketing().task.complete({ taskId: 'task-check' })
    expect(h.updateTaskFields).toHaveBeenCalledWith('task-check', 'rev-task', {
      status: 'done',
    })
  })

  it('ticks an event-page update done with its optional URL', async () => {
    h.getTaskEditorData.mockResolvedValue(
      stored({ ...CHECKLIST, kind: 'eventPageUpdate' }),
    )
    await marketing().task.complete({
      taskId: 'task-check',
      externalUrl: 'https://example.com/event',
    })
    expect(h.updateTaskFields.mock.calls[0][2]).toEqual({
      status: 'done',
      externalUrl: 'https://example.com/event',
    })
  })

  it('ignores a pasted URL on a checklist', async () => {
    h.getTaskEditorData.mockResolvedValue(stored(CHECKLIST))
    await marketing().task.complete({
      taskId: 'task-check',
      externalUrl: 'https://example.com/x',
    })
    expect(h.updateTaskFields.mock.calls[0][2]).toEqual({ status: 'done' })
  })

  it('refuses to tick a Kind with its own completion rule, or a Task that is not open', async () => {
    h.getTaskEditorData.mockResolvedValue(
      stored({ ...CHECKLIST, kind: 'studioRender' }),
    )
    await expect(
      marketing().task.complete({ taskId: 'task-check' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    h.getTaskEditorData.mockResolvedValue(
      stored({ ...CHECKLIST, status: 'skipped' }),
    )
    await expect(
      marketing().task.complete({ taskId: 'task-check' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.updateTaskFields).not.toHaveBeenCalled()
  })

  it('skips with the reason, and only an open non-publishing Task', async () => {
    h.getTaskEditorData.mockResolvedValue(stored(CHECKLIST))
    await marketing().task.skip({
      taskId: 'task-check',
      reason: 'Not this year',
    })
    expect(h.updateTaskFields).toHaveBeenCalledWith('task-check', 'rev-task', {
      status: 'skipped',
      skipReason: 'Not this year',
    })
    await expect(
      marketing().task.skip({ taskId: 'task-check', reason: '   ' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    h.getTaskEditorData.mockResolvedValue(stored())
    await expect(
      marketing().task.skip({ taskId: 'task-ours', reason: 'x' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('surfaces a lost compare-and-set as CONFLICT', async () => {
    h.getTaskEditorData.mockResolvedValue(stored(CHECKLIST))
    h.updateTaskFields.mockResolvedValue(false)
    await expect(
      marketing().task.complete({ taskId: 'task-check' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('marketing.task.update', () => {
  it('sets the fields given, clears the ones set to null, on the loaded revision', async () => {
    await marketing().task.update({
      taskId: 'task-ours',
      rev: 'rev-loaded',
      title: 'CFP is open!',
      instructions: null,
      externalUrl: 'https://example.com/page',
    })
    expect(h.updateTaskFields).toHaveBeenCalledWith(
      'task-ours',
      'rev-loaded',
      { title: 'CFP is open!', externalUrl: 'https://example.com/page' },
      ['instructions'],
    )
    await expect(
      marketing().task.update({ taskId: 'task-ours', title: '' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    h.updateTaskFields.mockResolvedValue(false)
    await expect(
      marketing().task.update({ taskId: 'task-ours', title: 'x' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('assignee, prerequisites, date', () => {
  it('sets an organizer as assignee and refuses anyone else', async () => {
    await marketing().task.setAssignee({
      taskId: 'task-ours',
      assigneeId: 'sp-2',
    })
    expect(h.isConferenceOrganizer).toHaveBeenCalledWith(CONF_A, 'sp-2')
    expect(h.updateTaskFields.mock.calls[0][2]).toEqual({
      assignee: { _type: 'reference', _ref: 'sp-2', _weak: true },
    })
    h.isConferenceOrganizer.mockResolvedValue(false)
    await expect(
      marketing().task.setAssignee({ taskId: 'task-ours', assigneeId: 'sp-9' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('sets Prerequisites from the same Campaign only, never itself, never a loop', async () => {
    const siblings = [
      view({ _id: 'task-render', kind: 'studioRender', prerequisiteIds: [] }),
      view({
        _id: 'task-b',
        kind: 'checklist',
        prerequisiteIds: ['task-ours'],
      }),
    ]
    h.getTaskEditorData.mockResolvedValue(stored({}, siblings))
    await marketing().task.setPrerequisites({
      taskId: 'task-ours',
      rev: 'rev-loaded',
      prerequisiteIds: ['task-render'],
    })
    // The editor's loaded revision, not the one this request read.
    expect(h.updateTaskFields.mock.calls[0][1]).toBe('rev-loaded')
    expect(h.updateTaskFields.mock.calls[0][2]).toEqual({
      prerequisites: [
        expect.objectContaining({ _ref: 'task-render', _weak: true }),
      ],
    })
    for (const ids of [['task-other-campaign'], ['task-ours'], ['task-b']]) {
      await expect(
        marketing().task.setPrerequisites({
          taskId: 'task-ours',
          prerequisiteIds: ids,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }
    expect(h.updateTaskFields).toHaveBeenCalledTimes(1)
  })

  it('re-times a publishing Task through its variant and a checklist through dueAt', async () => {
    await marketing().task.setDate({
      taskId: 'task-ours',
      at: '2027-02-01T08:00:00+01:00',
    })
    expect(h.setTaskDate).toHaveBeenCalledWith({
      taskId: 'task-ours',
      taskRev: 'rev-task',
      at: '2027-02-01T07:00:00.000Z',
      variant: { id: 'variant-ours', rev: 'rev-v' },
    })
    h.getTaskEditorData.mockResolvedValue(stored(CHECKLIST))
    await marketing().task.setDate({
      taskId: 'task-check',
      at: '2027-02-01T07:00:00.000Z',
    })
    expect(h.setTaskDate.mock.calls[1][0].variant).toBeNull()
  })

  it('refuses to re-time a post that is already going out', async () => {
    h.getSocialVariantEditorData.mockResolvedValue(
      variantData({ status: 'awaiting-manual' }),
    )
    await expect(
      marketing().task.setDate({
        taskId: 'task-ours',
        at: '2027-02-01T07:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('marketing.task.delete', () => {
  it('cascades to the variant and post, and drops the Task from dependants', async () => {
    h.getTaskEditorData.mockResolvedValue(
      stored({}, [
        view({
          _id: 'task-b',
          kind: 'checklist',
          prerequisiteIds: ['task-ours'],
        }),
        view({ _id: 'task-c', kind: 'checklist', prerequisiteIds: [] }),
      ]),
    )
    await marketing().task.delete({ taskId: 'task-ours' })
    expect(h.deleteTask).toHaveBeenCalledWith({
      taskId: 'task-ours',
      taskRev: 'rev-task',
      conferenceId: CONF_A,
      variant: { id: 'variant-ours', rev: 'rev-v', postId: 'post-ours' },
      dependantIds: ['task-b'],
    })
  })

  it('refuses while the post is in flight or published', async () => {
    for (const status of ['publishing', 'published'] as const) {
      h.getSocialVariantEditorData.mockResolvedValue(variantData({ status }))
      await expect(
        marketing().task.delete({ taskId: 'task-ours' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }
    expect(h.deleteTask).not.toHaveBeenCalled()
  })

  it('refuses a foreign Task before reading it', async () => {
    await expect(
      marketing().task.delete({ taskId: 'task-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getTaskEditorData).not.toHaveBeenCalled()
  })
})
