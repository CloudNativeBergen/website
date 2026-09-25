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
const ceilings = vi.hoisted(() => ({
  ceilingWarningsFor: vi.fn(async (): Promise<string[]> => []),
}))
vi.mock('@/lib/marketing/ceiling-check', () => ceilings)
const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({
  revalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConferenceDomains: vi.fn(async (): Promise<readonly string[]> => []),
  getStudioTask: vi.fn(),
  getRenderSiblings: vi.fn(),
  handoffStudioAttachment: vi.fn(),
  getConference: vi.fn(),
  tenantRead: vi.fn(),
  transaction: vi.fn(),
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

vi.mock('@/lib/marketing/render-sanity', () => ({
  getStudioTask: h.getStudioTask,
  getRenderSiblings: h.getRenderSiblings,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch: vi.fn(), fetch: vi.fn(), transaction: h.transaction },
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
  getConferenceDomainsForRule: h.getConferenceDomains,
  handoffStudioAttachment: h.handoffStudioAttachment,
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
vi.mock('@/lib/social/schedule-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/social/schedule-check')>()),
  scheduleIssues: h.scheduleIssues,
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getOrganizersByConference: h.getOrganizersByConference,
}))

import { MAY_BE_LIVE_REFUSAL } from '@/lib/marketing/deletion'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluate, parse } from 'groq-js'
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
import { shortLinkIndexTag, shortLinkTag } from '@/lib/cache/tags'
import { normalizeShortCode } from '@/lib/marketing/short-code'

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
    shortCode: null,
    instructions: null,
    verbatimCopy: false,
    externalUrl: null,
    skipReason: null,
    subject: null,
    assetUrl: null,
    messageId: null,
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
      submission: null,
      shortCode: null,
      link: 'https://cloudnativebergen.dev/cfp?utm_source=linkedin',
      attachments: [],
      publishResult: null,
      attempts: [],
      attemptCount: 0,
      ...overrides,
    },
    post: { attachments: [], defaultScheduledAt: '2027-01-10T07:00:00.000Z' },
    conferenceDomains: ['conf-a.example.no'],
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
    tagByHand: [],
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
    expect(result).toEqual({ success: true, ceilingWarnings: [] })
    expect(h.approveTask).toHaveBeenCalledWith({
      taskId: 'task-ours',
      taskRev: 'rev-task',
      by: ADMIN_ID,
      at: expect.any(String),
      variant: {
        id: 'variant-ours',
        rev: 'rev-v',
        scheduledAt: '2027-01-10T07:00:00.000Z',
        link: 'https://cloudnativebergen.dev/cfp?utm_source=linkedin&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Alinkedin',
        // The variant in this fixture predates `shortCode`; approve is a
        // mutation that needs the link, so it mints one (short-links §2.2).
        shortCode: expect.stringMatching(/^[a-hjkmnp-z2-9]{6}$/),
      },
    })
  })

  it('MINTS a short code for a variant that predates the field, and keeps an existing one', async () => {
    const minted = h.approveTask.mock.calls.length
    await marketing().task.approve({ taskId: 'task-ours' })
    expect(
      normalizeShortCode(h.approveTask.mock.calls[minted][0].variant.shortCode),
    ).toBe(h.approveTask.mock.calls[minted][0].variant.shortCode)

    h.getSocialVariantEditorData.mockResolvedValue(
      variantData({ shortCode: 'abc987' }),
    )
    await marketing().task.approve({ taskId: 'task-ours' })
    expect(h.approveTask.mock.calls[minted + 1][0].variant.shortCode).toBe(
      'abc987',
    )
  })

  it('EXPIRES the short-link entry, because approve rewrote the link', async () => {
    await marketing().task.approve({ taskId: 'task-ours' })
    expect(revalidateTag).toHaveBeenCalledWith(shortLinkTag('variant-ours'), {
      expire: 0,
    })
  })

  it('EXPIRES the code INDEX, because approve may have backfilled a code', async () => {
    // Without this, a code minted at approval is missing from the cached
    // membership set and its freshly posted short link answers the HOME PAGE.
    await marketing().task.approve({ taskId: 'task-ours' })
    expect(revalidateTag).toHaveBeenCalledWith(shortLinkIndexTag(CONF_A), {
      expire: 0,
    })
  })

  it('re-derives the tagged link from the target page and validates with it, repairing a stale variant link', async () => {
    h.getSocialVariantEditorData.mockResolvedValue(
      variantData({ link: 'https://stale.example/old' }),
    )
    await marketing().task.approve({ taskId: 'task-ours' })
    const derived =
      'https://cloudnativebergen.dev/cfp?utm_source=linkedin&utm_medium=social&utm_campaign=cfp&utm_content=cfpOpen%3Alinkedin'
    expect(h.scheduleIssues.mock.calls[0][0].link).toBe(derived)
    expect(h.approveTask.mock.calls[0][0].variant.link).toBe(derived)
  })

  it('does not read the own domains for a card platform: a Bluesky approval cannot fail on that read', async () => {
    h.getConferenceDomains.mockRejectedValue(new Error('verification down'))
    h.getSocialVariantEditorData.mockResolvedValue(
      variantData({ platform: 'bluesky' }),
    )
    await marketing().task.approve({ taskId: 'task-ours' })
    expect(h.getConferenceDomains).not.toHaveBeenCalled()
    expect(h.scheduleIssues.mock.calls[0][2]).toEqual({
      taskOwned: true,
      conferenceDomains: [],
    })
  })

  it('hands the LIVE own domains to the shared validation, by the variant conference (#1134)', async () => {
    // The cached conference (`CONFERENCE.domains`) lists cloudnativebergen.dev;
    // the live read says something else. The live one is what approve must
    // apply — the same list save and the publish tick apply — or a domain
    // just added in the Studio passes approval and fails at publish.
    h.getConferenceDomains.mockResolvedValue(['live.cloudnativebergen.no'])
    await marketing().task.approve({ taskId: 'task-ours' })
    expect(h.getConferenceDomains).toHaveBeenCalledWith(CONF_A)
    expect(h.scheduleIssues.mock.calls[0][2]).toEqual({
      taskOwned: true,
      conferenceDomains: ['live.cloudnativebergen.no'],
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
    ).resolves.toEqual({ success: true, ceilingWarnings: [] })
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
    ).resolves.toEqual({ success: true, ceilingWarnings: [] })
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

  it('MINTS a short code for a Task-owned variant and EXPIRES its lookup', async () => {
    await save('/tickets')
    const options = h.updateSocialVariantContent.mock.calls[0][2]
    expect(normalizeShortCode(options.shortCode)).toBe(options.shortCode)
    expect(revalidateTag).toHaveBeenCalledWith(shortLinkTag('variant-ours'), {
      expire: 0,
    })
    expect(revalidateTag).toHaveBeenCalledWith(shortLinkIndexTag(CONF_A), {
      expire: 0,
    })
  })

  it('keeps a code the variant already carries', async () => {
    h.getSocialPostVariant.mockResolvedValue({
      ...variantData().variant,
      shortCode: 'abc987',
    })
    await save('/tickets')
    expect(h.updateSocialVariantContent.mock.calls[0][2].shortCode).toBe(
      'abc987',
    )
  })

  it('never shortens a STANDALONE post: no code, and no expiry', async () => {
    // Its `link` is typed by the organizer and may point anywhere (§1).
    h.getTaskForVariant.mockResolvedValue(null)
    await social().updateVariant({
      variantId: 'variant-ours',
      rev: 'rev-v',
      body: 'CFP is open',
      link: 'https://example.com/free',
      attachments: [],
      timing: { mode: 'default' },
    })
    expect(h.updateSocialVariantContent.mock.calls[0][2]).not.toHaveProperty(
      'shortCode',
    )
    expect(revalidateTag).not.toHaveBeenCalled()
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
    expect(h.updateTaskFields).toHaveBeenCalledWith(
      'task-check',
      'rev-task',
      { status: 'done' },
      [],
    )
  })

  it('clears a stored URL when the event-page update is completed with null', async () => {
    h.getTaskEditorData.mockResolvedValue(
      stored({
        ...CHECKLIST,
        kind: 'eventPageUpdate',
        externalUrl: 'https://example.com/old',
      }),
    )
    await marketing().task.complete({ taskId: 'task-check', externalUrl: null })
    expect(h.updateTaskFields).toHaveBeenCalledWith(
      'task-check',
      'rev-task',
      { status: 'done' },
      ['externalUrl'],
    )
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

  it('warns, never blocks, when the new date goes over a Channel ceiling', async () => {
    ceilings.ceilingWarningsFor.mockResolvedValueOnce([
      'LinkedIn has 2 posts on 1 February 2027; the ceiling outside event week is 1 a day.',
    ])
    const result = await marketing().task.setDate({
      taskId: 'task-ours',
      at: '2027-02-01T08:00:00+01:00',
    })
    expect(h.setTaskDate).toHaveBeenCalled()
    expect(ceilings.ceilingWarningsFor).toHaveBeenCalledWith(CONF_A, {
      variantIds: ['variant-ours'],
    })
    expect(result).toEqual({
      success: true,
      ceilingWarnings: [
        'LinkedIn has 2 posts on 1 February 2027; the ceiling outside event week is 1 a day.',
      ],
    })
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

  it('EXPIRES the short-link entries of the Task and its variant', async () => {
    // A deleted Task's short link falls back to the home page (§2.1's known
    // hole); it must not keep serving the old target for up to a day (§2.5).
    await marketing().task.delete({ taskId: 'task-ours' })
    expect(revalidateTag).toHaveBeenCalledWith(shortLinkTag('task-ours'), {
      expire: 0,
    })
    expect(revalidateTag).toHaveBeenCalledWith(shortLinkTag('variant-ours'), {
      expire: 0,
    })
    // Both codes leave the conference's membership set.
    expect(revalidateTag).toHaveBeenCalledWith(shortLinkIndexTag(CONF_A), {
      expire: 0,
    })
  })

  it('refuses to delete a FAILED post that may be live, and still deletes one that failed definitely (#1128)', async () => {
    // A failed variant fell through to the ordinary delete, which removes
    // the variant and its post. After `ambiguous` or `stale-claim` the post
    // may be on the platform now, and that record is what an organizer
    // reconciles from.
    h.getSocialVariantEditorData.mockResolvedValue(
      variantData({
        status: 'failed',
        attempts: [
          { _key: 'a', at: '2026-09-13T09:50:00Z', outcome: 'ambiguous' },
        ],
      }),
    )
    await expect(
      marketing().task.delete({ taskId: 'task-ours' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: MAY_BE_LIVE_REFUSAL,
    })
    expect(h.deleteTask).not.toHaveBeenCalled()

    // The control, on the ACTION: a rejected post never went out.
    h.getSocialVariantEditorData.mockResolvedValue(
      variantData({
        status: 'failed',
        attempts: [
          { _key: 'a', at: '2026-09-13T09:50:00Z', outcome: 'rejected' },
        ],
      }),
    )
    await marketing().task.delete({ taskId: 'task-ours' })
    expect(h.deleteTask).toHaveBeenCalledTimes(1)
  })

  // `submitted` is in flight exactly as `publishing` is (#1128).
  it.each([
    [
      'publishing',
      'The post is being published right now. Try again in a minute.',
    ],
    [
      'submitted',
      'The post is being published right now. Try again in a minute.',
    ],
    ['published', 'The post has been published; the record is kept.'],
  ] as const)(
    'refuses to delete a %s post, with its own message',
    async (status, message) => {
      h.getSocialVariantEditorData.mockResolvedValue(variantData({ status }))
      await expect(
        marketing().task.delete({ taskId: 'task-ours' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', message })
      expect(h.deleteTask).not.toHaveBeenCalled()
    },
  )

  it('refuses a foreign Task before reading it', async () => {
    await expect(
      marketing().task.delete({ taskId: 'task-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getTaskEditorData).not.toHaveBeenCalled()
  })
})

describe('task.attachAsset', () => {
  const assetId = 'image-render-1200x630-png'
  const input = { taskId: 'task-ours', taskRev: 'rev-render', assetId }
  const render = () => ({
    _id: 'task-ours',
    _rev: 'rev-render',
    kind: 'studioRender',
    title: 'Save the date',
    alt: 'Conference announcement',
    subjectName: null,
    pendingAssetId: assetId,
    assetId: null,
    campaignId: 'camp-A',
    handoffDoneFor: [] as string[],
  })
  beforeEach(() => {
    h.getStudioTask.mockReset()
    h.updateTaskFields.mockReset()
    let current = render()
    h.getStudioTask.mockImplementation(async () => current)
    h.getRenderSiblings.mockResolvedValue([])
    h.updateTaskFields.mockImplementation(async (_id, _rev, fields) => {
      current = {
        ...current,
        _rev: `${current._rev}-saved`,
        ...(fields.asset ? { assetId, pendingAssetId: null } : {}),
        ...fields,
      } as ReturnType<typeof render>
      return true
    })
    h.handoffStudioAttachment.mockResolvedValue('attached')
  })

  async function placeholderHandoff(status: string, alt: string) {
    // Exercise the real handoff, projections and pending derivation; only the
    // Sanity boundary is stubbed. The post is empty and the variant editable.
    const saved: Record<string, unknown> = {
      _id: 'task-ours',
      _type: 'marketingTask',
      _rev: 'rev-render',
      conference: { _ref: CONF_A },
      campaign: { _ref: 'camp-A' },
      kind: 'studioRender',
      title: 'Sponsor card',
      status: 'open',
      alt,
      pendingStudioAsset: { asset: { _ref: assetId } },
    }
    const post = {
      _id: 'post',
      _type: 'socialPost',
      _rev: 'post-rev',
      conference: { _ref: CONF_A },
      attachments: [] as unknown[],
    }
    const variant = {
      _id: 'eligible-v',
      _type: 'socialPostVariant',
      _rev: 'variant-rev',
      conference: { _ref: CONF_A },
      post: { _ref: 'post' },
      platform: 'bluesky',
      body: 'Welcome Acme to the conference!',
      status,
      attachments: [] as unknown[],
    }
    const dataset = [
      saved,
      post,
      variant,
      {
        _id: 'camp-A',
        _type: 'marketingCampaign',
        conference: { _ref: CONF_A },
        key: 'sponsors',
        title: 'Sponsors',
      },
      {
        _id: 'eligible',
        _type: 'marketingTask',
        conference: { _ref: CONF_A },
        campaign: { _ref: 'camp-A' },
        kind: 'publishing',
        title: 'Welcome Acme',
        status: 'open',
        prerequisites: [{ _key: 'render', _ref: 'task-ours' }],
        variant: { _ref: 'eligible-v' },
      },
    ]
    const tenantRead = h.tenantRead.getMockImplementation()!
    h.tenantRead.mockImplementation(async (query, params) =>
      params.id
        ? tenantRead(query, params)
        : (await evaluate(parse(query), { dataset, params })).get(),
    )
    const studio = await vi.importActual<
      typeof import('@/lib/marketing/render-sanity')
    >('@/lib/marketing/render-sanity')
    h.getStudioTask.mockImplementation(studio.getStudioTask)
    h.getRenderSiblings.mockImplementation(studio.getRenderSiblings)
    h.updateTaskFields.mockImplementation(
      async (_id, rev, fields, unset = []) => {
        if (rev !== saved._rev) return false
        Object.assign(saved, fields, { _rev: `${rev}-saved` })
        for (const key of unset) delete saved[key]
        return true
      },
    )
    const social = await vi.importActual<typeof import('@/lib/social/sanity')>(
      '@/lib/social/sanity',
    )
    h.handoffStudioAttachment.mockImplementation(social.handoffStudioAttachment)
    const tx = {
      patch: vi.fn((id: string, callback: (p: unknown) => unknown) => {
        const document = id === post._id ? post : variant
        const p = {
          ifRevisionId: () => p,
          setIfMissing: () => p,
          set: (fields: Record<string, unknown>) => {
            Object.assign(document, fields)
            return p
          },
          append: (_path: string, items: unknown[]) => {
            document.attachments.push(...items)
            return p
          },
        }
        callback(p)
        return tx
      }),
      commit: vi.fn().mockResolvedValue({}),
    }
    h.transaction.mockReturnValue(tx)
    const real = await vi.importActual<typeof import('@/lib/marketing/sanity')>(
      '@/lib/marketing/sanity',
    )
    const reload = async () =>
      (await real.getTaskEditorData('task-ours', CONF_A))!.task
    return { saved, post, variant, tx, reload }
  }

  it('keeps a scheduled placeholder handoff pending and retryable without losing the saved asset', async () => {
    const state = await placeholderHandoff(
      'scheduled',
      'Sponsor card: Acme, {tier} sponsor of Cloud Native Bergen.',
    )
    expect(await marketing().task.attachAsset(input)).toEqual({
      success: true,
      handoffFailures: ['eligible'],
      handoffIssues: ['Fill in {tier} in the alt text before scheduling.'],
    })
    expect(state.saved.handoffDoneFor).toEqual([])
    expect(await state.reload()).toMatchObject({
      assetId,
      complete: true,
      handoffPending: true,
    })
    expect(state.post.attachments).toEqual([])
    expect(state.variant.attachments).toEqual([])
    expect(state.tx.patch).not.toHaveBeenCalled()
    expect(state.tx.commit).not.toHaveBeenCalled()

    // The Task-editor retry reuses the saved image after the alt is resolved.
    state.saved.alt = 'Sponsor card: Acme, Gold sponsor of Cloud Native Bergen.'
    expect(await marketing().task.attachAsset(input)).toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(state.post.attachments).toEqual([
      expect.objectContaining({ alt: state.saved.alt }),
    ])
    expect(state.saved.handoffDoneFor).toEqual(['eligible-v'])
    expect(await state.reload()).toMatchObject({
      assetId,
      complete: true,
      handoffPending: false,
    })
    expect(state.tx.commit).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['scheduled', 'Sponsor card: Acme, Gold sponsor of Cloud Native Bergen.'],
    ['draft', 'Sponsor card: Acme, {tier} sponsor of Cloud Native Bergen.'],
    ['scheduled', 'Acme uses {custom} notation.'],
  ])('hands off a %s render with allowed alt: %s', async (status, alt) => {
    const state = await placeholderHandoff(status, alt)
    expect(await marketing().task.attachAsset(input)).toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(state.post.attachments).toEqual([expect.objectContaining({ alt })])
    expect(state.variant.attachments).toEqual([
      expect.objectContaining({ source: expect.any(String) }),
    ])
    expect(state.saved.handoffDoneFor).toEqual(['eligible-v'])
    expect(await state.reload()).toMatchObject({
      assetId,
      handoffPending: false,
    })
    expect(state.tx.commit).toHaveBeenCalledTimes(1)
  })

  it('refuses a foreign tenant before reading the render Task', async () => {
    await expect(
      marketing().task.attachAsset({ ...input, taskId: 'task-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.getStudioTask).not.toHaveBeenCalled()
  })
  it('refuses a missing render Task', async () => {
    h.getStudioTask.mockResolvedValue(null)
    await expect(marketing().task.attachAsset(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
  it('refuses a wrong kind even with a bound upload', async () => {
    h.getStudioTask.mockResolvedValue({ ...render(), kind: 'checklist' })
    await expect(marketing().task.attachAsset(input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Only studio render Tasks accept a render.',
    })
  })
  it('refuses an asset uploaded for a different Task', async () => {
    h.getStudioTask.mockResolvedValue({
      ...render(),
      pendingAssetId: 'image-other-1200x630-png',
    })
    await expect(marketing().task.attachAsset(input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Upload this image for this Task first.',
    })
  })
  it('surfaces a stale loaded revision as CONFLICT', async () => {
    await expect(
      marketing().task.attachAsset({ ...input, taskRev: 'stale' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
  it('surfaces an atomic save revision conflict as CONFLICT', async () => {
    h.updateTaskFields.mockResolvedValue(false)
    await expect(marketing().task.attachAsset(input)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
  it('attaches a subjectless save-the-date render with a correctly shaped image and no status write', async () => {
    expect(render().subjectName).toBeNull()
    await expect(marketing().task.attachAsset(input)).resolves.toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(h.updateTaskFields).toHaveBeenCalledWith(
      'task-ours',
      'rev-render',
      {
        asset: { _type: 'image', asset: { _type: 'reference', _ref: assetId } },
        handoffDoneFor: [],
      },
      ['pendingStudioAsset'],
    )
    const savedFields = Object.assign(
      {},
      ...h.updateTaskFields.mock.calls.map((call) => call[2]),
    )
    const dataset = [
      {
        _id: 'task-ours',
        _type: 'marketingTask',
        _rev: 'saved',
        conference: { _ref: CONF_A },
        campaign: { _ref: 'camp-A' },
        key: 'saveTheDate',
        title: 'Save the date',
        kind: 'studioRender',
        status: 'open',
        ...savedFields,
      },
      {
        _id: 'camp-A',
        _type: 'marketingCampaign',
        conference: { _ref: CONF_A },
        key: 'announce',
        title: 'Announcement',
      },
    ]
    h.tenantRead.mockImplementation(
      async (query: string, params: Record<string, unknown>) =>
        (await evaluate(parse(query), { dataset, params })).get(),
    )
    const real = await vi.importActual<typeof import('@/lib/marketing/sanity')>(
      '@/lib/marketing/sanity',
    )
    expect(
      (await real.getTaskEditorData('task-ours', CONF_A))?.task,
    ).toMatchObject({ complete: true, status: 'open', kind: 'studioRender' })
  })
  it('hands off only to publishing siblings that name the render as a Prerequisite', async () => {
    h.getRenderSiblings.mockResolvedValue([
      {
        _id: 'eligible',
        kind: 'publishing',
        prerequisiteIds: ['task-ours'],
        variantId: 'eligible-v',
      },
      {
        _id: 'non-publishing',
        kind: 'checklist',
        prerequisiteIds: ['task-ours'],
        variantId: 'check-v',
      },
      {
        _id: 'unrelated',
        kind: 'publishing',
        prerequisiteIds: ['other'],
        variantId: 'other-v',
      },
    ])
    await expect(marketing().task.attachAsset(input)).resolves.toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(h.handoffStudioAttachment.mock.calls).toEqual([
      ['eligible-v', CONF_A, { assetId, alt: 'Conference announcement' }],
    ])
  })
  it.each([undefined, null, '   '])(
    'hands off a fallback alt VALUE when configured alt is %j',
    async (alt) => {
      h.getStudioTask.mockResolvedValueOnce({ ...render(), alt })
      h.getRenderSiblings.mockResolvedValue([
        {
          _id: 'eligible',
          kind: 'publishing',
          prerequisiteIds: ['task-ours'],
          variantId: 'eligible-v',
        },
      ])
      await marketing().task.attachAsset(input)
      expect(h.handoffStudioAttachment).toHaveBeenCalledWith(
        'eligible-v',
        CONF_A,
        { assetId, alt: 'Save the date' },
      )
    },
  )
  it('resets old image receipts before delivering a new render', async () => {
    h.getStudioTask.mockResolvedValueOnce({
      ...render(),
      assetId: 'image-old-1200x630-png',
      handoffDoneFor: ['eligible-v'],
    })
    h.getRenderSiblings.mockResolvedValue([
      {
        _id: 'eligible',
        kind: 'publishing',
        prerequisiteIds: ['task-ours'],
        variantId: 'eligible-v',
      },
    ])
    h.handoffStudioAttachment.mockResolvedValue('unavailable')
    expect(await marketing().task.attachAsset(input)).toEqual({
      success: true,
      handoffFailures: ['eligible'],
    })
    expect(h.updateTaskFields.mock.calls[0][2].handoffDoneFor).toEqual([])
    expect(h.handoffStudioAttachment.mock.calls.map((call) => call[0])).toEqual(
      ['eligible-v'],
    )
  })

  it('records partial delivery and retries only the unhandled variant', async () => {
    h.getRenderSiblings.mockResolvedValue(
      ['a', 'b'].map((id) => ({
        _id: id,
        kind: 'publishing',
        prerequisiteIds: ['task-ours'],
        variantId: `${id}-v`,
      })),
    )
    h.handoffStudioAttachment
      .mockResolvedValueOnce('attached')
      .mockResolvedValueOnce('unavailable')
    expect(await marketing().task.attachAsset(input)).toEqual({
      success: true,
      handoffFailures: ['b'],
    })
    expect(h.updateTaskFields.mock.lastCall![2].handoffDoneFor).toEqual(['a-v'])
    expect(await marketing().task.attachAsset(input)).toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(h.handoffStudioAttachment.mock.calls.map((call) => call[0])).toEqual(
      ['a-v', 'b-v', 'b-v'],
    )
    expect(h.updateTaskFields.mock.lastCall![2].handoffDoneFor).toEqual([
      'a-v',
      'b-v',
    ])
  })

  it.each(['during receipt save', 'after completion'])(
    'derives pending from the current variant when Studio repoints a recipient %s',
    async (timing) => {
      const saved: Record<string, unknown> = {
        _id: 'task-ours',
        _type: 'marketingTask',
        _rev: 'rev-render',
        conference: { _ref: CONF_A },
        campaign: { _ref: 'camp-A' },
        kind: 'studioRender',
        title: 'Render',
        status: 'open',
        pendingStudioAsset: { asset: { _ref: assetId } },
      }
      const publishing = {
        _id: 'publishing-task',
        _type: 'marketingTask',
        _rev: 'post-rev',
        conference: { _ref: CONF_A },
        campaign: { _ref: 'camp-A' },
        kind: 'publishing',
        title: 'Publish',
        prerequisites: [{ _key: 'render', _ref: 'task-ours' }],
        variant: { _ref: 'v1' },
      }
      const dataset = [
        saved,
        publishing,
        {
          _id: 'camp-A',
          _type: 'marketingCampaign',
          _rev: 'unchanged',
          conference: { _ref: CONF_A },
          key: 'announce',
          title: 'Announcement',
        },
        ...['v1', 'v2'].map((_id) => ({
          _id,
          _type: 'socialPostVariant',
          conference: { _ref: CONF_A },
          status: 'draft',
        })),
      ]
      h.tenantRead.mockImplementation(async (query, params) =>
        (await evaluate(parse(query), { dataset, params })).get(),
      )
      const reads = await vi.importActual<
        typeof import('@/lib/marketing/render-sanity')
      >('@/lib/marketing/render-sanity')
      const real = await vi.importActual<
        typeof import('@/lib/marketing/sanity')
      >('@/lib/marketing/sanity')
      h.getStudioTask.mockImplementation(reads.getStudioTask)
      h.getRenderSiblings.mockImplementation(reads.getRenderSiblings)
      let writes = 0
      h.updateTaskFields.mockImplementation(
        async (_id, rev, fields, unset = []) => {
          if (rev !== saved._rev) return false
          // Studio edits only the publishing Task: Campaign revision stays unchanged.
          if (++writes === 2 && timing === 'during receipt save')
            publishing.variant._ref = 'v2'
          Object.assign(saved, fields, { _rev: `${rev}-next` })
          for (const key of unset) delete saved[key]
          return true
        },
      )
      const delivered: string[] = []
      h.handoffStudioAttachment.mockImplementation(async (variantId) => {
        delivered.push(variantId)
        return 'attached'
      })
      await marketing().task.attachAsset(input)
      if (timing === 'after completion') {
        expect(
          (await real.getTaskEditorData('task-ours', CONF_A))!.task
            .handoffPending,
        ).toBe(false)
        publishing.variant._ref = 'v2'
      }
      expect(delivered).toEqual(['v1'])
      expect(
        (await real.getTaskEditorData('task-ours', CONF_A))!.task,
      ).toMatchObject({
        assetId,
        complete: true,
        handoffPending: true,
      })
      expect(
        (await real.getTaskEditorData('publishing-task', CONF_A))!.siblings[0]
          .handoffPending,
      ).toBe(true)
      await marketing().task.attachAsset(input)
      expect(delivered).toEqual(['v1', 'v2'])
      expect(
        (await real.getTaskEditorData('task-ours', CONF_A))!.task
          .handoffPending,
      ).toBe(false)
    },
  )
  it('persists pending handoff through a fresh editor read, and clears it only after retry succeeds', async () => {
    const saved: Record<string, unknown> = {
      _id: 'task-ours',
      _type: 'marketingTask',
      _rev: 'rev-render',
      conference: { _ref: CONF_A },
      campaign: { _ref: 'camp-A' },
      kind: 'studioRender',
      title: 'Save the date',
      status: 'open',
      pendingStudioAsset: { asset: { _ref: assetId } },
    }
    h.getStudioTask.mockImplementation(async () => ({
      ...render(),
      _rev: saved._rev,
      assetId: saved.asset ? assetId : null,
      pendingAssetId: saved.pendingStudioAsset ? assetId : null,
      handoffDoneFor: saved.handoffDoneFor,
    }))
    h.updateTaskFields.mockImplementation(
      async (_id, rev, fields, unset = []) => {
        if (rev !== saved._rev) return false
        Object.assign(saved, fields, { _rev: `${rev}-next` })
        for (const key of unset) delete saved[key]
        return true
      },
    )
    h.getRenderSiblings.mockResolvedValue([
      {
        _id: 'eligible',
        kind: 'publishing',
        prerequisiteIds: ['task-ours'],
        variantId: 'eligible-v',
      },
    ])
    let duringHandoff: unknown
    h.handoffStudioAttachment.mockImplementationOnce(async () => {
      duringHandoff = await reload()
      throw new Error('commit failed')
    })
    const real = await vi.importActual<typeof import('@/lib/marketing/sanity')>(
      '@/lib/marketing/sanity',
    )
    async function reload(taskId = 'task-ours') {
      const tenantRead = h.tenantRead.getMockImplementation()!
      const dataset = [
        saved,
        {
          _id: 'camp-A',
          _type: 'marketingCampaign',
          conference: { _ref: CONF_A },
          key: 'announce',
          title: 'Announcement',
        },
        {
          _id: 'publishing-task',
          _type: 'marketingTask',
          _rev: 'publishing-rev',
          conference: { _ref: CONF_A },
          campaign: { _ref: 'camp-A' },
          kind: 'publishing',
          title: 'Publish announcement',
          status: 'open',
          prerequisites: [{ _key: 'render', _ref: 'task-ours' }],
          variant: { _ref: 'eligible-v' },
        },
      ]
      h.tenantRead.mockImplementation(async (query, params) =>
        (await evaluate(parse(query), { dataset, params })).get(),
      )
      try {
        const editor = (await real.getTaskEditorData(taskId, CONF_A))!
        return taskId === 'task-ours'
          ? editor.task
          : editor.siblings.find((task) => task._id === 'task-ours')
      } finally {
        h.tenantRead.mockImplementation(tenantRead)
      }
    }
    expect(await marketing().task.attachAsset(input)).toEqual({
      success: true,
      handoffFailures: ['eligible'],
    })
    expect(duringHandoff).toMatchObject({
      assetId,
      handoffPending: true,
      complete: true,
    })
    expect(await reload()).toMatchObject({
      assetId,
      handoffPending: true,
      complete: true,
    })
    expect(await reload('publishing-task')).toMatchObject({
      handoffPending: true,
      complete: true,
    })
    expect(await marketing().task.attachAsset(input)).toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(await reload()).toMatchObject({
      assetId,
      handoffPending: false,
      complete: true,
    })
  })
  it.each(['adds a recipient', 'changes a recipient variant'])(
    'retains the pending marker when setPrerequisites %s after the handoff snapshot',
    async (change) => {
      const saved = { ...render() }
      const recipient = {
        _id: 'eligible',
        kind: 'publishing',
        prerequisiteIds: ['task-ours'],
        variantId: 'eligible-v',
      }
      let siblings = [recipient]
      h.getStudioTask.mockImplementation(async () => ({ ...saved }))
      h.updateTaskFields.mockImplementation(async (_id, _rev, fields) => {
        Object.assign(saved, fields, fields.asset ? { assetId } : {}, {
          _rev: 'saved-rev',
        })
        return true
      })
      h.getRenderSiblings.mockImplementation(async () =>
        siblings.map((sibling) => ({ ...sibling })),
      )
      h.handoffStudioAttachment.mockImplementationOnce(async () => {
        siblings =
          change === 'adds a recipient'
            ? [
                ...siblings,
                { ...recipient, _id: 'new-recipient', variantId: 'new-v' },
              ]
            : [{ ...recipient, variantId: 'new-v' }]
        return 'attached'
      })
      const result = await marketing().task.attachAsset(input)
      expect(saved.handoffDoneFor).toEqual(['eligible-v'])
      expect(result.handoffFailures).toEqual(['task-ours'])
      expect(
        h.handoffStudioAttachment.mock.calls.map((call) => call[0]),
      ).toEqual(['eligible-v'])

      await marketing().task.attachAsset(input)
      expect(saved.handoffDoneFor).toEqual(['eligible-v', 'new-v'])
      expect(
        h.handoffStudioAttachment.mock.calls.map((call) => call[0]),
      ).toContain('new-v')
    },
  )

  it('records delivery without needing a Campaign revision', async () => {
    const saved = { ...render() }
    h.getStudioTask.mockImplementation(async () => ({ ...saved }))
    h.updateTaskFields.mockImplementation(async (_id, _rev, fields) => {
      Object.assign(saved, fields, fields.asset ? { assetId } : {})
      return true
    })
    const result = await marketing().task.attachAsset(input)
    expect(saved.handoffDoneFor).toEqual([])
    expect(result.handoffFailures).toEqual([])
  })

  it('keeps the asset saved when writing handoff receipts throws', async () => {
    const saved = { ...render() }
    h.getStudioTask.mockImplementation(async () => ({ ...saved }))
    h.updateTaskFields
      .mockImplementationOnce(async (_id, _rev, fields) => {
        Object.assign(saved, fields, { assetId })
        return true
      })
      .mockRejectedValueOnce(new Error('receipt write failed'))
    const result = await marketing().task.attachAsset(input)
    expect(saved.assetId).toBe(assetId)
    expect(saved.handoffDoneFor).toEqual([])
    expect(result.handoffFailures).toEqual(['task-ours'])
  })

  it('retains the render after a handoff throws and retries the same saved asset', async () => {
    h.getRenderSiblings.mockResolvedValue([
      {
        _id: 'eligible',
        kind: 'publishing',
        prerequisiteIds: ['task-ours'],
        variantId: 'eligible-v',
      },
    ])
    h.handoffStudioAttachment.mockRejectedValueOnce(new Error('commit failed'))
    await expect(marketing().task.attachAsset(input)).resolves.toEqual({
      success: true,
      handoffFailures: ['eligible'],
    })
    expect(h.updateTaskFields).toHaveBeenCalledTimes(1)
    h.getStudioTask.mockResolvedValue({
      ...render(),
      _rev: 'saved-rev',
      pendingAssetId: null,
      assetId,
    })
    await expect(marketing().task.attachAsset(input)).resolves.toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(h.updateTaskFields).toHaveBeenCalledTimes(3)
    expect(h.handoffStudioAttachment).toHaveBeenCalledTimes(2)
  })
  it.each([
    null,
    {
      ...render(),
      _rev: 'new-render-rev',
      assetId: 'image-new-render-1200x630-png',
    },
  ])(
    'reports pending recovery if the saved output changes during handoff: %j',
    async (current) => {
      h.getStudioTask
        .mockResolvedValueOnce(render())
        .mockResolvedValueOnce(current)
      await expect(marketing().task.attachAsset(input)).resolves.toEqual({
        success: true,
        handoffFailures: ['task-ours'],
      })
      expect(h.updateTaskFields).toHaveBeenCalledTimes(1)
    },
  )
  it('retains recovery when the receipt compare-and-set conflicts', async () => {
    h.getStudioTask.mockResolvedValueOnce(render()).mockResolvedValueOnce({
      ...render(),
      _rev: 'saved-rev',
      assetId,
    })
    h.updateTaskFields.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(marketing().task.attachAsset(input)).resolves.toEqual({
      success: true,
      handoffFailures: ['task-ours'],
    })
    expect(h.updateTaskFields).toHaveBeenLastCalledWith(
      'task-ours',
      'saved-rev',
      {
        asset: { _type: 'image', asset: { _type: 'reference', _ref: assetId } },
        handoffDoneFor: [],
      },
    )
  })
  it('surfaces unavailable recipients for retry', async () => {
    h.getRenderSiblings.mockResolvedValue([
      {
        _id: 'eligible',
        kind: 'publishing',
        prerequisiteIds: ['task-ours'],
        variantId: 'eligible-v',
      },
    ])
    h.handoffStudioAttachment.mockResolvedValue('unavailable')
    await expect(marketing().task.attachAsset(input)).resolves.toEqual({
      success: true,
      handoffFailures: ['eligible'],
    })
  })
  it('retains the saved render when sibling discovery fails', async () => {
    h.getRenderSiblings.mockRejectedValueOnce(new Error('read failed'))
    await expect(marketing().task.attachAsset(input)).resolves.toEqual({
      success: true,
      handoffFailures: ['task-ours'],
    })
    expect(h.updateTaskFields).toHaveBeenCalledTimes(1)
  })
})
