// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  createNotifications: vi.fn(async (items: unknown[]) => items.length),
  reminders: vi.fn(),
  readError: false,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: async (query: string, params: Record<string, unknown>) => {
      if (h.readError) throw new Error('read failed')
      return (
        await evaluate(parse(query), { dataset: h.dataset, params })
      ).get()
    },
  },
}))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: h.createNotifications,
}))
vi.mock('@/lib/marketing/reminders', () => ({
  runMarketingReminders: h.reminders,
}))

import {
  notifyMarketingFailure,
  notifyMarketingAwaitingManual,
} from '../sanity'
import { runPublishTick } from '@/lib/social/publish-engine'
import {
  makeVariant,
  MemoryVariantStore,
} from '@/lib/social/__tests__/memory-store'
import type { PublishableVariant } from '@/lib/social/store'

const now = new Date('2026-09-13T10:00:00.000Z')
const task = (
  id = 'task-a',
  conferenceId = 'conf-1',
  variantId = 'variant-1',
  assignee: string | null = 'assignee',
) => ({
  _id: id,
  _type: 'marketingTask',
  title: 'Launch',
  kind: 'publishing',
  conference: { _ref: conferenceId },
  variant: { _ref: variantId },
  assignee: assignee ? { _ref: assignee } : null,
})
const publishable = (
  id = 'variant-1',
  conferenceId = 'conf-1',
): PublishableVariant => ({
  ...makeVariant({ _id: id, conferenceId }),
  postCreatedBy: 'creator',
  postAttachments: [],
  conferenceDomains: [],
})
const event = () => ({
  variant: makeVariant(),
  attempt: {
    _key: 'attempt-one',
    at: now.toISOString(),
    outcome: 'rejected' as const,
  },
})

beforeEach(() => {
  h.dataset = []
  h.readError = false
  vi.clearAllMocks()
})

describe('marketing transition notifications', () => {
  it('sends the failure kind immediately to the task assignee with event identity', async () => {
    h.dataset = [task()]
    expect(await notifyMarketingFailure(event())).toBe(1)
    expect(h.createNotifications.mock.calls[0][0]).toEqual([
      {
        recipientId: 'assignee',
        conferenceId: 'conf-1',
        notificationType: 'marketing_task_failed',
        title: 'Marketing task failed',
        message: 'Launch: rejected',
        link: '/admin/marketing/tasks/task-a',
        tag: 'marketing-failure.variant-1.attempt-one',
      },
    ])
  })

  it('selects only the live task in the failing variant conference', async () => {
    h.dataset = [
      task('foreign', 'conf-b'),
      task('drafts.bad'),
      task('versions.release.bad'),
      task(),
    ]
    await notifyMarketingFailure(event())
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      { link: '/admin/marketing/tasks/task-a' },
    ])
  })

  it('does not send to a creator or anyone else when the task has no assignee', async () => {
    h.dataset = [task('task-a', 'conf-1', 'variant-1', null)]
    expect(await notifyMarketingFailure(event())).toBe(0)
    expect(h.createNotifications.mock.calls).toEqual([[[]]])
  })

  it('standalone failure does not introduce a new notification', async () => {
    expect(await notifyMarketingFailure(event())).toBe(0)
    expect(h.createNotifications).toHaveBeenCalledTimes(0)
  })

  it('a task read failure never escapes the already settled business transition', async () => {
    h.readError = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await notifyMarketingFailure(event())).toBe(0)
  })

  it('concurrent stale failure transitions call createNotifications just once, and persist the same event key', async () => {
    h.dataset = [task()]
    const store = new MemoryVariantStore([
      makeVariant({
        status: 'publishing',
        claimedAt: '2026-09-13T09:00:00.000Z',
      }),
    ])
    const options = {
      store,
      now,
      resolveAdapter: async () => null,
      onFailed: notifyMarketingFailure,
    }
    const results = await Promise.all([
      runPublishTick(options),
      runPublishTick(options),
    ])
    expect(results.reduce((sum, row) => sum + row.staleFailed, 0)).toBe(1)
    expect(h.createNotifications).toHaveBeenCalledTimes(1)
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      {
        message: 'Launch: stale-claim',
        tag: `marketing-failure.variant-1.${store.get('variant-1').attempts[0]._key}`,
      },
    ])
  })

  it('task-backed manual handoff suppresses creator notifications and triggers the CAS reminder engine; standalone behavior is preserved', async () => {
    h.dataset = [
      task(),
      ...['variant-1', 'standalone'].map((_id) => ({
        _id,
        _type: 'socialPostVariant',
        conference: { _ref: 'conf-1' },
      })),
    ]
    await notifyMarketingAwaitingManual([
      publishable(),
      publishable('standalone'),
    ])
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      {
        recipientId: 'creator',
        notificationType: 'social_manual_due',
        link: '/admin/marketing/posts?variant=standalone',
      },
    ])
    expect(h.createNotifications.mock.calls[0][0]).toHaveLength(1)
    expect(h.reminders).toHaveBeenCalledWith('conf-1', expect.any(String))
  })

  it('a foreign task cannot suppress a standalone creator notification', async () => {
    h.dataset = [
      task('foreign', 'conf-b'),
      {
        _id: 'variant-1',
        _type: 'socialPostVariant',
        conference: { _ref: 'conf-1' },
      },
    ]
    await notifyMarketingAwaitingManual([publishable()])
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      { recipientId: 'creator' },
    ])
    expect(h.reminders).toHaveBeenCalledTimes(0)
  })
})
