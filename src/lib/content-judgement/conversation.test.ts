/**
 * @vitest-environment node
 *
 * Real messaging writes, Jev client and SDK transaction/patch builders. Only
 * Sanity's transport/storage boundary, OpenRouter fetch and Next's after hook
 * are scripted. Every read executes GROQ against two tenants. The storage
 * model exercises submitted preconditions; it is not evidence of Sanity's
 * backend transaction implementation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Transaction, type Mutation } from '@sanity/client'
import { evaluate, parse } from 'groq-js'
import { createHash } from 'node:crypto'

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  transaction: vi.fn(),
  create: vi.fn(),
  createIfNotExists: vi.fn(),
  after: vi.fn(),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientReadCached: { fetch: h.fetch },
  clientWrite: {
    transaction: h.transaction,
    create: h.create,
    createIfNotExists: h.createIfNotExists,
  },
}))
vi.mock('next/server', () => ({ after: h.after }))

import {
  addMessage,
  createGeneralConversation,
  ensureProposalConversation,
  listMessages,
} from '@/lib/messaging/sanity'
import { clearOrganizerSpeakerIdsCache } from '@/lib/notification/sanity'
import { readConversationOpening } from './conversation'
import { buildConversationRequest } from './questions'
import { judgementId } from './store'

type Document = { _id: string; _type: string; _rev: string } & Record<
  string,
  unknown
>
const ref = (_ref: string) => ({ _type: 'reference', _ref })
const SUBJECT = 'Private subject 7eb1'
const BODY = 'Private opening 9de2: can you help with my visa?'
const choice = {
  type: 'choice',
  choice: 'travel_and_visa',
  probabilities: { travel_and_visa: 0.91, other: 0.09 },
  confidence: 0.91,
}
const answer = () =>
  Response.json({
    model: 'typesafe/jev-1.14-20261014',
    usage: { input_tokens: 512, cost: 0.00004 },
    answers: { category: choice },
  })

let documents: Map<string, Document>
let tasks: (() => Promise<void>)[]
let committed: Mutation[][]
let revisions: number
let conflicts: number
let failJudgementWrite: boolean
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>

function put(id: string, type: string, fields: Record<string, unknown>) {
  documents.set(id, {
    _id: id,
    _type: type,
    _rev: `revision-${++revisions}`,
    ...fields,
  })
}

function conversation(id = 'conversation-a', conferenceId = 'conf-a') {
  put(id, 'conversation', {
    conference: ref(conferenceId),
    conversationType: 'general',
    subject: SUBJECT,
    lastMessageAt: 'before',
  })
  return id
}

/** Apply the real SDK's serialized mutations atomically to the test dataset. */
function transaction() {
  const tx = new Transaction()
  vi.spyOn(tx, 'commit').mockImplementation(async () => {
    const mutations = tx.serialize()
    const pending = new Map(
      [...documents].map(([id, document]) => [id, { ...document }]),
    )
    for (const mutation of mutations) {
      if ('patch' in mutation) {
        const patch = mutation.patch
        if (!('id' in patch) || typeof patch.id !== 'string')
          throw new Error('Unsupported patch selection in test boundary')
        const document = pending.get(patch.id)
        if (!document) throw new Error('Missing document')
        if (patch.ifRevisionID && patch.ifRevisionID !== document._rev) {
          conflicts++
          throw Object.assign(new Error('Revision conflict'), {
            statusCode: 409,
          })
        }
        for (const [key, value] of Object.entries(patch.setIfMissing ?? {})) {
          if (document[key] === undefined) document[key] = value
        }
        Object.assign(document, patch.set ?? {})
        document._rev = `revision-${++revisions}`
      } else if ('create' in mutation || 'createIfNotExists' in mutation) {
        const document =
          'create' in mutation ? mutation.create : mutation.createIfNotExists
        if (!document._id) throw new Error('Expected server-derived id')
        if (document._type === 'contentJudgement' && failJudgementWrite)
          throw new Error(`Transport echoed ${BODY}`)
        if ('createIfNotExists' in mutation && pending.has(document._id))
          continue
        pending.set(document._id, {
          ...document,
          _id: document._id,
          _rev: `revision-${++revisions}`,
        })
      } else {
        throw new Error('Unsupported mutation in test boundary')
      }
    }
    documents = pending
    committed.push(mutations)
    return { transactionId: 'test-transaction', results: [], documentIds: [] }
  })
  return tx
}

