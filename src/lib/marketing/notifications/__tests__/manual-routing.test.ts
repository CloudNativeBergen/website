// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  routingReadFails: false,
  dueReadFails: false,
  createNotifications: vi.fn(async (items: unknown[]) => items.length),
}))

async function fetch(query: string, params: Record<string, unknown>) {
  if (h.dueReadFails && query.includes('"due":'))
    throw new Error('Due lookup unavailable')
  if (h.routingReadFails && query.includes('_id in $variantIds'))
    throw new Error('Task routing lookup unavailable')
  return (await evaluate(parse(query), { dataset: h.dataset, params })).get()
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch },
  clientWrite: {
    fetch,
    patch: (id: string) => {
      let revision: string | undefined
      let fields: Record<string, unknown> = {}
      const patch = {
        setIfMissing: () => patch,
        append: () => patch,
        ifRevisionId: (value: string) => {
          revision = value
          return patch
        },
        set: (value: Record<string, unknown>) => {
          fields = value
          return patch
        },
        commit: async () => {
          const doc = h.dataset.find((row) => row._id === id)!
          if (revision && doc._rev !== revision)
            throw Object.assign(new Error('conflict'), { statusCode: 409 })
          Object.assign(doc, fields, { _rev: `${doc._rev}-next` })
          return doc
        },
      }
      return patch
    },
  },
}))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: h.createNotifications,
}))

import { notifyMarketingAwaitingManual } from '../sanity'
import { runMarketingReminders } from '@/lib/marketing/reminders'
import { sanitySocialVariantStore } from '@/lib/social/sanity'
import { runPublishTick } from '@/lib/social/publish-engine'

const now = '2026-09-13T10:00:00.000Z'
const variant = () => ({
  _id: 'variant-1',
  _rev: 'variant-rev',
  _type: 'socialPostVariant',
  conference: { _ref: 'conf-1' },
  post: { _ref: 'post-1' },
  platform: 'bluesky',
  body: 'Hello from the conference',
  status: 'scheduled',
  scheduledAt: now,
})
const task = (overrides: Record<string, unknown> = {}) => ({
  _id: 'task-1',
  _rev: 'task-rev',
  _type: 'marketingTask',
  conference: { _ref: 'conf-1' },
  kind: 'publishing',
  title: 'Launch',
  variant: { _ref: 'variant-1' },
  assignee: { _ref: 'assignee' },
  ...overrides,
})

beforeEach(() => {
  h.dataset = [
    { _id: 'conf-1', _type: 'conference' },
    {
      _id: 'post-1',
      _type: 'socialPost',
      conference: { _ref: 'conf-1' },
      createdBy: { _ref: 'creator' },
    },
    variant(),
  ]
  h.routingReadFails = false
  h.dueReadFails = false
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('manual handoff routing through the real Sanity adapters', () => {
  it.each(['present', 'missing'])(
    'delivers exactly one due notification to the assignee across a failed Task lookup and the next healthy run (snapshot %s)',
    async (snapshot) => {
      h.dataset.push(task())
      h.routingReadFails = true
      const result = await runPublishTick({
        store: sanitySocialVariantStore,
        now: new Date(now),
        resolveAdapter: async () => null,
        onAwaitingManual: async (variants) => {
          // A malformed/older caller must not turn unknown linkage into standalone.
          if (snapshot === 'missing')
            for (const row of variants)
              Reflect.deleteProperty(row, 'marketingTaskId')
          await notifyMarketingAwaitingManual(variants)
        },
      })
      expect(result.awaitingManual).toBe(1)
      h.routingReadFails = false
      await runMarketingReminders('conf-1', now)
      await runMarketingReminders('conf-1', now)

      expect(
        h.createNotifications.mock.calls.flatMap(([items]) => items),
      ).toEqual([
        {
          recipientId: 'assignee',
          conferenceId: 'conf-1',
          notificationType: 'marketing_task_due',
          title: 'Marketing task due',
          message: 'Launch',
          link: '/admin/marketing/tasks/task-1',
        },
      ])
    },
  )

  it('retries a failed initial read and preserves standalone creator delivery when the later Task lookup stays unavailable', async () => {
    // These references must not misclassify this live standalone variant.
    h.dataset.push(
      task({ _id: 'foreign', conference: { _ref: 'conf-other' } }),
      task({ _id: 'drafts.task-1' }),
      task({ _id: 'versions.release.task-1' }),
    )
    const options = {
      store: sanitySocialVariantStore,
      now: new Date(now),
      resolveAdapter: async () => null,
      onAwaitingManual: notifyMarketingAwaitingManual,
    }
    h.dueReadFails = true
    h.routingReadFails = true
    await expect(runPublishTick(options)).rejects.toThrow(
      'Due lookup unavailable',
    )
    expect(h.dataset.find((row) => row._id === 'variant-1')!.status).toBe(
      'scheduled',
    )
    h.dueReadFails = false
    expect(await runPublishTick(options)).toMatchObject({ awaitingManual: 1 })
    expect(await runPublishTick(options)).toMatchObject({ awaitingManual: 0 })

    expect(
      h.createNotifications.mock.calls.flatMap(([items]) => items),
    ).toEqual([
      {
        recipientId: 'creator',
        conferenceId: 'conf-1',
        notificationType: 'social_manual_due',
        title: 'Post by hand on Bluesky',
        message: 'Hello from the conference',
        link: '/admin/marketing/posts?variant=variant-1',
      },
    ])
  })
})
