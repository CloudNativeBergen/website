/**
 * @vitest-environment node
 *
 * ROUND-TRIP BUDGET for the messages workspace.
 *
 * One poll tick of `/admin/messages/<id>` calls four procedures —
 * `message.listConversations`, `message.getConversation`, `message.listMessages`
 * and `proposal.admin.getById` — and this file pins how many Sanity round trips
 * that costs, per procedure and per client (live `api.sanity.io` vs the CDN
 * `apicdn.sanity.io`, which is the same authenticated client on a separate,
 * cheaper quota). A future edit that re-amplifies the workspace fails here with
 * the number it changed.
 *
 * NOTHING IS MOCKED BELOW THE SANITY CLIENT: the real routers, the real
 * middlewares and the real messaging/proposal data layer all run, and only the
 * two read clients' `fetch` is instrumented. `next/headers` supplies the request
 * Host (the tenant key) and `next/cache` is neutralised so the conference read's
 * `'use cache'` wrapper cannot hide a round trip from the count — in production
 * that wrapper (`cacheLife('hours')`) absorbs most of the CDN reads counted here,
 * so the CDN figures are a COLD-start ceiling while the live figures are what a
 * warm instance actually bills.
 *
 * The suite also pins the properties the collapse must not have traded away:
 * the access check still runs per procedure, a refused read never fetches
 * messages, the tenant is still an explicit GROQ parameter resolved from the
 * domain, and the read-your-writes reads stay OFF the CDN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: async () => new Map([['host', 'conf.test']]),
}))
vi.mock('next/cache', () => ({
  cacheTag: () => {},
  cacheLife: () => {},
  revalidateTag: () => {},
}))

import {
  clientReadUncached,
  clientReadCached,
  clientWrite,
} from '@/lib/sanity/client'
import { messageRouter } from './message'
import { proposalRouter } from './proposal'
import { clearOrganizerSpeakerIdsCache } from '@/lib/notification/sanity'
import { clearConferenceTeamsCache } from '@/lib/teams'
import type { Context } from '@/server/trpc'

type Mock = ReturnType<typeof vi.fn>
const live = clientReadUncached as unknown as { fetch: Mock }
const cdn = clientReadCached as unknown as { fetch: Mock }

interface Call {
  client: 'live' | 'cdn'
  query: string
  params: Record<string, unknown>
}
let trace: Call[] = []

const CONFERENCE_ID = 'conf-1'
const ORG_ID = 'org-1'

/** The conversation every read in this file resolves to (a proposal thread). */
const CONVERSATION = {
  _id: 'conv-1',
  conferenceId: CONFERENCE_ID,
  conferenceOrgId: ORG_ID,
  conversationType: 'proposal',
  proposalId: 'talk-1',
  proposalTitle: 'A talk',
  proposalSpeakerIds: ['spk-1'],
  createdById: 'spk-1',
  subjectSpeakerId: null,
  subject: 'A talk',
  createdAt: '2026-01-01T00:00:00Z',
  lastMessageAt: '2026-01-02T00:00:00Z',
  status: 'open',
  assignedTo: null,
  archivedAt: null,
  archivedBy: null,
  participants: [
    { partyType: 'speaker', speakerId: 'spk-1' },
    { partyType: 'group', group: 'organizers' },
  ],
}

const INBOX_ROW = {
  _id: 'conv-1',
  conversationType: 'proposal',
  subject: 'A talk',
  proposalId: 'talk-1',
  proposalTitle: 'A talk',
  subjectSpeakerId: null,
  createdAt: '2026-01-01T00:00:00Z',
  lastMessageAt: '2026-01-02T00:00:00Z',
  status: 'open',
  assignedTo: null,
  archivedAt: null,
  lastMessage: null,
  speakerSideName: 'Speaker One',
  speakerSideImage: null,
}

function respond(query: string): unknown {
  if (query.includes('_type == "conference" && ($domain in domains')) {
    return {
      _id: CONFERENCE_ID,
      title: 'Conf',
      organization: { _ref: ORG_ID },
      domains: ['conf.test'],
    }
  }
  if (query.includes('organizers[]._ref')) return ['org-admin']
  if (query.includes('"conversation": *[')) {
    return { conversation: CONVERSATION, preference: null }
  }
  if (query.includes('"unread": *[')) return { unread: [], prefs: [] }
  if (query.includes('_type == "conversation" && conference._ref')) {
    return [INBOX_ROW]
  }
  if (query.includes('_type == "conversation" && _id == $id')) {
    return CONVERSATION
  }
  if (query.includes('_type == "speaker" && _id in $ids')) return []
  if (query.includes('_type == "message" && conversation._ref')) return []
  if (query.includes('_type == "talk" && _id == $id')) {
    // `_organizationId` is the projected org of the talk's conference —
    // `admin.getById` compares it against the request org before serving
    // organizer data (the owner-∨-organizer read alone proves too little).
    return {
      _id: 'talk-1',
      title: 'A talk',
      speakers: [],
      _organizationId: ORG_ID,
    }
  }
  return null
}

