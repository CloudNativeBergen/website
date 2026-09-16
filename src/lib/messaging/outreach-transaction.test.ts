import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SanityClient } from '@sanity/client'

const h = vi.hoisted(() => ({
  transaction: vi.fn(),
  create: vi.fn(),
  createIfNotExists: vi.fn(),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    transaction: h.transaction,
    create: h.create,
    createIfNotExists: h.createIfNotExists,
  },
  clientReadUncached: { fetch: vi.fn() },
  clientReadCached: { fetch: vi.fn() },
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefViaParentConference: vi.fn(async () => null),
  organizationField: () => ({}),
}))
vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn(async () => []),
  getOrganizerSpeakerIdsForOrg: vi.fn(async () => []),
}))
vi.mock('@/lib/teams', () => ({ getViewerTeamKeys: vi.fn(async () => []) }))

import { addMessage, createGeneralConversation } from './sanity'

type Document = { _id: string; _rev?: string; [key: string]: unknown }
interface TestPatch {
  ifRevisionId(revision: string): TestPatch
  set(fields: Record<string, unknown>): TestPatch
}

type Mutation =
  | { create: Document }
  | { id: string; revision?: string; fields: Record<string, unknown> }

let documents: Map<string, Document>
let failAfterCreate: boolean
let stagedCreates: number

/**
 * This models the Sanity transaction boundary, not the backend implementation.
 * Real addMessage stages its mutations here. Commit applies them to a private
 * snapshot and publishes only after every mutation succeeds.
 */
function transaction() {
  const mutations: Mutation[] = []
  const api = {
    create(doc: Document) {
      mutations.push({ create: doc })
      return api
    },
    patch(id: string, build: (patch: TestPatch) => unknown) {
      const mutation: Extract<Mutation, { id: string }> = { id, fields: {} }
      const patch = {
        ifRevisionId(revision: string) {
          mutation.revision = revision
          return patch
        },
        set(fields: Record<string, unknown>) {
          mutation.fields = fields
          return patch
        },
      }
      build(patch)
      mutations.push(mutation)
      return api
    },
    async commit() {
      const pending = new Map(
        [...documents].map(([id, document]) => [id, { ...document }]),
      )
      for (const mutation of mutations) {
        if ('create' in mutation) {
          pending.set(mutation.create._id, mutation.create)
          stagedCreates += 1
          if (failAfterCreate) {
            failAfterCreate = false
            throw new Error('Transport failure after staging message creation')
          }
        } else {
          const document = pending.get(mutation.id)
          if (!document) throw new Error('Missing document')
          if (mutation.revision && document._rev !== mutation.revision) {
            throw Object.assign(new Error('Revision conflict'), {
              statusCode: 409,
            })
          }
          pending.set(mutation.id, {
            ...document,
            ...mutation.fields,
            _rev: `${document._rev}-next`,
          })
        }
      }
      documents = pending
    },
  }
  return api
}

const input = {
  conversationId: 'conversation-1',
  authorId: 'organizer-1',
  body: 'Please share https://conference.test/?utm_source=outreach',
  marketingTask: { id: 'task-1', rev: 'initial' },
}

beforeEach(() => {
  vi.clearAllMocks()
  documents = new Map([
    ['task-1', { _id: 'task-1', _rev: 'initial', status: 'open' }],
    [
      'conversation-1',
      { _id: 'conversation-1', _rev: 'initial', lastMessageAt: 'before' },
    ],
  ])
  failAfterCreate = false
  stagedCreates = 0
  h.transaction.mockImplementation(transaction)
  h.createIfNotExists.mockImplementation(async (doc: Document) => {
    if (!documents.has(doc._id)) documents.set(doc._id, doc)
  })
})

function messages() {
  return [...documents.values()].filter((doc) => doc._type === 'message')
}

