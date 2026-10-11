/**
 * @vitest-environment node
 *
 * The bus handler that writes the not-set notice (#1335), against an
 * in-memory dataset: the organizer query runs through `groq-js`, and the
 * transaction is built by the real `@sanity/client` and applied by
 * `@sanity/mutator` (see `__tests__/helpers/sanityStore.ts` for what that does
 * and does not prove).
 *
 * The handler holds no memory of its own. Every call here stands for a
 * process that has never seen the type, which is the case the document id has
 * to carry. The per-process memo is proven at the two call sites.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SanityStore } from '../../../../__tests__/helpers/sanityStore'

const h = vi.hoisted(() => ({
  store: null as unknown as SanityStore,
  push: vi.fn<(items: { recipientId: string }[]) => Promise<void>>(
    async () => {},
  ),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createSanityStore } =
    await import('../../../../__tests__/helpers/sanityStore')
  h.store = createSanityStore()
  return h.store.clients
})
vi.mock('@/lib/push/send', () => ({ sendPushForNotifications: h.push }))

import { handleTicketTypeNotSetNotification } from './ticketTypeNotSetNotification'
import type { WorkshopTicketTypeNotSetEvent } from '../types'

const ref = (id: string) => ({ _type: 'reference', _ref: id, _key: id })

/** Two organizations; `conf-a-2025` is an earlier edition of `conf-a`'s. */
const DATASET = [
  {
    _id: 'conf-a',
    _type: 'conference',
    organization: { _type: 'reference', _ref: 'org-a' },
    organizers: [ref('sp-anna'), ref('sp-arne')],
  },
  {
    _id: 'conf-a-2025',
    _type: 'conference',
    organization: { _type: 'reference', _ref: 'org-a' },
    organizers: [ref('sp-anna'), ref('sp-former')],
  },
  {
    _id: 'conf-b',
    _type: 'conference',
    organization: { _type: 'reference', _ref: 'org-b' },
    organizers: [ref('sp-bea')],
  },
]

const event = (
  typeName: string,
  conferenceId = 'conf-a',
): WorkshopTicketTypeNotSetEvent => ({
  eventType: 'workshop.ticket-type.not-set',
  timestamp: new Date('2026-10-12T08:00:00Z'),
  conferenceId,
  typeName,
  metadata: { source: 'ticket-sold' },
})

const notifications = () => h.store.ofType('notification')
const recipientsOf = (docs: Record<string, unknown>[]) =>
  docs.map((doc) => (doc.recipient as { _ref: string })._ref).sort()

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.store.reset(DATASET)
})

describe('handleTicketTypeNotSetNotification', () => {
  it('writes one notification per organizer of the conference, in one transaction', async () => {
    await handleTicketTypeNotSetNotification(event('Early Bird'))

    expect(h.store.commits).toHaveLength(1)
    const docs = notifications()
    expect(docs).toHaveLength(2)
    for (const doc of docs) {
      expect(doc).toMatchObject({
        _type: 'notification',
        conference: { _type: 'reference', _ref: 'conf-a' },
        notificationType: 'workshop_ticket_type_not_set',
        title: '“Early Bird” needs a workshop decision',
        message:
          'Choose whether this ticket type grants workshop access. Until then its holders can’t sign up.',
        link: '/admin/workshops',
      })
      // Weak, or the organizer could not be erased while it exists (#851).
      expect(doc.recipient).toMatchObject({ _type: 'reference', _weak: true })
      expect(doc.actor).toBeUndefined()
      expect(doc.readAt).toBeUndefined()
      expect(typeof doc.createdAt).toBe('string')
    }
    expect(recipientsOf(docs)).toEqual(['sp-anna', 'sp-arne'])
  })

  it('stores the type name and nothing about a buyer or an attendee', async () => {
    await handleTicketTypeNotSetNotification(event('Early Bird'))

    const [doc] = notifications()
    expect(Object.keys(doc).sort()).toEqual([
      '_createdAt',
      '_id',
      '_type',
      'conference',
      'createdAt',
      'link',
      'message',
      'notificationType',
      'recipient',
      'title',
    ])
  })

  it('sends nothing to organizers of another conference, in the organization or outside it', async () => {
    await handleTicketTypeNotSetNotification(event('Early Bird'))

    const recipients = recipientsOf(notifications())
    expect(recipients).not.toContain('sp-bea')
    expect(recipients).not.toContain('sp-former')
    expect(recipients).toEqual(['sp-anna', 'sp-arne'])
  })

  it('writes nothing new when a process that never saw the type handles it again', async () => {
    await handleTicketTypeNotSetNotification(event('Early Bird'))
    const first = structuredClone(notifications())

    await handleTicketTypeNotSetNotification(event('Early Bird'))
    await handleTicketTypeNotSetNotification(event(' early bird '))

    expect(notifications()).toEqual(first)
  })

  it('leaves a notification the organizer has read as read', async () => {
    await handleTicketTypeNotSetNotification(event('Early Bird'))
    const [doc] = notifications()
    doc.readAt = '2026-10-12T09:00:00.000Z'

    await handleTicketTypeNotSetNotification(event('Early Bird'))

    expect(notifications()).toHaveLength(2)
    expect(notifications()[0].readAt).toBe('2026-10-12T09:00:00.000Z')
  })

  it('gives a different not-set type its own notifications', async () => {
    await handleTicketTypeNotSetNotification(event('Early Bird'))
    await handleTicketTypeNotSetNotification(event('Late Bird'))

    expect(notifications().map((doc) => doc.title)).toEqual([
      '“Early Bird” needs a workshop decision',
      '“Early Bird” needs a workshop decision',
      '“Late Bird” needs a workshop decision',
      '“Late Bird” needs a workshop decision',
    ])
  })

  it('gives the same type name on another conference its own notifications', async () => {
    await handleTicketTypeNotSetNotification(event('Early Bird'))
    // `sp-anna` organizes both editions: she gets one for each.
    await handleTicketTypeNotSetNotification(event('Early Bird', 'conf-a-2025'))

    const forEarlier = notifications().filter(
      (doc) => (doc.conference as { _ref: string })._ref === 'conf-a-2025',
    )
    expect(recipientsOf(forEarlier)).toEqual(['sp-anna', 'sp-former'])
    expect(notifications()).toHaveLength(4)
  })

  it('pushes to the organizers it wrote a notification for, and to nobody on a repeat', async () => {
    await handleTicketTypeNotSetNotification(event('Early Bird'))

    expect(h.push).toHaveBeenCalledTimes(1)
    expect(
      h.push.mock.calls[0][0].map((item) => item.recipientId).sort(),
    ).toEqual(['sp-anna', 'sp-arne'])

    await handleTicketTypeNotSetNotification(event('Early Bird'))

    expect(h.push).toHaveBeenCalledTimes(1)
  })

  it('resolves and writes nothing when the write fails', async () => {
    h.store.failWrites()

    await expect(
      handleTicketTypeNotSetNotification(event('Early Bird')),
    ).resolves.toBeUndefined()

    expect(notifications()).toEqual([])
    expect(h.push).not.toHaveBeenCalled()
  })

  it('resolves when the conference has no organizers or does not exist', async () => {
    await expect(
      handleTicketTypeNotSetNotification(event('Early Bird', 'conf-gone')),
    ).resolves.toBeUndefined()

    expect(h.store.commits).toEqual([])
  })
})