/** A caller context. `req` is the per-HTTP-request identity a batch shares. */
function ctxFor(
  overrides: {
    speakerId?: string
    organizerOrgIds?: string[]
    req?: object
  } = {},
): Context {
  const speaker = {
    _id: overrides.speakerId ?? 'org-admin',
    name: 'Caller',
    organizerOrgIds: overrides.organizerOrgIds ?? [ORG_ID],
  }
  const session = { speaker, user: { email: 'o@x.test' } }
  return {
    req: overrides.req ?? {},
    session,
    speaker,
    user: session.user,
  } as unknown as Context
}

const liveCalls = () => trace.filter((c) => c.client === 'live')
const cdnCalls = () => trace.filter((c) => c.client === 'cdn')
const matching = (needle: string) =>
  trace.filter((c) => c.query.includes(needle))

beforeEach(() => {
  trace = []
  clearOrganizerSpeakerIdsCache()
  clearConferenceTeamsCache()
  live.fetch.mockReset()
  cdn.fetch.mockReset()
  const record =
    (client: 'live' | 'cdn') =>
    async (query: string, params: Record<string, unknown> = {}) => {
      trace.push({ client, query, params })
      return respond(query)
    }
  live.fetch.mockImplementation(record('live'))
  cdn.fetch.mockImplementation(record('cdn'))
})

describe('workspace read amplification — per-procedure round-trip budget', () => {
  it('message.listConversations costs 3 live + 2 CDN round trips (cold caches)', async () => {
    await messageRouter.createCaller(ctxFor()).listConversations({})

    // live: the organizer id set (per-instance cached for 60s after this), the
    // inbox page, and ONE combined read for the page's unread counts + the
    // caller's own preference rows.
    expect(liveCalls()).toHaveLength(3)
    // CDN: the domain conference, resolved by the authz waist and by
    // `resolveConferenceId`. Both are `'use cache'` hits in production.
    expect(cdnCalls()).toHaveLength(2)
    expect(matching('"unread": *[')).toHaveLength(1)
    // The two page-scoped reads are ONE round trip, not two.
    expect(matching('_type == "notification"')).toHaveLength(1)
    expect(matching('_type == "conversationPreference"')).toHaveLength(1)
    expect(matching('_type == "notification"')[0]).toBe(
      matching('_type == "conversationPreference"')[0],
    )
  })

  it('message.getConversation costs 1 live + 2 CDN round trips (plus the shared organizer set)', async () => {
    await messageRouter.createCaller(ctxFor()).getConversation({ id: 'conv-1' })

    // ONE live read of its own: the conversation and the caller's own preference
    // in a single object projection (it was two). The second live call is the
    // organizer id set, which is per-instance cached for 60s and shared with
    // every other procedure in the tick — the whole-tick budget below counts it
    // once.
    expect(liveCalls()).toHaveLength(2)
    expect(matching('organizers[]._ref')).toHaveLength(1)
    expect(liveCalls()[0].query).toContain('"conversation": *[')
    expect(liveCalls()[0].query).toContain('"preference": *[')
    // CDN: the domain conference (for the organizer set) + the participant
    // roster, which is display names/avatars only.
    expect(cdnCalls()).toHaveLength(2)
    expect(matching('_type == "speaker" && _id in $ids')).toHaveLength(1)
    expect(matching('_type == "speaker" && _id in $ids')[0].client).toBe('cdn')
  })

  it('message.listMessages costs 1 live round trip when batched with getConversation', async () => {
    // `httpBatchLink` delivers both in ONE HTTP request, i.e. one `ctx.req`.
    const ctx = ctxFor()
    const caller = messageRouter.createCaller(ctx)
    await caller.getConversation({ id: 'conv-1' })
    trace = []
    await caller.listMessages({ conversationId: 'conv-1' })

    expect(liveCalls()).toHaveLength(1)
    expect(liveCalls()[0].query).toContain('_type == "message"')
    // The conversation was NOT re-read.
    expect(matching('"conversation": *[')).toHaveLength(0)
  })

  it('proposal.admin.getById costs 1 live + 1 CDN round trip', async () => {
    await proposalRouter.createCaller(ctxFor()).admin.getById({ id: 'talk-1' })

    expect(liveCalls()).toHaveLength(1)
    expect(cdnCalls()).toHaveLength(1)
    // Everything the context pane needs — speakers, conference, topics,
    // invitations, reviews and `scheduleInfo` — is ONE projection, not a
    // follow-up read per section.
    expect(liveCalls()[0].query).toContain('scheduleInfo')
  })

  it('the whole tick costs 6 live + 5 CDN round trips (was 10 + 5)', async () => {
    const ctx = ctxFor()
    const messages = messageRouter.createCaller(ctx)
    await messages.listConversations({})
    await messages.getConversation({ id: 'conv-1' })
    await messages.listMessages({ conversationId: 'conv-1' })
    await proposalRouter.createCaller(ctx).admin.getById({ id: 'talk-1' })

    expect(liveCalls()).toHaveLength(6)
    expect(cdnCalls()).toHaveLength(5)
  })
})