describe('outreach addMessage atomic transaction contract', () => {
  it('submits all three mutations in one request through the real Sanity client', async () => {
    // Exercise the installed SDK's transaction/patch builders and commit path.
    // Stop at transport: this proves the request boundary, not Sanity's backend
    // rollback semantics, and cannot write to a real dataset.
    const transportFailure = new Error('Offline transaction transport')
    const transport = vi.fn<ConstructorParameters<typeof SanityClient>[0]>(
      () => {
        throw transportFailure
      },
    )
    const client = new SanityClient(transport, {
      projectId: 'outreach-test',
      dataset: 'test',
      apiVersion: '2025-01-01',
      useCdn: false,
    })
    h.transaction.mockImplementation(() => client.transaction())

    await expect(addMessage(input)).rejects.toBe(transportFailure)

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        uri: '/data/mutate/test',
        body: {
          mutations: [
            {
              create: expect.objectContaining({
                _id: expect.stringMatching(/^message\./),
                _type: 'message',
                conversation: {
                  _type: 'reference',
                  _ref: input.conversationId,
                },
                body: input.body,
              }),
            },
            {
              patch: {
                id: input.conversationId,
                set: { lastMessageAt: expect.any(String) },
              },
            },
            {
              patch: {
                id: input.marketingTask.id,
                ifRevisionID: input.marketingTask.rev,
                set: { messageId: expect.stringMatching(/^message\./) },
              },
            },
          ],
          transactionId: undefined,
        },
      }),
      undefined,
    )
    const mutations = transport.mock.calls[0][0].body.mutations
    expect(mutations[2].patch.set.messageId).toBe(mutations[0].create._id)
    expect(mutations[1].patch.set.lastMessageAt).toBe(
      mutations[0].create.createdAt,
    )
  })

  it('commits the message, conversation timestamp and Task reference together', async () => {
    const message = await addMessage(input)
    expect(messages()).toEqual([
      expect.objectContaining({ _id: message._id, body: input.body }),
    ])
    expect(documents.get('task-1')).toEqual({
      _id: 'task-1',
      _rev: 'initial-next',
      status: 'open',
      messageId: message._id,
    })
    expect(documents.get('conversation-1')?.lastMessageAt).toBe(
      message.createdAt,
    )
    expect(h.transaction).toHaveBeenCalledTimes(1)
  })

  it('recovers by retrying after failure between message creation and Task persistence', async () => {
    failAfterCreate = true
    await expect(addMessage(input)).rejects.toThrow(
      'Transport failure after staging message creation',
    )
    expect(stagedCreates).toBe(1)
    expect(documents.get('task-1')).toEqual({
      _id: 'task-1',
      _rev: 'initial',
      status: 'open',
    })
    const recovered = await addMessage(input)
    expect(messages()).toEqual([
      expect.objectContaining({ _id: recovered._id, body: input.body }),
    ])
    expect(documents.get('task-1')?.messageId).toBe(recovered._id)
    expect(documents.get('conversation-1')?.lastMessageAt).toBe(
      recovered.createdAt,
    )
    expect(stagedCreates).toBe(2)
  })

  it('rolls back a stale sender so the winning Task still references its only message', async () => {
    const winner = await addMessage(input)
    await expect(addMessage(input)).rejects.toThrow('Revision conflict')
    expect(stagedCreates).toBe(2)
    expect(messages()).toEqual([
      expect.objectContaining({ _id: winner._id, body: input.body }),
    ])
    expect(documents.get('task-1')?.messageId).toBe(winner._id)
    expect(documents.get('conversation-1')?.lastMessageAt).toBe(
      winner.createdAt,
    )
  })

  it('allows one winner when two same-revision sends overlap', async () => {
    const outcomes = await Promise.allSettled([
      addMessage(input),
      addMessage(input),
    ])
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ])
    const delivered = messages()
    expect(delivered).toHaveLength(1)
    expect(documents.get('task-1')?.messageId).toBe(delivered[0]._id)
    expect(stagedCreates).toBe(2)
  })

  it('preserves ordinary messaging without a Task', async () => {
    const message = await addMessage({
      conversationId: input.conversationId,
      authorId: input.authorId,
      body: input.body,
    })
    expect(messages()).toEqual([expect.objectContaining({ _id: message._id })])
    expect(documents.get('task-1')).toEqual({
      _id: 'task-1',
      _rev: 'initial',
      status: 'open',
    })
  })
})

describe('retryable outreach conversation', () => {
  it('reuses a server-derived conversation id across retries', async () => {
    const input = {
      id: 'conversation.marketing.task-1',
      conferenceId: 'conf-a',
      createdById: 'organizer-1',
      subject: 'Share tickets',
      subjectSpeakerId: 'speaker-1',
    }
    expect(await createGeneralConversation(input)).toBe(input.id)
    expect(await createGeneralConversation(input)).toBe(input.id)
    expect(h.createIfNotExists).toHaveBeenCalledTimes(2)
    expect(
      [...documents.values()].filter((doc) => doc._type === 'conversation'),
    ).toEqual([
      expect.objectContaining({
        _id: input.id,
        subjectSpeaker: { _type: 'reference', _ref: 'speaker-1', _weak: true },
      }),
    ])
  })
})
