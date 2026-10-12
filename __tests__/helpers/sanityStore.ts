/**
 * An in-memory Sanity dataset for tests that must not take a mock's word for
 * what a query returns or what a write does.
 *
 * - READS run the query text under test through `groq-js` over the documents.
 * - WRITES are built by the REAL `@sanity/client` transaction builder; only
 *   `commit()` is intercepted. What it would have sent (`serialize()`) is
 *   applied with `@sanity/mutator`, Sanity's own implementation of mutation
 *   semantics, so `createIfNotExists` on an existing id is ignored because the
 *   library ignores it, not because this file says so. A transaction applies
 *   whole or not at all.
 *
 * WHAT IT IS NOT: the Content Lake. `@sanity/mutator` is Sanity's own code for
 * these semantics, but it is not the server.
 *
 * Use from a `vi.mock('@/lib/sanity/client')` factory:
 *
 *   const h = vi.hoisted(() => ({ store: null as null | SanityStore }))
 *   vi.mock('@/lib/sanity/client', async () => {
 *     const { createSanityStore } = await import('<path>/helpers/sanityStore')
 *     h.store = createSanityStore()
 *     return h.store.clients
 *   })
 */
import { createRequire } from 'node:module'
import { createClient } from '@sanity/client'
import { evaluate, parse } from 'groq-js'

type Doc = Record<string, unknown> & { _id: string }
type SerializedMutation = Record<string, { _id?: string; id?: string }>

const { Mutation } = createRequire(
  createRequire(import.meta.url).resolve('sanity/package.json'),
)('@sanity/mutator') as {
  Mutation: new (options: { mutations: unknown[] }) => {
    apply: (doc: Doc | null) => Doc | null
  }
}

export interface SanityStore {
  /** Replace every document and clear the counters and the failure switch. */
  reset(documents?: readonly Doc[]): void
  /** Every document of a type, in insertion order. */
  ofType(type: string): Doc[]
  /** The text of every query that ran, on either read client, in order. */
  readonly queries: string[]
  /** The mutations of each committed transaction, as the client serialized them. */
  readonly commits: SerializedMutation[][]
  /** Make every commit reject until the next `reset()`. */
  failWrites(error?: Error): void
  /** Make every query reject until the next `reset()`. */
  failReads(error?: Error): void
  /** The module shape of `@/lib/sanity/client` the code under test imports. */
  readonly clients: {
    clientReadUncached: { fetch: (...args: unknown[]) => Promise<unknown> }
    clientRead: { fetch: (...args: unknown[]) => Promise<unknown> }
    clientWrite: { transaction: () => unknown }
  }
}

export function createSanityStore(): SanityStore {
  const client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2024-01-01',
    useCdn: false,
  })

  let documents = new Map<string, Doc>()
  let queries: string[] = []
  let commits: SerializedMutation[][] = []
  let writeFailure: Error | null = null
  let readFailure: Error | null = null

  const fetch = async (...args: unknown[]) => {
    const [query, params] = args as [string, Record<string, unknown>?]
    queries.push(query)
    if (readFailure) throw readFailure
    const result = await evaluate(parse(query), {
      dataset: [...documents.values()],
      params: params ?? {},
    })
    return result.get()
  }

  const commit = (mutations: SerializedMutation[]) => {
    if (writeFailure) throw writeFailure
    // Applied to a copy first: a transaction that throws half way leaves the
    // dataset as it was.
    const next = new Map(documents)
    for (const mutation of mutations) {
      const [body] = Object.values(mutation)
      const id = body._id ?? body.id
      if (!id) throw new Error('sanityStore: a mutation without a document id')
      const after = new Mutation({ mutations: [mutation] }).apply(
        next.get(id) ?? null,
      )
      if (after) next.set(id, after)
      else next.delete(id)
    }
    documents = next
    commits.push(mutations)
    return { transactionId: `tx-${commits.length}` }
  }

  return {
    reset(seed = []) {
      documents = new Map(seed.map((doc) => [doc._id, doc]))
      queries = []
      commits = []
      writeFailure = null
      readFailure = null
    },
    ofType: (type) =>
      [...documents.values()].filter((doc) => doc._type === type),
    get queries() {
      return queries
    },
    get commits() {
      return commits
    },
    failWrites(error = new Error('sanityStore: write refused')) {
      writeFailure = error
    },
    failReads(error = new Error('sanityStore: read refused')) {
      readFailure = error
    },
    clients: {
      clientReadUncached: { fetch },
      clientRead: { fetch },
      clientWrite: {
        transaction: () => {
          const tx = client.transaction()
          tx.commit = (async () =>
            commit(tx.serialize() as SerializedMutation[])) as typeof tx.commit
          return tx
        },
      },
    },
  }
}