describe('the per-request conversation cache is scoped to ONE request', () => {
  it('does not carry across two requests (a second request re-reads)', async () => {
    await messageRouter
      .createCaller(ctxFor({ req: {} }))
      .getConversation({ id: 'conv-1' })
    trace = []
    await messageRouter
      .createCaller(ctxFor({ req: {} }))
      .listMessages({ conversationId: 'conv-1' })

    expect(matching('"conversation": *[')).toHaveLength(1)
  })

  it('does not memoize a FAILED load (the next call retries)', async () => {
    const ctx = ctxFor()
    const caller = messageRouter.createCaller(ctx)
    live.fetch.mockImplementationOnce(async () => {
      throw new Error('sanity is down')
    })
    await expect(caller.getConversation({ id: 'conv-1' })).rejects.toThrow(
      'sanity is down',
    )
    trace = []
    // Same request, same caller: a transient failure must not be cached as the
    // answer for the rest of the batch.
    const result = await caller.getConversation({ id: 'conv-1' })
    expect(result.conversation._id).toBe('conv-1')
    expect(matching('"conversation": *[')).toHaveLength(1)
  })

  it('is READ-ONLY: a mutation re-reads the conversation it will act on', async () => {
    // `setStatus` runs after a read in the same request. It must load the
    // document itself rather than act on one an earlier query cached.
    ;(clientWrite as unknown as { patch: Mock }).patch.mockReturnValue({
      set: () => ({ commit: async () => ({}) }),
    })
    const ctx = ctxFor()
    const caller = messageRouter.createCaller(ctx)
    await caller.getConversation({ id: 'conv-1' })
    trace = []
    await caller.setStatus({ conversationId: 'conv-1', status: 'resolved' })

    expect(matching('_type == "conversation" && _id == $id')).toHaveLength(1)
  })

  it('does not serve one caller the conversation another caller loaded', async () => {
    // Same request object, different sessions: the key carries the speaker id,
    // so the second caller performs its own read (and its own access check).
    const req = {}
    await messageRouter
      .createCaller(ctxFor({ req }))
      .getConversation({ id: 'conv-1' })
    trace = []
    await messageRouter
      .createCaller(ctxFor({ req, speakerId: 'spk-1', organizerOrgIds: [] }))
      .getConversation({ id: 'conv-1' })

    expect(matching('"conversation": *[')).toHaveLength(1)
  })
})

describe('authorization and tenant scoping are unchanged', () => {
  const outsider = () =>
    ctxFor({ speakerId: 'stranger', organizerOrgIds: ['org-OTHER'] })

  it('getConversation refuses a non-participant with NOT_FOUND', async () => {
    await expect(
      messageRouter.createCaller(outsider()).getConversation({ id: 'conv-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // Refused AFTER the conversation load and BEFORE the roster read.
    expect(matching('_type == "speaker" && _id in $ids')).toHaveLength(0)
  })

  it('listMessages refuses a non-participant and never fetches the messages', async () => {
    await expect(
      messageRouter
        .createCaller(outsider())
        .listMessages({ conversationId: 'conv-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // GUARD BEFORE FETCH: the message bodies are never read for a refused caller.
    expect(matching('_type == "message"')).toHaveLength(0)
  })

  it('a cached conversation is still access-checked by the second procedure', async () => {
    // One request, one load — but the refusal must still happen. If the access
    // check moved into the loader, this caller would be served the cache.
    const ctx = outsider()
    const caller = messageRouter.createCaller(ctx)
    await expect(
      caller.getConversation({ id: 'conv-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      caller.listMessages({ conversationId: 'conv-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(matching('_type == "message"')).toHaveLength(0)
  })

  it('binds the tenant as an explicit GROQ parameter resolved from the domain', async () => {
    await messageRouter.createCaller(ctxFor()).listConversations({})

    const page = matching('_type == "conversation" && conference._ref')[0]
    expect(page.query).toContain('conference._ref == $conferenceId')
    expect(page.params.conferenceId).toBe(CONFERENCE_ID)

    const extras = matching('"unread": *[')[0]
    expect(extras.params.conferenceId).toBe(CONFERENCE_ID)
    // The preference half stays PAGE-scoped (deterministic ids for this page's
    // rows), never conference-wide.
    expect(extras.query).toContain('_id in $prefIds')
    expect(extras.params.prefIds).toEqual(['convpref.conv-1.org-admin'])

    // The organizer set is read for THIS org, from the org the waist resolved.
    expect(matching('organizers[]._ref')[0].params.orgId).toBe(ORG_ID)
  })

  it('keeps the read-your-writes reads on the live API, not the CDN', async () => {
    const ctx = ctxFor()
    const messages = messageRouter.createCaller(ctx)
    await messages.listConversations({})
    await messages.getConversation({ id: 'conv-1' })
    await messages.listMessages({ conversationId: 'conv-1' })

    // A send is followed by a re-read of the thread, its messages and the inbox
    // row: none of them may be served stale.
    for (const needle of [
      '"conversation": *[',
      '_type == "message" && conversation._ref',
      '_type == "conversation" && conference._ref',
      '"unread": *[',
    ]) {
      expect(matching(needle)).not.toHaveLength(0)
      for (const call of matching(needle)) expect(call.client).toBe('live')
    }
  })
})
