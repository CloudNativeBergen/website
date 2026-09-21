/**
 * @vitest-environment node
 *
 * Organization-owned Plan Templates through the tRPC caller (#1123). The
 * tenancy guard runs for REAL against a stubbed `clientReadUncached.fetch`, so
 * a Template of another organization is refused BY THE GUARD and the Template
 * read is asserted never to have happened.
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
  commitSeedPlan: vi.fn(),
  getPlanView: vi.fn(),
  getPlanId: vi.fn(),
  readPlanSource: vi.fn(),
  published: vi.fn(async (): Promise<Set<string>> => new Set()),
  list: vi.fn(),
  versions: vi.fn(),
  getVersion: vi.fn(),
  head: vi.fn(),
  nameTaken: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch: vi.fn(), fetch: vi.fn() },
  clientReadUncached: { fetch: h.tenantRead },
}))
vi.mock('@/lib/marketing/sanity', () => ({
  commitSeedPlan: h.commitSeedPlan,
  getPlanView: h.getPlanView,
  getPlanId: h.getPlanId,
}))
vi.mock('@/lib/marketing/generation-sanity', () => ({
  publishedTaskKeys: h.published,
}))
vi.mock('@/lib/marketing/copy-sanity', () => ({
  getCopySource: vi.fn(),
  getCopySources: vi.fn(),
  readPlanSource: h.readPlanSource,
}))
vi.mock('@/lib/marketing/plan-templates/sanity', async (importOriginal) => ({
  templateDocId: (
    await importOriginal<
      typeof import('@/lib/marketing/plan-templates/sanity')
    >()
  ).templateDocId,
  listTemplates: h.list,
  listTemplateVersions: h.versions,
  getTemplateVersion: h.getVersion,
  readTemplateHead: h.head,
  templateNameTaken: h.nameTaken,
  createTemplateVersion: h.create,
  renameTemplate: h.rename,
  deleteTemplate: h.remove,
}))
vi.mock('@/lib/marketing/ceiling-check', () => ({
  channelCeilingWarnings: vi.fn(async () => []),
  ceilingWarningsFor: vi.fn(async () => []),
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import type { SaveSource } from '@/lib/marketing/plan-templates'
import type { SeedPlan } from '@/lib/marketing/seed'
import { BUILTIN_TEMPLATE } from '@/lib/marketing/template'
import { marketingRouter } from './marketing'

const t = initTRPC.context<Context>().create()
function marketing() {
  const speaker = { _id: 'sp-admin', name: 'Admin', organizerOrgIds: ['org-A'] }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(marketingRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

const OURS = '11111111-1111-4111-8111-111111111111'
const THEIRS = '22222222-2222-4222-8222-222222222222'
const CONFERENCE = {
  _id: 'conf-A',
  organization: { _ref: 'org-A' },
  title: 'Cloud Native Bergen 2027',
  city: 'Bergen',
  domains: ['cloudnativebergen.dev'],
  ticketCapacity: 400,
  cfpStartDate: '2027-01-01',
  cfpEndDate: '2027-02-01',
  cfpNotifyDate: '2027-03-01',
  programDate: '2027-04-01',
  startDate: '2027-06-01',
  endDate: '2027-06-02',
}
const cfp = BUILTIN_TEMPLATE.campaigns.filter((c) => c.key === 'cfp')
const keynotes = BUILTIN_TEMPLATE.campaigns.filter((c) => c.key === 'keynotes')

/** The current plan: one Campaign, one unanchored Task with edited copy. */
function source(): SaveSource {
  return {
    plan: { _id: 'marketingPlan.conf-A' },
    conference: CONFERENCE,
    ticketCapacity: 400,
    campaigns: [
      {
        _id: 'camp-1',
        key: 'custom-1',
        title: 'Community day',
        startMilestone: 'CFP_OPEN',
        startOffsetDays: 0,
        endMilestone: 'CFP_CLOSE',
        endOffsetDays: 0,
        primaryOutcome: 'attributedSessions',
        outcomeTargetPage: '/community',
        target: 100,
        triggers: [],
        recipes: [],
        optional: false,
      },
    ],
    tasks: [
      {
        _id: 'task-1',
        campaignId: 'camp-1',
        key: 'custom-post',
        title: 'Announcement',
        kind: 'publishing',
        channel: 'bluesky',
        milestone: null,
        offsetDays: null,
        dueAt: null,
        origin: 'manual',
        prerequisiteIds: [],
        targetPage: '/community',
        alt: null,
        instructions: null,
        copyEdited: true,
        variant: {
          body: 'Join us 1 June 2027! https://x.dev/community?utm=1',
          link: 'https://x.dev/community?utm=1',
          scheduledAt: '2027-01-05T17:00:00.000Z',
        },
      },
    ],
  }
}
const created = () => h.create.mock.calls[0][0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-12-01T10:00:00Z'))
  h.getConference.mockResolvedValue({ conference: CONFERENCE, error: null })
  h.tenantRead.mockImplementation(async (_q: string, p: { id: string }) =>
    p.id.includes(OURS)
      ? { _type: 'planTemplate', orgId: 'org-A' }
      : p.id.includes(THEIRS)
        ? { _type: 'planTemplate', orgId: 'org-B' }
        : null,
  )
  h.getPlanId.mockResolvedValue('marketingPlan.conf-A')
  h.getPlanView.mockResolvedValue(null)
  h.readPlanSource.mockResolvedValue(source())
  h.commitSeedPlan.mockResolvedValue({ committed: true })
  h.list.mockResolvedValue([])
  h.versions.mockResolvedValue([
    {
      version: 2,
      savedAt: null,
      savedByName: null,
      savedFromTitle: null,
      restoredFrom: null,
    },
    {
      version: 1,
      savedAt: null,
      savedByName: null,
      savedFromTitle: null,
      restoredFrom: null,
    },
  ])
  h.getVersion.mockImplementation(async (_org, templateId, version) => ({
    templateId,
    name: 'Our playbook',
    version,
    campaigns: [...cfp, ...keynotes],
  }))
  h.head.mockResolvedValue({
    name: 'Our playbook',
    nextVersion: 3,
    guard: { id: 'v1-doc', rev: 'v1-rev' },
  })
  h.nameTaken.mockResolvedValue(false)
  h.create.mockResolvedValue(true)
  h.rename.mockResolvedValue(2)
  h.remove.mockResolvedValue(2)
})