beforeEach(() => {
  vi.clearAllMocks()
  clearOrganizerSpeakerIdsCache()
  documents = new Map()
  tasks = []
  committed = []
  revisions = 0
  conflicts = 0
  failJudgementWrite = false
  put('org-a', 'organization', { contentJudgement: { enabled: true } })
  put('org-b', 'organization', { contentJudgement: { enabled: false } })
  put('conf-a', 'conference', {
    organization: ref('org-a'),
    organizers: [ref('organizer-a')],
  })
  put('conf-b', 'conference', {
    organization: ref('org-b'),
    organizers: [ref('organizer-b')],
  })
  put('organizer-a', 'speaker', { name: 'Organizer A' })
  put('organizer-b', 'speaker', { name: 'Organizer B' })
  h.fetch.mockImplementation(
    async (query: string, params: Record<string, unknown>) =>
      (
        await evaluate(parse(query), {
          dataset: [...documents.values()],
          params,
        })
      ).get(),
  )
  h.transaction.mockReset().mockImplementation(transaction)
  h.create.mockImplementation(async (document: Document) => {
    put(document._id, document._type, document)
    return document
  })
  h.createIfNotExists.mockImplementation(async (document: Document) => {
    if (!documents.has(document._id))
      put(document._id, document._type, document)
    return documents.get(document._id)
  })
  h.after.mockImplementation((task: () => Promise<void>) => tasks.push(task))
  fetcher = vi.fn<typeof fetch>(async () => answer())
  vi.stubGlobal('fetch', fetcher)
  vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-synthetic')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function drain() {
  while (tasks.length) await tasks.shift()!()
}

function messages() {
  return [...documents.values()].filter((doc) => doc._type === 'message')
}

function logged() {
  // Error.message is non-enumerable: plain JSON.stringify would miss a leak.
  return JSON.stringify(
    [vi.mocked(console.error).mock.calls, vi.mocked(console.warn).mock.calls],
    (_key, value) =>
      value instanceof Error ? { message: value.message } : value,
  )
}

async function open(type: 'general' | 'proposal', authorId = 'speaker-a') {
  return type === 'proposal'
    ? ensureProposalConversation({
        conferenceId: 'conf-a',
        proposalId: 'proposal-a',
        proposalTitle: SUBJECT,
        createdById: authorId,
        proposalSpeakerIds: ['speaker-a'],
      })
    : createGeneralConversation({
        conferenceId: 'conf-a',
        subject: SUBJECT,
        createdById: authorId,
        ...(authorId === 'organizer-a'
          ? { subjectSpeakerId: 'speaker-a' }
          : {}),
      })
}

describe('conversation opening: executed GROQ and first-message ownership', () => {
  it('derives each tenant from its own parent and never counts another thread’s messages', async () => {
    conversation('conversation-a', 'conf-a')
    conversation('conversation-b', 'conf-b')
    put('message-b', 'message', { conversation: ref('conversation-b') })
    expect(await readConversationOpening('conversation-a')).toMatchObject({
      conferenceId: 'conf-a',
      organizationId: 'org-a',
      hasMessages: false,
    })
    expect(await readConversationOpening('conversation-b')).toMatchObject({
      conferenceId: 'conf-b',
      organizationId: 'org-b',
      hasMessages: true,
    })
    expect(await readConversationOpening('missing-conversation')).toBeNull()
  })

  it.each([
    ['general', 'speaker-a', 'speaker'],
    ['general', 'organizer-a', 'organizer'],
    ['proposal', 'speaker-a', 'speaker'],
    ['proposal', 'organizer-a', 'organizer'],
  ] as const)(
    '%s first message by %s is judged after its response as %s',
    async (type, authorId, openedBy) => {
      const conversationId = await open(type, authorId)
      const revision = documents.get(conversationId)!._rev
      const message = await addMessage({ conversationId, authorId, body: BODY })
      expect(message.body).toBe(BODY)
      expect(messages()).toHaveLength(1)
      expect(messages()[0].body).toBe(BODY)
      expect(messages()[0].origin ?? 'person').toBe('person')
      expect(tasks).toHaveLength(1)
      expect(fetcher).not.toHaveBeenCalled()
      expect(committed.at(-1)).toEqual([
        { create: expect.objectContaining({ _type: 'message', body: BODY }) },
        {
          patch: {
            id: conversationId,
            ifRevisionID: revision,
            set: { lastMessageAt: expect.any(String) },
          },
        },
      ])
      await drain()
      expect(fetcher).toHaveBeenCalledTimes(1)
      const request = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
      expect(request.state).toEqual({
        subject: SUBJECT,
        message: BODY,
        openedBy,
      })
      expect(request).toEqual({
        ...buildConversationRequest({
          subject: SUBJECT,
          message: BODY,
          openedBy,
        }),
        provider: { zdr: true },
      })
      expect(documents.get(conversationId)?.messageCategory).toMatchObject({
        value: 'travel_and_visa',
        source: 'jev',
        confidence: 0.91,
      })
      const record = documents.get(judgementId(conversationId))
      expect(record).toMatchObject({
        conference: ref('conf-a'),
        surface: 'conversation',
        content: { ...ref(conversationId), _weak: true },
        questionSet: 'v2',
        model: 'typesafe/jev-1.14-20261014',
        inputTokens: 512,
        contentHash: createHash('sha256')
          .update(JSON.stringify(request.state))
          .digest('hex'),
        parts: [
          {
            _key: 'opening',
            part: 'opening',
            answers: [
              expect.objectContaining({
                question: 'category',
                choice: 'travel_and_visa',
                confidence: 0.91,
              }),
            ],
          },
        ],
      })
      expect(JSON.stringify(record)).not.toContain(BODY)
      expect(JSON.stringify(record)).not.toContain(SUBJECT)
      expect(Object.keys(record ?? {}).sort()).toEqual(
        [
          '_id',
          '_type',
          '_rev',
          'conference',
          'surface',
          'content',
          'parts',
          'model',
          'questionSet',
          'contentHash',
          'inputTokens',
          'judgedAt',
        ].sort(),
      )
      expect(committed.at(-1)).toEqual([
        {
          createIfNotExists: expect.objectContaining({
            _type: 'contentJudgement',
          }),
        },
        {
          patch: {
            id: conversationId,
            setIfMissing: {
              messageCategory: expect.objectContaining({ source: 'jev' }),
            },
          },
        },
      ])
    },
  )

  it('treats an organizer of another organization as a speaker', async () => {
    const conversationId = conversation()
    await addMessage({ conversationId, authorId: 'organizer-b', body: BODY })
    await drain()
    expect(
      JSON.parse(String(fetcher.mock.calls[0][1]?.body)).state.openedBy,
    ).toBe('speaker')
  })

  it('judges marketing outreach as a person and keeps task completion atomic', async () => {
    const conversationId = await open('general', 'organizer-a')
    put('task-a', 'marketingTask', { status: 'open' })
    const revision = documents.get('task-a')!._rev
    const message = await addMessage({
      conversationId,
      authorId: 'organizer-a',
      body: BODY,
      marketingTask: { id: 'task-a', rev: revision },
    })
    expect(documents.get('task-a')?.messageId).toBe(message._id)
    expect(messages()[0].origin ?? 'person').toBe('person')
    await drain()
    expect(documents.get(conversationId)?.messageCategory).toMatchObject({
      source: 'jev',
    })
  })

  it('concurrent first writers commit both messages but only the revision winner is judged', async () => {
    const conversationId = await open('proposal')
    const [first, second] = await Promise.all([
      addMessage({ conversationId, authorId: 'speaker-a', body: BODY }),
      addMessage({
        conversationId,
        authorId: 'organizer-a',
        body: 'Second opening',
      }),
    ])
    expect(
      messages()
        .map((message) => message._id)
        .sort(),
    ).toEqual([first._id, second._id].sort())
    expect(conflicts).toBe(1)
    expect(tasks).toHaveLength(1)
    await drain()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(
      JSON.parse(String(fetcher.mock.calls[0][1]?.body)).state.message,
    ).toBe(messages()[0].body)
  })

  it('a stale outreach Task fails once without retrying an unchanged parent revision', async () => {
    const conversationId = await open('general', 'organizer-a')
    put('task-a', 'marketingTask', { status: 'open' })
    h.transaction.mockClear()
    h.transaction
      .mockImplementationOnce(transaction)
      .mockImplementationOnce(() => {
        throw new Error('Unexpected retry of a stale Task')
      })
    await expect(
      addMessage({
        conversationId,
        authorId: 'organizer-a',
        body: BODY,
        marketingTask: { id: 'task-a', rev: 'stale-revision' },
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(h.transaction).toHaveBeenCalledTimes(1)
    expect(conflicts).toBe(1)
    expect(messages()).toHaveLength(0)
  })

  it('does not judge legacy threads with existing stored messages', async () => {
    const conversationId = conversation()
    put('legacy-message', 'message', {
      conversation: ref(conversationId),
      body: 'First',
    })
    const reply = await addMessage({
      conversationId,
      authorId: 'speaker-a',
      body: BODY,
    })
    expect(reply.body).toBe(BODY)
    expect(messages()).toHaveLength(2)
    await drain()
    expect(tasks).toHaveLength(0)
    expect(fetcher).not.toHaveBeenCalled()
    expect(documents.get(conversationId)?.messageCategory).toBeUndefined()
    expect(vi.mocked(console.error).mock.calls).toHaveLength(0)
  })

  it('does not judge a later reply when the opening was written while disabled', async () => {
    const conversationId = conversation()
    documents.get('org-a')!.contentJudgement = { enabled: false }
    await addMessage({ conversationId, authorId: 'speaker-a', body: BODY })
    await drain()
    expect(vi.mocked(console.error).mock.calls).toHaveLength(0)
    documents.get('org-a')!.contentJudgement = { enabled: true }
    await addMessage({
      conversationId,
      authorId: 'organizer-a',
      body: 'A reply',
    })
    await drain()
    expect(messages()).toHaveLength(2)
    expect(fetcher).not.toHaveBeenCalled()
    expect(documents.get(conversationId)?.messageCategory).toBeUndefined()
  })

  it('reads the setting live for each opening and isolates the other organization', async () => {
    const own = conversation('own-a', 'conf-a')
    const foreign = conversation('other-b', 'conf-b')
    await addMessage({ conversationId: own, authorId: 'speaker-a', body: BODY })
    await addMessage({
      conversationId: foreign,
      authorId: 'organizer-b',
      body: BODY,
    })
    await drain()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(documents.get(own)?.messageCategory).toMatchObject({ source: 'jev' })
    expect(documents.get(foreign)?.messageCategory).toBeUndefined()
    expect(documents.get(judgementId(own))?.conference).toEqual(ref('conf-a'))
    expect(documents.has(judgementId(foreign))).toBe(false)
  })
})

describe('system and sponsor openings', () => {
  it('round-trips system and person origins through the executed message projection', async () => {
    const conversationId = conversation()
    const system = await addMessage({
      conversationId,
      authorId: 'organizer-a',
      body: 'Accepted',
      origin: 'system',
      category: 'proposal_status',
    })
    const person = await addMessage({
      conversationId,
      authorId: 'speaker-a',
      body: BODY,
      origin: 'person',
    })
    const result = await listMessages({ conversationId })
    expect(result.find((message) => message._id === system._id)?.origin).toBe(
      'system',
    )
    expect(result.find((message) => message._id === person._id)?.origin).toBe(
      'person',
    )
  })

  it('writes the event category with the first system message without calling Jev', async () => {
    const conversationId = await open('proposal')
    const revision = documents.get(conversationId)!._rev
    const message = await addMessage({
      conversationId,
      authorId: 'organizer-a',
      body: BODY,
      origin: 'system',
      category: 'proposal_status',
    })
    expect(message.origin).toBe('system')
    expect(messages()[0].origin).toBe('system')
    expect(documents.get(conversationId)?.messageCategory).toMatchObject({
      value: 'proposal_status',
      source: 'system',
      setAt: expect.any(String),
    })
    expect(committed.at(-1)).toEqual([
      { create: expect.objectContaining({ origin: 'system' }) },
      {
        patch: {
          id: conversationId,
          ifRevisionID: revision,
          set: { lastMessageAt: expect.any(String) },
          setIfMissing: {
            messageCategory: {
              value: 'proposal_status',
              source: 'system',
              setAt: expect.any(String),
            },
          },
        },
      },
    ])
    await drain()
    expect(fetcher).not.toHaveBeenCalled()
    expect(tasks).toHaveLength(0)
  })

  it('a system reply leaves the person opening’s category unchanged', async () => {
    const conversationId = conversation()
    await addMessage({ conversationId, authorId: 'speaker-a', body: BODY })
    await drain()
    const category = documents.get(conversationId)?.messageCategory
    await addMessage({
      conversationId,
      authorId: 'organizer-a',
      body: 'Accepted with typed comment',
      origin: 'system',
      category: 'proposal_status',
    })
    expect(messages()).toHaveLength(2)
    expect(messages()[1].origin).toBe('system')
    expect(documents.get(conversationId)?.messageCategory).toEqual(category)
    await drain()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('a system reply to an unjudged legacy opening does not assign a category', async () => {
    const conversationId = conversation()
    put('legacy-message', 'message', {
      conversation: ref(conversationId),
      body: 'An unjudged person opening',
    })
    const message = await addMessage({
      conversationId,
      authorId: 'organizer-a',
      body: BODY,
      origin: 'system',
      category: 'proposal_status',
    })
    expect(message.origin).toBe('system')
    expect(messages()).toHaveLength(2)
    expect(committed[0][1]).toEqual({
      patch: { id: conversationId, set: { lastMessageAt: message.createdAt } },
    })
    expect(documents.get(conversationId)?.messageCategory).toBeUndefined()
  })

  it.each(['organizer', 'sponsor'] as const)(
    'a %s-authored sponsor opening is never judged',
    async (author) => {
      const conversationId = conversation()
      documents.get(conversationId)!.conversationType = 'sponsor'
      const message = await addMessage({
        conversationId,
        body: BODY,
        ...(author === 'organizer'
          ? { authorId: 'organizer-a' }
          : {
              sponsorAuthor: {
                sponsorForConferenceId: 'sfc-a',
                authorName: 'Sponsor',
              },
            }),
      })
      expect(message.body).toBe(BODY)
      expect(messages()[0].body).toBe(BODY)
      await drain()
      expect(tasks).toHaveLength(0)
      expect(fetcher).not.toHaveBeenCalled()
      expect(documents.get(conversationId)?.messageCategory).toBeUndefined()
    },
  )
})

describe('write-time category guard', () => {
  it('preserves an organizer override written while the Jev fetch is in flight', async () => {
    const conversationId = conversation()
    let resolveFetch!: (response: Response) => void
    fetcher.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    await addMessage({ conversationId, authorId: 'speaker-a', body: BODY })
    const work = tasks.shift()!()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const override = {
      value: 'schedule',
      source: 'organizer',
      setAt: '2026-10-26T12:00:00Z',
      setBy: { ...ref('organizer-a'), _weak: true },
    }
    documents.get(conversationId)!.messageCategory = override
    resolveFetch(answer())
    await work
    expect(documents.get(conversationId)?.messageCategory).toEqual(override)
    expect(documents.get(judgementId(conversationId))?.parts).toEqual([
      expect.objectContaining({ part: 'opening' }),
    ])
  })

  it.each(['organizer', 'system', 'jev'] as const)(
    'never overwrites a category already set by %s',
    async (source) => {
      const conversationId = conversation()
      const category = {
        value: 'tickets',
        source,
        confidence: 0.8,
        setAt: 'before',
      }
      documents.get(conversationId)!.messageCategory = category
      await addMessage({ conversationId, authorId: 'speaker-a', body: BODY })
      await drain()
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(documents.get(conversationId)?.messageCategory).toEqual(category)
    },
  )

  it('a system opening also preserves an existing organizer setting', async () => {
    const conversationId = conversation()
    const category = { value: 'tickets', source: 'organizer', setAt: 'before' }
    documents.get(conversationId)!.messageCategory = category
    const message = await addMessage({
      conversationId,
      authorId: 'organizer-a',
      body: BODY,
      origin: 'system',
      category: 'proposal_status',
    })
    expect(message.origin).toBe('system')
    expect(documents.get(conversationId)?.messageCategory).toEqual(category)
  })
})

describe('never-fail on both person write paths', () => {
  for (const authorId of ['speaker-a', 'organizer-a']) {
    it.each([
      '402',
      'fetch throws',
      'real judge rejects on unexpected response access',
      'missing API key',
      'settings read throws',
      'timeout',
      'judgement write throws',
    ])(`${authorId}: message succeeds when %s`, async (failure) => {
      const conversationId = await open('general', authorId)
      if (failure === '402')
        fetcher.mockResolvedValue(new Response('private echo', { status: 402 }))
      if (failure === 'fetch throws')
        fetcher.mockRejectedValue(new Error(`Request echoed ${BODY}`))
      if (failure === 'real judge rejects on unexpected response access') {
        // A response access error escapes the real judge's network-error
        // handling. Exercise the task's catch without mocking the judge.
        fetcher.mockImplementation(async () =>
          Object.defineProperty(answer(), 'ok', {
            get() {
              throw new Error(BODY)
            },
          }),
        )
      }
      if (failure === 'missing API key') vi.stubEnv('OPENROUTER_API_KEY', '')
      if (failure === 'settings read throws') {
        const execute = h.fetch.getMockImplementation()!
        h.fetch.mockImplementation(
          (query: string, params: Record<string, unknown>) => {
            // The setting read sends only the organization id, so its
            // error (logged by J1's settings.ts) cannot quote the message.
            if (query.includes('contentJudgement.enabled'))
              throw new Error('Sanity unavailable')
            return execute(query, params)
          },
        )
      }
      if (failure === 'judgement write throws') failJudgementWrite = true
      if (failure === 'timeout') {
        vi.useFakeTimers()
        fetcher.mockImplementation(
          (_url, init) =>
            new Promise((_, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new Error(BODY)),
              )
            }),
        )
      }
      const message = await addMessage({ conversationId, authorId, body: BODY })
      expect(message.body).toBe(BODY)
      expect(messages()).toHaveLength(1)
      expect(messages()[0].body).toBe(BODY)
      expect(tasks).toHaveLength(1)
      const work = drain()
      if (failure === 'timeout') await vi.advanceTimersByTimeAsync(20_000)
      await expect(work).resolves.toBeUndefined()
      expect(documents.get(conversationId)?.messageCategory).toBeUndefined()
      expect(documents.has(judgementId(conversationId))).toBe(false)
      expect(logged()).not.toContain(BODY)
      expect(logged()).not.toContain(SUBJECT)
      expect(messages()[0].body).toBe(BODY)
      expect(vi.mocked(console.error).mock.calls).toHaveLength(
        [
          'real judge rejects on unexpected response access',
          'missing API key',
          'settings read throws',
          'judgement write throws',
        ].includes(failure)
          ? 1
          : 0,
      )
    })
  }

  it('an opening lookup failure still delivers the person’s message', async () => {
    const conversationId = conversation()
    const execute = h.fetch.getMockImplementation()!
    h.fetch.mockImplementation(
      (query: string, params: Record<string, unknown>) => {
        if (query.includes('hasMessages')) throw new Error(BODY)
        return execute(query, params)
      },
    )
    const message = await addMessage({
      conversationId,
      authorId: 'speaker-a',
      body: BODY,
    })
    expect(message.body).toBe(BODY)
    expect(messages()[0].body).toBe(BODY)
    await drain()
    expect(documents.get(conversationId)?.messageCategory).toBeUndefined()
    expect(logged()).not.toContain(BODY)
  })

  it('Next after being unavailable falls back safely without delaying message delivery', async () => {
    h.after.mockImplementationOnce(() => {
      throw new Error(BODY)
    })
    fetcher.mockRejectedValue(new Error(BODY))
    const conversationId = conversation()
    const message = await addMessage({
      conversationId,
      authorId: 'speaker-a',
      body: BODY,
    })
    expect(message.body).toBe(BODY)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(documents.get(conversationId)?.messageCategory).toBeUndefined()
    expect(logged()).not.toContain(BODY)
  })
})
