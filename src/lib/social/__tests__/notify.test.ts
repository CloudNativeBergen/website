import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ createNotifications: vi.fn() }))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: h.createNotifications,
}))

import {
  manualDueNotifications,
  manualPostPath,
  notifyAwaitingManual,
} from '../notify'
import type { PublishableVariant } from '../store'
import { makeVariant } from './memory-store'

const publishable = (
  overrides: Partial<PublishableVariant> = {},
): PublishableVariant => ({
  ...makeVariant({ platform: 'linkedin' }),
  postAttachments: [],
  conferenceDomains: [],
  postCreatedBy: 'sp-owner',
  marketingTaskId: null,
  ...overrides,
})

describe('manualDueNotifications (#1006, spec §3.3)', () => {
  it('addresses the post creator with a platform title, a body excerpt and a deep link to the view', () => {
    const items = manualDueNotifications([
      publishable({ _id: 'v/1', body: '  Tickets are live  ' }),
    ])
    expect(items).toEqual([
      {
        recipientId: 'sp-owner',
        conferenceId: 'conf-1',
        notificationType: 'social_manual_due',
        title: 'Post by hand on LinkedIn',
        message: 'Tickets are live',
        link: '/admin/marketing/posts?variant=v%2F1',
      },
    ])
    expect(items[0].link).toBe(manualPostPath('v/1'))
  })

  it('shortens a long body on a grapheme boundary and never names an actor', () => {
    const body = `${'a'.repeat(138)}👩‍💻 and more`
    const [item] = manualDueNotifications([publishable({ body })])
    expect(item.message).toBe(`${'a'.repeat(138)}…`)
    expect(item.message!.length).toBeLessThanOrEqual(140)
    expect(item.actorId).toBeUndefined()
  })

  it('notifies nobody for a post without a creator rather than every organizer', () => {
    expect(
      manualDueNotifications([publishable({ postCreatedBy: null })]),
    ).toEqual([])
  })

  it('one row per variant, each to its own post creator', () => {
    const items = manualDueNotifications([
      publishable({ _id: 'a', postCreatedBy: 'sp-1' }),
      publishable({ _id: 'b', postCreatedBy: 'sp-2', platform: 'bluesky' }),
    ])
    expect(items.map((i) => [i.recipientId, i.title])).toEqual([
      ['sp-1', 'Post by hand on LinkedIn'],
      ['sp-2', 'Post by hand on Bluesky'],
    ])
  })
})

describe('notifyAwaitingManual', () => {
  it('fans the whole tick out through createNotifications in one call', async () => {
    h.createNotifications.mockResolvedValue(2)
    const count = await notifyAwaitingManual([
      publishable({ _id: 'a' }),
      publishable({ _id: 'b' }),
      publishable({ _id: 'c', postCreatedBy: null }),
    ])
    expect(count).toBe(2)
    expect(h.createNotifications).toHaveBeenCalledTimes(1)
    expect(h.createNotifications.mock.calls[0][0]).toHaveLength(2)
  })
})
