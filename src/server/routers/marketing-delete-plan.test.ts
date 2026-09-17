// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
const h = vi.hoisted(() => ({
  conference: vi.fn(),
  read: vi.fn(),
  tree: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.conference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.read },
  clientWrite: { patch: vi.fn(), fetch: vi.fn() },
}))
vi.mock('@/lib/marketing/deletion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/marketing/deletion')>()),
  readDeletionTree: h.tree,
  deletePlanTree: h.remove,
}))
import { marketingRouter } from './marketing'
const t = initTRPC.context<Context>().create()
const conference = {
  _id: 'conf-A',
  title: 'Cloud Native Bergen',
  organization: { _ref: 'org-A' },
  domains: ['example.com'],
}
const caller = () => {
  const speaker = { _id: 'admin', organizerOrgIds: ['org-A'] }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(marketingRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', speaker, user },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}
function tree(status = 'draft') {
  return {
    plan: { _id: 'restored-plan', _rev: 'p' },
    campaigns: [{ _id: 'campaign', _rev: 'c', key: 'cfp' }],
    tasks: [
      {
        _id: 'task',
        _rev: 't',
        variant: {
          _id: 'variant',
          _rev: 'v',
          status,
          postId: 'post',
          ownPost: true,
          siblingVariantIds: [],
          survivingTaskIds: [],
        },
        survivingDependantIds: [],
      },
    ],
    snapshots: 12,
    strongSnapshots: 0,
    draftDocIds: [],
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  h.conference.mockResolvedValue({ conference, error: null })
  h.tree.mockResolvedValue(tree())
  h.remove.mockResolvedValue(true)
})
describe('plan deletion boundary', () => {
  it('computes counts, preservation, and typed decision from one scoped tree read', async () => {
    h.tree.mockResolvedValue(tree('published'))
    expect(await caller().plan.deletionPreview()).toEqual({
      campaigns: 1,
      tasks: 1,
      publishedTasks: 1,
      snapshots: 12,
      requiresTypedConfirmation: true,
      conferenceTitle: conference.title,
    })
    expect(h.tree).toHaveBeenCalledExactlyOnceWith('conf-A', undefined)
  })
  it('refuses a foreign conference before reading its plan', async () => {
    h.conference.mockResolvedValue({
      conference: {
        ...conference,
        _id: 'conf-B',
        organization: { _ref: 'org-B' },
      },
      error: null,
    })
    await expect(caller().plan.delete({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(h.tree).not.toHaveBeenCalled()
    expect(h.remove).not.toHaveBeenCalled()
  })
  it('rejects an injected plan or conference id before the read', async () => {
    await expect(
      caller().plan.delete({
        planId: 'foreign',
        conferenceId: 'conf-B',
      } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.tree).not.toHaveBeenCalled()
  })
  it('refuses publishing at preview and again before delete', async () => {
    h.tree.mockResolvedValue(tree('publishing'))
    const refused = {
      code: 'BAD_REQUEST',
      message: 'The post is being published right now. Try again in a minute.',
    }
    await expect(caller().plan.deletionPreview()).rejects.toMatchObject(refused)
    await expect(
      caller().plan.delete({ confirmTitle: conference.title }),
    ).rejects.toMatchObject(refused)
  })
  it('requires the exact title on a direct mutation with published Tasks', async () => {
    h.tree.mockResolvedValue(tree('published'))
    await expect(
      caller().plan.delete({ confirmTitle: 'wrong' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Type the conference title to confirm deletion.',
    })
    await expect(caller().plan.delete({})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Type the conference title to confirm deletion.',
    })
    expect(
      await caller().plan.delete({ confirmTitle: conference.title }),
    ).toEqual({ success: true })
    expect(h.remove).toHaveBeenCalledExactlyOnceWith({
      conferenceId: 'conf-A',
      tree: tree('published'),
      deletePlan: true,
    })
  })
  it('rechecks publication after a draft-only preview', async () => {
    expect(
      (await caller().plan.deletionPreview()).requiresTypedConfirmation,
    ).toBe(false)
    h.tree.mockResolvedValue(tree('published'))
    await expect(caller().plan.delete({})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Type the conference title to confirm deletion.',
    })
  })
  it.each(['draft', 'awaiting-manual'])(
    'allows %s without a typed title',
    async (status) => {
      h.tree.mockResolvedValue(tree(status))
      expect(await caller().plan.delete({})).toEqual({ success: true })
      expect(h.remove).toHaveBeenCalledWith({
        conferenceId: 'conf-A',
        tree: tree(status),
        deletePlan: true,
      })
    },
  )
  it('surfaces a transactional revision conflict for retry', async () => {
    h.remove.mockResolvedValue(false)
    await expect(caller().plan.delete({})).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})