describe('template.savePreview / template.save', () => {
  it('lists exactly the Tasks that need a decision, and the Templates a version could be added to', async () => {
    h.list.mockResolvedValue([
      {
        templateId: OURS,
        name: 'Our playbook',
        latestVersion: 2,
        campaigns: 2,
        savedAt: null,
      },
    ])
    const preview = await marketing().template.savePreview()
    expect(preview.review).toEqual([
      expect.objectContaining({
        type: 'anchor',
        taskId: 'task-1',
        anchor: { milestone: 'CFP_OPEN', offsetDays: 4 },
      }),
      expect.objectContaining({
        type: 'copy',
        taskId: 'task-1',
        text: 'Join us 1 June 2027! {url}',
      }),
    ])
    expect(preview.unsavedTargets).toEqual([])
    expect(preview.templates).toEqual([
      { templateId: OURS, name: 'Our playbook', latestVersion: 2 },
    ])
    expect(h.readPlanSource).toHaveBeenCalledWith(
      'marketingPlan.conf-A',
      'conf-A',
    )
  })
  it('says which Targets cannot be saved when the edition has no ticket capacity', async () => {
    h.readPlanSource.mockResolvedValue({ ...source(), ticketCapacity: null })
    const preview = await marketing().template.savePreview()
    expect(preview.unsavedTargets).toEqual([
      { campaignTitle: 'Community day', target: 100 },
    ])
  })
  it('saves a new Template as version 1 of the conference’s organization, with Recipes and no Tasks', async () => {
    const result = await marketing().template.save({
      target: { type: 'new', name: '  Community playbook ' },
      decisions: { copy: { 'task-1': 'Join us {date}! {url}' } },
    })
    expect(created()).toMatchObject({
      orgId: 'org-A',
      name: 'Community playbook',
      version: 1,
      savedFrom: 'conf-A',
      savedBy: 'sp-admin',
      savedAt: '2026-12-01T10:00:00.000Z',
    })
    expect(created().guard).toBeUndefined()
    expect(created().templateId).toMatch(/^[0-9a-f-]{36}$/)
    expect(created().campaigns).toEqual([
      expect.objectContaining({
        key: 'custom-1',
        target: { shareOfCapacity: 0.25 },
        recipes: [
          expect.objectContaining({
            key: 'custom-post',
            anchor: { milestone: 'CFP_OPEN', offsetDays: 4 },
            skeleton: 'Join us {date}! {url}',
          }),
        ],
      }),
    ])
    expect(created().campaigns[0].recipes[0].verbatim).toBeUndefined()
    expect(result).toEqual({ templateId: created().templateId, version: 1 })
  })
  it('never writes to the live plan', async () => {
    await marketing().template.save({
      target: { type: 'new', name: 'Community playbook' },
      decisions: {},
    })
    expect(h.commitSeedPlan).not.toHaveBeenCalled()
    expect(h.create).toHaveBeenCalledTimes(1)
  })
  it('saves the next version of an existing Template under its current name', async () => {
    const result = await marketing().template.save({
      target: { type: 'version', templateId: OURS },
      decisions: {},
    })
    expect(h.head).toHaveBeenCalledWith('org-A', OURS)
    expect(created()).toMatchObject({
      templateId: OURS,
      name: 'Our playbook',
      version: 3,
      // Written under the guard on version 1: a delete or rename in between
      // makes this save lose (proven in plan-templates/sanity.test.ts).
      guard: { id: 'v1-doc', rev: 'v1-rev' },
    })
    expect(result).toEqual({ templateId: OURS, version: 3 })
  })
  it('reports a concurrent save of the same version as a conflict', async () => {
    h.create.mockResolvedValue(false)
    await expect(
      marketing().template.save({
        target: { type: 'version', templateId: OURS },
        decisions: {},
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Someone else just saved this Template. Reload and save again.',
    })
  })
  it('refuses a name another Template of the organization holds', async () => {
    h.nameTaken.mockResolvedValue(true)
    await expect(
      marketing().template.save({
        target: { type: 'new', name: 'Our playbook' },
        decisions: {},
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'This organization already has a Template called “Our playbook”.',
    })
    expect(h.create).not.toHaveBeenCalled()
  })
  it('checks the copy that WILL be saved, so untouched copy cannot smuggle a token past the form', async () => {
    const plan = source()
    plan.tasks[0].variant!.body =
      'Hi {recipient}! https://x.dev/community?utm=1'
    h.readPlanSource.mockResolvedValue(plan)
    await expect(
      marketing().template.save({
        target: { type: 'new', name: 'Community playbook' },
        decisions: {},
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'Announcement: {recipient} cannot be filled in for a Task like this one.',
    })
    expect(h.create).not.toHaveBeenCalled()
  })
  it('refuses rewritten copy that is empty', async () => {
    await expect(
      marketing().template.save({
        target: { type: 'new', name: 'Community playbook' },
        decisions: { copy: { 'task-1': '   ' } },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.create).not.toHaveBeenCalled()
  })
  it('accepts only conference placeholders in rewritten copy, with the strict rule', async () => {
    await expect(
      marketing().template.save({
        target: { type: 'new', name: 'Community playbook' },
        decisions: {
          copy: { 'task-1': 'Hi {name}, join {event} {recipient}' },
        },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'Announcement: {name}, {recipient} cannot be filled in for a Task like this one.',
    })
    expect(h.create).not.toHaveBeenCalled()
  })
  it('refuses another organization’s Template before reading anything', async () => {
    await expect(
      marketing().template.save({
        target: { type: 'version', templateId: THEIRS },
        decisions: {},
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No planTemplate with that id for this request',
    })
    expect(h.head).not.toHaveBeenCalled()
    expect(h.readPlanSource).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })
  it.each([
    [
      'save',
      () =>
        marketing().template.save({
          target: { type: 'new', name: 'X' },
          decisions: {},
        }),
    ],
    ['savePreview', () => marketing().template.savePreview()],
  ])(
    '%s refuses a plan that is being deleted: the chunks already gone would make a truncated Template',
    async (_name, call) => {
      // Now is 2026-12-01T10:00Z; the delete started two minutes ago.
      h.readPlanSource.mockResolvedValue({
        ...source(),
        deletingAt: '2026-12-01T09:58:00.000Z',
      })
      await expect(call()).rejects.toMatchObject({
        code: 'CONFLICT',
        message:
          'This plan is being deleted, so it cannot be saved as a Template right now.',
      })
      expect(h.create).not.toHaveBeenCalled()
    },
  )
  it('saves again once a delete has plainly been abandoned', async () => {
    h.readPlanSource.mockResolvedValue({
      ...source(),
      deletingAt: '2026-12-01T09:00:00.000Z',
    })
    const result = await marketing().template.save({
      target: { type: 'new', name: 'X' },
      decisions: {},
    })
    expect(result.version).toBe(1)
  })
  it('needs a plan to save', async () => {
    h.getPlanId.mockResolvedValue(null)
    await expect(
      marketing().template.save({
        target: { type: 'new', name: 'X' },
        decisions: {},
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('template.list / versions / preview', () => {
  it('lists the conference’s organization’s Templates', async () => {
    await marketing().template.list()
    expect(h.list).toHaveBeenCalledWith('org-A')
  })
  it('previews any version: Campaigns, Task counts and Recipes', async () => {
    const preview = await marketing().template.preview({
      templateId: OURS,
      version: 1,
    })
    expect(h.getVersion).toHaveBeenCalledWith('org-A', OURS, 1)
    expect(preview.name).toBe('Our playbook')
    expect(preview.campaigns.map((c) => [c.key, c.optional])).toEqual([
      ['cfp', false],
      ['keynotes', true],
    ])
    const staticCount = cfp[0].recipes.filter(
      (r) => r.anchor && !r.cadence && r.subjectSource === 'none',
    ).length
    expect(preview.campaigns[0].tasks).toBe(staticCount)
    expect(preview.campaigns[1].recipes).toEqual(['Keynote speaker card'])
  })
  it.each([
    ['versions', () => marketing().template.versions({ templateId: THEIRS })],
    [
      'preview',
      () => marketing().template.preview({ templateId: THEIRS, version: 1 }),
    ],
    [
      'restore',
      () => marketing().template.restore({ templateId: THEIRS, version: 1 }),
    ],
    [
      'rename',
      () =>
        marketing().template.rename({ templateId: THEIRS, name: 'Mine now' }),
    ],
    [
      'delete',
      () =>
        marketing().template.delete({
          templateId: THEIRS,
          confirmName: 'Our playbook',
        }),
    ],
  ])(
    '%s refuses another organization’s Template before any fetch',
    async (_name, call) => {
      await expect(call()).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'No planTemplate with that id for this request',
      })
      for (const read of [
        h.versions,
        h.getVersion,
        h.create,
        h.rename,
        h.remove,
      ])
        expect(read).not.toHaveBeenCalled()
    },
  )
})

describe('template.restore / rename / delete', () => {
  it('restore writes a NEW version with the old one’s contents', async () => {
    const result = await marketing().template.restore({
      templateId: OURS,
      version: 1,
    })
    expect(h.getVersion).toHaveBeenCalledWith('org-A', OURS, 1)
    expect(created()).toMatchObject({
      templateId: OURS,
      name: 'Our playbook',
      version: 3,
      restoredFrom: 1,
      campaigns: [...cfp, ...keynotes],
      savedBy: 'sp-admin',
      guard: { id: 'v1-doc', rev: 'v1-rev' },
    })
    expect(result).toEqual({ version: 3 })
  })
  it('rename refuses a taken name and otherwise patches every version', async () => {
    await marketing().template.rename({ templateId: OURS, name: ' Playbook ' })
    expect(h.nameTaken).toHaveBeenCalledWith('org-A', 'Playbook', OURS)
    expect(h.rename).toHaveBeenCalledWith('org-A', OURS, 'Playbook')
    h.rename.mockClear()
    h.nameTaken.mockResolvedValue(true)
    await expect(
      marketing().template.rename({ templateId: OURS, name: 'Meetups' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(h.rename).not.toHaveBeenCalled()
  })
  it('delete needs the Template’s name typed, then removes every version', async () => {
    await expect(
      marketing().template.delete({ templateId: OURS, confirmName: 'nope' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Type the Template name to confirm deletion.',
    })
    expect(h.remove).not.toHaveBeenCalled()
    const result = await marketing().template.delete({
      templateId: OURS,
      confirmName: 'Our playbook',
    })
    expect(h.remove).toHaveBeenCalledWith('org-A', OURS)
    expect(result).toEqual({ deleted: 2 })
  })
})

describe('plan.create from an organization Template', () => {
  const seed = (): SeedPlan => h.commitSeedPlan.mock.calls[0][0]
  it('seeds any version through the ordinary expansion and stamps name + version as the origin', async () => {
    await marketing().plan.create({
      source: {
        type: 'template',
        templateId: OURS,
        version: 1,
        includeOptional: ['keynotes'],
      },
    })
    expect(h.getVersion).toHaveBeenCalledWith('org-A', OURS, 1)
    expect(seed().plan.templateVersion).toBe('template:Our playbook@1')
    expect(seed().campaigns.map((c) => c.key)).toEqual(['cfp', 'keynotes'])
    expect(seed().tasks.map((t) => t.key)).toContain('cfpOpen:linkedin')
    expect(seed().campaigns[0].recipes).toEqual(cfp[0].recipes)
  })
  it('leaves an optional Campaign out unless asked for', async () => {
    await marketing().plan.create({
      source: {
        type: 'template',
        templateId: OURS,
        version: 2,
        includeOptional: [],
      },
    })
    expect(seed().campaigns.map((c) => c.key)).toEqual(['cfp'])
  })
  it('accepts every optional Campaign a Template can hold — the dialog ticks them all by default', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      ...keynotes[0],
      key: `custom-${i}`,
      title: `Side event ${i}`,
    }))
    h.getVersion.mockResolvedValue({
      templateId: OURS,
      name: 'Our playbook',
      version: 1,
      campaigns: many,
    })
    await marketing().plan.create({
      source: {
        type: 'template',
        templateId: OURS,
        version: 1,
        includeOptional: many.map((c) => c.key),
      },
    })
    expect(seed().campaigns).toHaveLength(60)
  })
  it('refuses a Campaign key that is not optional in that Template', async () => {
    await expect(
      marketing().plan.create({
        source: {
          type: 'template',
          templateId: OURS,
          version: 1,
          includeOptional: ['cfp'],
        },
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Not an optional Campaign of that Template: cfp',
    })
    expect(h.getPlanView).not.toHaveBeenCalled()
    expect(h.commitSeedPlan).not.toHaveBeenCalled()
  })
  it('refuses another organization’s Template before any fetch', async () => {
    await expect(
      marketing().plan.create({
        source: {
          type: 'template',
          templateId: THEIRS,
          version: 1,
          includeOptional: [],
        },
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No planTemplate with that id for this request',
    })
    expect(h.getVersion).not.toHaveBeenCalled()
    expect(h.getPlanView).not.toHaveBeenCalled()
    expect(h.commitSeedPlan).not.toHaveBeenCalled()
  })
  it('refuses a version that does not exist', async () => {
    await expect(
      marketing().plan.create({
        source: {
          type: 'template',
          templateId: OURS.replace('1111-4', '9999-4'),
          version: 1,
          includeOptional: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.commitSeedPlan).not.toHaveBeenCalled()
  })
})
