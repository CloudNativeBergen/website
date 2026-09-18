// @vitest-environment node
import { expect, it, vi, beforeEach } from 'vitest'
import { materializeTask, appendRecords } from '../materialize'
const h = vi.hoisted(() => ({
  docs: [] as Record<string, unknown>[],
  error: false,
  commits: 0,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: {
    transaction: () => {
      const creates: Record<string, unknown>[] = []
      const patches: Record<string, unknown>[] = []
      const tx = {
        create: (doc: Record<string, unknown>) => {
          creates.push(doc)
          return tx
        },
        patch: (_id: string, fn: (p: unknown) => unknown) => {
          let guard: string | null = null
          const p = {
            ifRevisionId: (rev: string) => {
              guard = rev
              return p
            },
            set: (fields: Record<string, unknown>) => {
              patches.push({ _id, guard, ...fields })
              return p
            },
          }
          fn(p)
          return tx
        },
        commit: async () => {
          h.commits++
          if (h.error)
            throw Object.assign(new Error('Conflict'), { statusCode: 409 })
          h.docs.push(...creates, ...patches)
          return {}
        },
      }
      return tx
    },
  },
}))
import { createMarketingTask } from '../sanity'
beforeEach(() => {
  h.docs = []
  h.error = false
  h.commits = 0
})
function records(channel: 'bluesky' | 'linkedin' = 'bluesky') {
  let counter = 0
  return materializeTask({
    recipe: {
      key: channel,
      beat: 'custom',
      subjectSource: 'none',
      title: 'Manual',
      kind: 'publishing',
      channel,
      targetPage: '/tickets',
    },
    taskId: `task-${channel}`,
    key: `custom-${channel}`,
    campaign: { _id: 'campaign', key: 'cfp' },
    planId: 'plan',
    conference: { _id: 'conf', baseUrl: 'https://example.test' },
    values: {},
    at: '2027-01-03T17:00:00.000Z',
    anchor: null,
    provisional: false,
    assigneeId: 'admin',
    prerequisiteIds: [],
    body: '',
    alt: '',
    origin: 'manual',
    newId: (type) => `${type}-${channel}-${counter++}`,
  })
}
it('commits empty draft post/variant/Task and divergence together', async () => {
  const rows = records()
  expect(await createMarketingTask(rows, 'conf')).toBe(true)
  expect(h.commits).toBe(1)
  expect(h.docs).toHaveLength(4)
  expect(h.docs.find((d) => d._type === 'socialPost')).toMatchObject({
    body: '',
    conference: { _ref: 'conf' },
  })
  expect(h.docs.find((d) => d._type === 'socialPostVariant')).toMatchObject({
    body: '',
    status: 'draft',
    platform: 'bluesky',
    link: 'https://example.test/tickets?utm_source=bluesky&utm_medium=social&utm_campaign=cfp&utm_content=custom-bluesky',
  })
  expect(h.docs.find((d) => d._type === 'marketingTask')).toMatchObject({
    key: 'custom-bluesky',
    origin: 'manual',
  })
  expect(h.docs.find((d) => d._id === 'plan')).toMatchObject({
    structurallyEdited: true,
  })
})
it('keeps a requested sibling in the same transaction and rolls back every record on conflict', async () => {
  const rows = records()
  appendRecords(rows, records('linkedin'))
  h.error = true
  expect(await createMarketingTask(rows, 'conf')).toBe(false)
  expect(h.docs).toEqual([])
  h.error = false
  expect(await createMarketingTask(rows, 'conf')).toBe(true)
  expect(
    h.docs.filter((d) => d._type === 'marketingTask').map((d) => d.key),
  ).toEqual(['custom-bluesky', 'custom-linkedin'])
  expect(
    h.docs
      .filter((d) => d._type === 'socialPostVariant')
      .map((d) => [d.platform, d.status, d.body]),
  ).toEqual([
    ['bluesky', 'draft', ''],
    ['linkedin', 'draft', ''],
  ])
})

it('guards the plan on the revision its caller read, when it read one', () => {
  // The compare-and-set that makes Task creation and plan/Campaign deletion
  // mutually exclusive in BOTH commit orders. Deletion guards the plan in its
  // first bundle, so a Task created after a delete starts loses; without this,
  // a Task whose validation read happened before the delete and whose commit
  // landed after it still succeeded, holding a weak reference to a Campaign
  // that no longer exists.
  return (async () => {
    h.docs.length = 0
    await createMarketingTask(records(), 'conf', 'plan-rev-7')
    const plan = h.docs.find((d) => d.structurallyEdited === true)
    expect(plan?.guard).toBe('plan-rev-7')

    // No revision read: the patch still lands, unguarded, so callers that do
    // not have one are not broken.
    h.docs.length = 0
    await createMarketingTask(records(), 'conf')
    expect(h.docs.find((d) => d.structurallyEdited === true)?.guard).toBeNull()
  })()
})
