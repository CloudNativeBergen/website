/**
 * @vitest-environment node
 *
 * TENANCY REGRESSIONS for the messaging retention cascade (#616, slice S2).
 *
 * The cron's conference ENUMERATION is cross-tenant by design (annotated
 * `groq-global:` — the 24-month purge horizon), but everything it DELETES for
 * an expired conference must be that one conference's. Two bounds are pinned
 * here with a real GROQ engine over a two-tenant fixture (the
 * organizerCount.tenancy.test.ts convention — assertions about the DOCUMENTS
 * selected, not the query text):
 *
 *  1. the conversation/message/preference cascade keys off the scopedFetch'd
 *     conversation set, so a live tenant's threads never enter an expired
 *     tenant's purge; and
 *  2. the notification read carries the conference predicate IN the query
 *     (the S2 conversion): notifications are matched by DEEP LINK, and a link
 *     collision across tenants — adversarial data, or a bug in link
 *     construction — must not let one tenant's purge delete another's rows.
 *     The fixture plants exactly that collision.
 */

const h = vi.hoisted(() => ({ fetch: vi.fn() }))

// Ordered record of every committed delete, flattened — the tenancy question
// is WHICH ids get deleted, not the chunking (retention.test.ts pins that).
const deletedIds: string[] = []
const transactionApi = {
  delete: (id: string) => {
    deletedIds.push(id)
    return transactionApi
  },
  commit: vi.fn().mockResolvedValue({ transactionId: 'tx' }),
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientWrite: { transaction: () => transactionApi },
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'
import { deleteExpiredMessagingData } from './retention'
import { conversationLinkPath } from './links'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const ref = (id: string) => ({ _type: 'reference', _ref: id })

const convoA = { _id: 'convo-a', conversationType: 'general' as const }
const collidingLink = conversationLinkPath(
  { ...convoA, proposalId: undefined },
  true,
)

/**
 * Tenant A is EXPIRED (endDate far past the 24-month horizon); tenant B is
 * live. The decisive row is `notif-b-collide`: tenant B's notification whose
 * deep link EQUALS tenant A's conversation link. Without the conference
 * predicate the purge of A deletes it.
 */
const dataset: Doc[] = [
  {
    _id: 'conf-a',
    _type: 'conference',
    title: 'Conf A',
    endDate: '2020-01-01',
  },
  {
    _id: 'conf-b',
    _type: 'conference',
    title: 'Conf B',
    endDate: '2999-01-01',
  },

  // Tenant A's thread (to be purged).
  {
    _id: 'convo-a',
    _type: 'conversation',
    conversationType: 'general',
    conference: ref('conf-a'),
  },
  { _id: 'msg-a', _type: 'message', conversation: ref('convo-a') },
  {
    _id: 'pref-a',
    _type: 'conversationPreference',
    conversation: ref('convo-a'),
  },
  {
    _id: 'notif-a',
    _type: 'notification',
    notificationType: 'message_received',
    conference: ref('conf-a'),
    link: collidingLink,
  },

  // Tenant B's thread (must be untouched).
  {
    _id: 'convo-b',
    _type: 'conversation',
    conversationType: 'general',
    conference: ref('conf-b'),
  },
  { _id: 'msg-b', _type: 'message', conversation: ref('convo-b') },
  {
    _id: 'pref-b',
    _type: 'conversationPreference',
    conversation: ref('convo-b'),
  },
  // THE COLLISION: tenant B's notification carrying tenant A's link.
  {
    _id: 'notif-b-collide',
    _type: 'notification',
    notificationType: 'message_received',
    conference: ref('conf-b'),
    link: collidingLink,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  deletedIds.length = 0
  // No branching on the query text: the deletes are whatever the sent queries
  // actually select, so a widened predicate widens the delete set and fails.
  h.fetch.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
})

describe('deleteExpiredMessagingData — one tenant’s purge deletes ONE tenant’s data', () => {
  it('purges expired tenant A completely and touches nothing of live tenant B', async () => {
    const summary = await deleteExpiredMessagingData()

    expect(summary).toEqual({
      conferences: 1,
      messages: 1,
      conversations: 1,
      preferences: 1,
      notifications: 1,
    })
    expect([...deletedIds].sort()).toEqual([
      'convo-a',
      'msg-a',
      'notif-a',
      'pref-a',
    ])
  })

  // THE SABOTAGE CASE: the notification read is link-matched, and tenant B's
  // `notif-b-collide` carries tenant A's exact link. Only the in-query
  // conference predicate keeps it out of A's delete set — remove the
  // scopedFetch scope and this fails.
  it('does not delete another tenant’s notification even when its deep link collides', async () => {
    await deleteExpiredMessagingData()

    expect(deletedIds).toContain('notif-a')
    expect(deletedIds).not.toContain('notif-b-collide')
  })
})
