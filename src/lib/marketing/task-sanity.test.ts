/**
 * @vitest-environment node
 *
 * The Task editor's persistence (#1012): the read EXECUTED with groq-js
 * against a fixture dataset (tenancy, Campaign membership, the variant
 * followed only within the conference), and every write captured mutation
 * by mutation with its compare-and-set guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => {
  const state = { commitError: null as Error | null }
  const ops: { op: string; id: string; body?: unknown }[] = []
  const patchOf = () => {
    const calls: Record<string, unknown>[] = []
    const p = {
      ifRevisionId: (rev: string) => (calls.push({ ifRevisionId: rev }), p),
      set: (v: unknown) => (calls.push({ set: v }), p),
      unset: (v: unknown) => (calls.push({ unset: v }), p),
      calls,
    }
    return p
  }
  const tx = {
    patch: (id: string, fn: (p: ReturnType<typeof patchOf>) => unknown) => {
      const p = patchOf()
      fn(p)
      ops.push({ op: 'patch', id, body: p.calls })
      return tx
    },
    delete: (id: string) => (ops.push({ op: 'delete', id }), tx),
    commit: async () => {
      if (state.commitError) throw state.commitError
      return {}
    },
  }
  return { dataset: [] as Record<string, unknown>[], ops, state, tx }
})

async function run(query: string, params: Record<string, unknown> = {}) {
  const value = await evaluate(parse(query), { dataset: h.dataset, params })
  return value.get()
}

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: () => h.tx, fetch: run },
  clientReadUncached: { fetch: run },
}))
vi.mock('@/lib/time', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/time')>()),
  getCurrentDateTime: () => '2026-09-15T10:00:00.000Z',
}))

import {
  approveTask,
  deleteTask,
  getTaskEditorData,
  getTaskForVariant,
  getTaskLinkInputs,
  isConferenceOrganizer,
  setTaskDate,
  updateTaskFields,
} from './sanity'

const CONF_A = 'conf-A'
const CONF_B = 'conf-B'
const r = (id: string) => ({ _type: 'reference', _ref: id })

beforeEach(() => {
  h.dataset.length = 0
  h.ops.length = 0
  h.state.commitError = null
  h.dataset.push(
    { _id: 'sp-1', _type: 'speaker', name: 'Ada', slug: { current: 'ada' } },
    { _id: 'sp-2', _type: 'speaker', name: 'Bob' },
    {
      _id: CONF_A,
      _type: 'conference',
      organizers: [r('sp-1'), r('sp-2')],
    },
    {
      _id: 'marketingPlan.conf-A',
      _type: 'marketingPlan',
      conference: r(CONF_A),
      owner: r('sp-1'),
    },
    {
      _id: 'camp-A',
      _type: 'marketingCampaign',
      conference: r(CONF_A),
      plan: r('marketingPlan.conf-A'),
      key: 'cfp',
      title: 'CFP',
    },
    {
      _id: 'camp-A2',
      _type: 'marketingCampaign',
      conference: r(CONF_A),
      plan: r('marketingPlan.conf-A'),
      key: 'tickets',
      title: 'Tickets',
    },
    {
      _id: 'task-li',
      _rev: 'rev-li',
      _type: 'marketingTask',
      conference: r(CONF_A),
      plan: r('marketingPlan.conf-A'),
      campaign: r('camp-A'),
      key: 'cfpOpen:linkedin',
      title: 'CFP open',
      kind: 'publishing',
      channel: 'linkedin',
      milestone: 'CFP_OPEN',
      provisional: false,
      assignee: r('sp-1'),
      approvedBy: r('sp-2'),
      approvedAt: '2026-09-10T00:00:00.000Z',
      prerequisites: [{ _key: 'k1', ...r('task-render') }],
      variant: r('variant-li'),
      targetPage: '/cfp',
      subject: r('sp-1'),
      origin: 'template',
    },
    {
      _id: 'variant-li',
      _rev: 'rev-v',
      _type: 'socialPostVariant',
      conference: r(CONF_A),
      post: r('post-li'),
      platform: 'linkedin',
      status: 'draft',
      scheduledAt: '2027-01-10T07:00:00.000Z',
    },
    {
      _id: 'task-render',
      _rev: 'rev-render',
      _type: 'marketingTask',
      conference: r(CONF_A),
      plan: r('marketingPlan.conf-A'),
      campaign: r('camp-A'),
      key: 'cfpOpenRender',
      title: 'Render',
      kind: 'studioRender',
      dueAt: '2027-01-08T08:00:00.000Z',
      status: 'open',
      prerequisites: [],
    },
    {
      _id: 'task-check',
      _type: 'marketingTask',
      conference: r(CONF_A),
      plan: r('marketingPlan.conf-A'),
      campaign: r('camp-A'),
      key: 'check',
      title: 'Checklist',
      kind: 'checklist',
      status: 'skipped',
      skipReason: 'Not this year',
      instructions: 'Do the thing',
      prerequisites: [{ _key: 'k2', ...r('task-li') }],
    },
    // Same conference, other Campaign: never a sibling.
    {
      _id: 'task-other-campaign',
      _type: 'marketingTask',
      conference: r(CONF_A),
      plan: r('marketingPlan.conf-A'),
      campaign: r('camp-A2'),
      key: 'other',
      kind: 'checklist',
      status: 'open',
    },
    // Another conference's Task that claims our Campaign: never a sibling.
    {
      _id: 'task-cross',
      _type: 'marketingTask',
      conference: r(CONF_B),
      plan: r('marketingPlan.conf-A'),
      campaign: r('camp-A'),
      key: 'cross',
      kind: 'checklist',
      status: 'open',
    },
    // A draft twin of our task: never the live document.
    {
      _id: 'drafts.task-li',
      _type: 'marketingTask',
      conference: r(CONF_A),
      campaign: r('camp-A'),
      key: 'draft-twin',
      kind: 'publishing',
      title: 'DRAFT',
    },
    // A publishing task whose variant belongs to another conference.
    {
      _id: 'task-foreign-variant',
      _type: 'marketingTask',
      conference: r(CONF_A),
      plan: r('marketingPlan.conf-A'),
      campaign: r('camp-A'),
      key: 'cfpOpen:bluesky',
      kind: 'publishing',
      channel: 'bluesky',
      variant: r('variant-B'),
    },
    {
      _id: 'variant-B',
      _type: 'socialPostVariant',
      conference: r(CONF_B),
      status: 'published',
      publishResult: { url: 'https://bsky.app/x' },
    },
    { _id: 'post-li', _type: 'socialPost', conference: r(CONF_A) },
    {
      _id: 'variant-li-sibling',
      _type: 'socialPostVariant',
      conference: r(CONF_A),
      post: r('post-li'),
      status: 'draft',
    },
  )
})

describe('getTaskEditorData', () => {
  it.each(['speakerOutreach', 'sponsorOutreach'])(
    'exposes the message reference and completes %s without a done status',
    async (kind) => {
      const task = h.dataset.find((doc) => doc._id === 'task-render')!
      Object.assign(task, {
        kind,
        messageId: 'message-sent',
        targetPage: '/tickets',
        subject: r('sp-1'),
        status: 'open',
      })
      const data = await getTaskEditorData('task-render', CONF_A)
      expect(data?.task).toMatchObject({
        kind,
        messageId: 'message-sent',
        targetPage: '/tickets',
        status: 'done',
        complete: true,
      })
      expect(task.status).toBe('open')
      delete task.messageId
      expect(
        (await getTaskEditorData('task-render', CONF_A))?.task,
      ).toMatchObject({ messageId: null, status: 'open', complete: false })
    },
  )

  it('flags copy a Template saved verbatim, until an organizer has rewritten it', async () => {
    const task = h.dataset.find((doc) => doc._id === 'task-li')!
    expect(
      (await getTaskEditorData('task-li', CONF_A))!.task.verbatimCopy,
    ).toBe(false)
    task.verbatimCopy = true
    expect(
      (await getTaskEditorData('task-li', CONF_A))!.task.verbatimCopy,
    ).toBe(true)
    task.copyEdited = true
    expect(
      (await getTaskEditorData('task-li', CONF_A))!.task.verbatimCopy,
    ).toBe(false)
    delete task.verbatimCopy
    delete task.copyEdited
  })

  it('reads the Task with its editable fields, campaign, owner and siblings of the SAME campaign', async () => {
    const data = await getTaskEditorData('task-li', CONF_A)
    expect(data).not.toBeNull()
    expect(data!.task).toMatchObject({
      _id: 'task-li',
      _rev: 'rev-li',
      key: 'cfpOpen:linkedin',
      kind: 'publishing',
      channel: 'linkedin',
      status: 'draft',
      date: '2027-01-10T07:00:00.000Z',
      approvedAt: '2026-09-10T00:00:00.000Z',
      approvedByName: 'Bob',
      assigneeId: 'sp-1',
      assigneeName: 'Ada',
      prerequisiteIds: ['task-render'],
      variantId: 'variant-li',
      targetPage: '/cfp',
      subject: { _id: 'sp-1', type: 'speaker', name: 'Ada', slug: 'ada' },
      origin: 'template',
      complete: false,
    })
    expect(data!.campaign).toEqual({ _id: 'camp-A', key: 'cfp', title: 'CFP' })
    expect(data!.planOwnerId).toBe('sp-1')
    expect(data!.siblings.map((s) => s._id).sort()).toEqual([
      'task-check',
      'task-foreign-variant',
      'task-render',
    ])
    expect(data!.variant).toBeNull()
  })

  it('reads a skipped checklist Task with its reason and instructions', async () => {
    const data = await getTaskEditorData('task-check', CONF_A)
    expect(data!.task).toMatchObject({
      kind: 'checklist',
      status: 'skipped',
      skipReason: 'Not this year',
      instructions: 'Do the thing',
      prerequisiteIds: ['task-li'],
    })
  })

  it('returns null for a Task of another conference, and for a draft twin', async () => {
    expect(await getTaskEditorData('task-cross', CONF_A)).toBeNull()
    expect(await getTaskEditorData('task-li', CONF_B)).toBeNull()
    expect(await getTaskEditorData('drafts.task-li', CONF_A)).toBeNull()
  })

  it('never follows a variant of another conference — not even its id', async () => {
    const data = await getTaskEditorData('task-foreign-variant', CONF_A)
    expect(data!.task.status).toBe('draft')
    expect(data!.task.complete).toBe(false)
    expect(data!.task.date).toBeNull()
    // The id is what the router would read by; a foreign one must not leak.
    expect(data!.task.variantId).toBeNull()
  })
})

describe('getTaskEditorData — the LinkedIn "Tag by hand" list (#1155)', () => {
  const task = () => h.dataset.find((doc) => doc._id === 'task-li')!
  const speaker = (id: string) => h.dataset.find((doc) => doc._id === id)!

  beforeEach(() => {
    Object.assign(speaker('sp-1'), {
      links: [
        'https://github.com/ada',
        'https://www.linkedin.com/in/ada-l/?locale=en_US',
      ],
    })
    Object.assign(speaker('sp-2'), {
      links: ['https://linkedin.com/in/bob-b/'],
    })
    h.dataset.push(
      {
        _id: 'sp-3',
        _type: 'speaker',
        name: 'Cy',
        links: ['https://bsky.app/profile/cy.dev'],
      },
      {
        _id: 'talk-1',
        _type: 'talk',
        title: 'Kubernetes at scale',
        speakers: [
          { _key: 'a', ...r('sp-1') },
          { _key: 'b', ...r('sp-2') },
          { _key: 'c', ...r('sp-3') },
        ],
      },
      {
        _id: 'sponsor-1',
        _type: 'sponsor',
        name: 'Acme',
        linkedinUrl: 'https://www.linkedin.com/company/acme/?viewAsMember=true',
      },
    )
  })

  it('lists a speaker subject beside their clean LinkedIn profile', async () => {
    const data = await getTaskEditorData('task-li', CONF_A)
    expect(data!.tagByHand).toEqual([
      {
        name: 'Ada',
        url: 'https://www.linkedin.com/in/ada-l',
        kind: 'person',
      },
    ])
  })

  it('leaves out an opted-out speaker', async () => {
    speaker('sp-1').socialTagOptOut = true
    expect((await getTaskEditorData('task-li', CONF_A))!.tagByHand).toEqual([])
    // The control: the same speaker, only the stored opt-out differs.
    speaker('sp-1').socialTagOptOut = false
    expect(
      (await getTaskEditorData('task-li', CONF_A))!.tagByHand.map(
        (e) => e.name,
      ),
    ).toEqual(['Ada'])
  })

  it('lists every speaker of a talk with a profile, minus the opted-out', async () => {
    task().subject = r('talk-1')
    expect((await getTaskEditorData('task-li', CONF_A))!.tagByHand).toEqual([
      { name: 'Ada', url: 'https://www.linkedin.com/in/ada-l', kind: 'person' },
      { name: 'Bob', url: 'https://www.linkedin.com/in/bob-b', kind: 'person' },
    ])
    speaker('sp-2').socialTagOptOut = true
    expect(
      (await getTaskEditorData('task-li', CONF_A))!.tagByHand.map(
        (e) => e.name,
      ),
    ).toEqual(['Ada'])
  })

  it('lists a sponsor subject beside its clean company page', async () => {
    task().subject = r('sponsor-1')
    expect((await getTaskEditorData('task-li', CONF_A))!.tagByHand).toEqual([
      {
        name: 'Acme',
        url: 'https://www.linkedin.com/company/acme',
        kind: 'company',
      },
    ])
  })

  it('lists nobody when the subject has no LinkedIn link', async () => {
    task().subject = r('sp-3')
    expect((await getTaskEditorData('task-li', CONF_A))!.tagByHand).toEqual([])
    delete task().subject
    expect((await getTaskEditorData('task-li', CONF_A))!.tagByHand).toEqual([])
  })

  it('lists nobody for a Task that does not post on LinkedIn', async () => {
    Object.assign(task(), { channel: 'bluesky' })
    expect((await getTaskEditorData('task-li', CONF_A))!.tagByHand).toEqual([])
    // A Task that is not a post, even one carrying a stray LinkedIn channel.
    Object.assign(task(), {
      channel: 'linkedin',
      kind: 'speakerOutreach',
      status: 'open',
    })
    expect((await getTaskEditorData('task-li', CONF_A))!.tagByHand).toEqual([])
  })

  it('never sends the subject’s links or opt-out to the client', async () => {
    speaker('sp-1').socialTagOptOut = true
    const data = await getTaskEditorData('task-li', CONF_A)
    expect(data!.task.subject).toEqual({
      _id: 'sp-1',
      type: 'speaker',
      name: 'Ada',
      slug: 'ada',
    })
  })
})

describe('getTaskLinkInputs', () => {
  it('returns what the tagged link is derived from', async () => {
    expect(await getTaskLinkInputs('task-li', CONF_A)).toEqual({
      kind: 'publishing',
      channel: 'linkedin',
      taskKey: 'cfpOpen:linkedin',
      campaignKey: 'cfp',
      variantId: 'variant-li',
    })
  })

  it('is null across conferences', async () => {
    expect(await getTaskLinkInputs('task-li', CONF_B)).toBeNull()
  })
})

describe('getTaskForVariant', () => {
  it('finds the Task that owns a variant, within the conference only', async () => {
    expect(await getTaskForVariant('variant-li', CONF_A)).toBe('task-li')
    expect(await getTaskForVariant('variant-li', CONF_B)).toBeNull()
    expect(await getTaskForVariant('variant-li-sibling', CONF_A)).toBeNull()
  })
})

describe('isConferenceOrganizer', () => {
  it('is true only for a member of the conference organizers', async () => {
    expect(await isConferenceOrganizer(CONF_A, 'sp-2')).toBe(true)
    expect(await isConferenceOrganizer(CONF_A, 'sp-9')).toBe(false)
    expect(await isConferenceOrganizer(CONF_B, 'sp-1')).toBe(false)
  })
})

describe('writes', () => {
  it('updateTaskFields compare-and-sets on the revision and reports a conflict', async () => {
    expect(
      await updateTaskFields('task-check', 'rev-c', { status: 'done' }, [
        'skipReason',
      ]),
    ).toBe(true)
    expect(h.ops).toEqual([
      {
        op: 'patch',
        id: 'task-check',
        body: [
          { ifRevisionId: 'rev-c' },
          { set: { status: 'done', updatedAt: '2026-09-15T10:00:00.000Z' } },
          { unset: ['skipReason'] },
        ],
      },
    ])
    h.state.commitError = Object.assign(new Error('revision mismatch'), {
      statusCode: 409,
    })
    expect(await updateTaskFields('task-check', 'rev-c', {})).toBe(false)
  })

  it('keeps the pending marker when the campaign revision changes before finalization commits', async () => {
    const saved = { handoffPending: true }
    const commit = vi.spyOn(h.tx, 'commit').mockImplementationOnce(async () => {
      const conflict = h.ops.some(
        (op) =>
          op.id === 'camp-A' &&
          (op.body as Record<string, unknown>[]).some(
            (field) =>
              field.ifRevisionId && field.ifRevisionId !== 'campaign-after',
          ),
      )
      if (conflict)
        throw Object.assign(new Error('revision mismatch'), { statusCode: 409 })
      for (const op of h.ops) {
        if (op.id === 'task-render') {
          for (const field of op.body as Record<string, unknown>[])
            Object.assign(saved, field.set)
        }
      }
      return {}
    })
    try {
      const landed = await updateTaskFields(
        'task-render',
        'render-rev',
        { handoffPending: false },
        [],
        { id: 'camp-A', rev: 'campaign-before' },
      )
      expect(saved.handoffPending).toBe(true)
      expect(landed).toBe(false)
    } finally {
      commit.mockRestore()
    }
  })

  it('advances the campaign revision barrier in the same transaction as a prerequisite edit', async () => {
    await updateTaskFields(
      'task-li',
      'rev-li',
      { prerequisites: [r('task-render')] },
      [],
      { id: 'camp-A' },
    )
    expect(h.ops).toEqual([
      {
        op: 'patch',
        id: 'task-li',
        body: [
          { ifRevisionId: 'rev-li' },
          {
            set: {
              prerequisites: [r('task-render')],
              updatedAt: '2026-09-15T10:00:00.000Z',
            },
          },
        ],
      },
      {
        op: 'patch',
        id: 'camp-A',
        body: [{ set: { updatedAt: '2026-09-15T10:00:00.000Z' } }],
      },
    ])
  })

  it('approveTask moves the variant to scheduled and records the approval in ONE transaction', async () => {
    const ok = await approveTask({
      taskId: 'task-li',
      taskRev: 'rev-li',
      by: 'sp-2',
      at: '2026-09-15T10:00:00.000Z',
      variant: {
        id: 'variant-li',
        rev: 'rev-v',
        scheduledAt: '2027-01-10T07:00:00.000Z',
        link: 'https://x.test/cfp?utm_source=linkedin',
        shortCode: 'abc987',
      },
    })
    expect(ok).toBe(true)
    expect(h.ops.map((o) => o.id)).toEqual(['variant-li', 'task-li'])
    expect(h.ops[0].body).toEqual([
      { ifRevisionId: 'rev-v' },
      {
        set: {
          status: 'scheduled',
          scheduledAt: '2027-01-10T07:00:00.000Z',
          link: 'https://x.test/cfp?utm_source=linkedin',
          // The short code rides the SAME transaction as the re-derived link
          // (short-links spec §2.2), so the backfill can never half-land.
          shortCode: 'abc987',
          attemptCount: 0,
          updatedAt: '2026-09-15T10:00:00.000Z',
        },
      },
    ])
    expect(h.ops[1].body).toEqual([
      { ifRevisionId: 'rev-li' },
      {
        set: {
          approvedBy: { _type: 'reference', _ref: 'sp-2', _weak: true },
          approvedAt: '2026-09-15T10:00:00.000Z',
          updatedAt: '2026-09-15T10:00:00.000Z',
        },
      },
    ])
  })

  it('setTaskDate re-times the variant of a publishing Task and un-anchors the Task', async () => {
    await setTaskDate({
      taskId: 'task-li',
      taskRev: 'rev-li',
      at: '2027-02-01T08:00:00.000Z',
      variant: { id: 'variant-li', rev: 'rev-v' },
    })
    expect(h.ops[0]).toMatchObject({
      id: 'variant-li',
      body: [
        { ifRevisionId: 'rev-v' },
        {
          set: expect.objectContaining({
            scheduledAt: '2027-02-01T08:00:00.000Z',
            usesCustomTime: true,
          }),
        },
      ],
    })
    expect(h.ops[1]).toMatchObject({
      id: 'task-li',
      body: [
        { ifRevisionId: 'rev-li' },
        { set: { provisional: false, updatedAt: expect.any(String) } },
        { unset: ['milestone', 'offsetDays'] },
      ],
    })
  })

  it('setTaskDate sets dueAt on a non-publishing Task', async () => {
    await setTaskDate({
      taskId: 'task-render',
      taskRev: 'rev-render',
      at: '2027-02-01T08:00:00.000Z',
      variant: null,
    })
    expect(h.ops).toHaveLength(1)
    expect(h.ops[0].body).toEqual([
      { ifRevisionId: 'rev-render' },
      {
        set: {
          dueAt: '2027-02-01T08:00:00.000Z',
          provisional: false,
          updatedAt: expect.any(String),
        },
      },
      { unset: ['milestone', 'offsetDays'] },
    ])
  })

  it('deleteTask removes the Task, its variant and (when it was the last) its post, and drops it from dependants', async () => {
    // The post has a second variant, so the post stays.
    const ok = await deleteTask({
      taskId: 'task-li',
      taskRev: 'rev-li',
      conferenceId: CONF_A,
      variant: { id: 'variant-li', rev: 'rev-v', postId: 'post-li' },
      dependantIds: ['task-check'],
    })
    expect(ok).toBe(true)
    expect(h.ops).toEqual([
      {
        op: 'patch',
        id: 'task-check',
        body: [{ unset: ['prerequisites[_ref == "task-li"]'] }],
      },
      {
        op: 'patch',
        id: 'variant-li',
        body: [
          { ifRevisionId: 'rev-v' },
          { set: { updatedAt: expect.any(String) } },
        ],
      },
      { op: 'delete', id: 'variant-li' },
      { op: 'delete', id: 'drafts.variant-li' },
      {
        op: 'patch',
        id: 'task-li',
        body: [
          { ifRevisionId: 'rev-li' },
          { set: { updatedAt: expect.any(String) } },
        ],
      },
      { op: 'delete', id: 'task-li' },
      { op: 'delete', id: 'drafts.task-li' },
    ])
  })

  it('deleteTask deletes the post too when no other variant remains', async () => {
    h.dataset.splice(
      h.dataset.findIndex((d) => d._id === 'variant-li-sibling'),
      1,
    )
    await deleteTask({
      taskId: 'task-li',
      taskRev: 'rev-li',
      conferenceId: CONF_A,
      variant: { id: 'variant-li', rev: 'rev-v', postId: 'post-li' },
      dependantIds: [],
    })
    expect(h.ops.filter((o) => o.op === 'delete').map((o) => o.id)).toEqual([
      'variant-li',
      'drafts.variant-li',
      'post-li',
      'drafts.post-li',
      'task-li',
      'drafts.task-li',
    ])
  })

  it('deleteTask never deletes a post of another conference, even when unreferenced', async () => {
    h.dataset.splice(
      h.dataset.findIndex((d) => d._id === 'variant-li-sibling'),
      1,
    )
    const post = h.dataset.find((d) => d._id === 'post-li')!
    post.conference = r(CONF_B)
    await deleteTask({
      taskId: 'task-li',
      taskRev: 'rev-li',
      conferenceId: CONF_A,
      variant: { id: 'variant-li', rev: 'rev-v', postId: 'post-li' },
      dependantIds: [],
    })
    expect(h.ops.filter((o) => o.op === 'delete').map((o) => o.id)).toEqual([
      'variant-li',
      'drafts.variant-li',
      'task-li',
      'drafts.task-li',
    ])
  })

  it('deleteTask reports a conflict when a guard fails', async () => {
    h.state.commitError = Object.assign(new Error('Revision mismatch'), {
      statusCode: 409,
    })
    expect(
      await deleteTask({
        taskId: 'task-render',
        taskRev: 'rev-render',
        conferenceId: CONF_A,
        variant: null,
        dependantIds: [],
      }),
    ).toBe(false)
  })
})
