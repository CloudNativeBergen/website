/**
 * An in-memory Sanity dataset that knows about drafts and release copies, for
 * tests that must not take a mock's word for what a query returns or what a
 * write does (#1346). A sibling of `./sanityStore`, with the visibility rules
 * of `src/lib/speaker/erasure.assets.sanity.test.ts`.
 *
 * REAL: reads run the query text under test through `groq-js`. Writes are
 * built by the real `@sanity/client` (`patch()` and `transaction()`); only
 * `commit()` is intercepted, and what it would have sent (`serialize()`) is
 * applied with `@sanity/mutator`, Sanity's own implementation of mutation
 * semantics. `setIfMissing` keeps a stored value because the library keeps it.
 *
 * MODELLED, each one stated so it is not mistaken for evidence:
 *
 *  - VISIBILITY by API version and perspective. A `versions.**` document is
 *    visible only to a `raw` read at 2025-02-19 or later (Sanity's documented
 *    rule). At that version a read with no perspective sees published
 *    documents only; below it, the default sees drafts and no versions.
 *  - A MUTATION of a `versions.**` document is refused below 2025-02-19. An
 *    assumption, not verified against Sanity (production holds no release): it
 *    pins that such a write is sent at the newer version.
 *  - `ifRevisionID`, which the mutator ignores: checked here, and a mismatch
 *    refuses the whole transaction. Every commit gives the documents it
 *    touched a new `_rev`.
 *  - A patch of a document that does not exist refuses the whole transaction.
 *  - A delete is refused while another document holds a STRONG reference to
 *    the deleted one (Sanity's rule). `_weak: true` on the stored reference is
 *    what makes it weak.
 *
 * WHAT IT IS NOT: the Content Lake.
 *
 * Use from a `vi.mock('@/lib/sanity/client')` factory:
 *
 *   const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
 *   vi.mock('@/lib/sanity/client', async () => {
 *     const { createVersionedSanityStore } =
 *       await import('<path>/helpers/versionedSanityStore')
 *     h.store = createVersionedSanityStore()
 *     return h.store.clients
 *   })
 */
import { createRequire } from 'node:module'
import { createClient } from '@sanity/client'
import { evaluate, parse } from 'groq-js'

type Doc = Record<string, unknown> & { _id: string }
type PatchBody = { id: string; ifRevisionID?: string }
type SerializedMutation =
  | { patch: PatchBody }
  | { delete: { id: string } }
  | { create: Doc }
  | { createIfNotExists: Doc }
  | { createOrReplace: Doc }

const { Mutation } = createRequire(
  createRequire(import.meta.url).resolve('sanity/package.json'),
)('@sanity/mutator') as {
  Mutation: new (options: { mutations: unknown[] }) => {
    apply: (doc: Doc | null) => Doc | null
  }
}

/** The clients' own `apiVersion` (`src/lib/sanity/client.ts`). */
const DEFAULT_API_VERSION = '2023-05-03'
const knowsReleases = (apiVersion: string) => apiVersion >= '2025-02-19'
const isVersion = (id: string) => id.startsWith('versions.')
const isDraft = (id: string) => id.startsWith('drafts.')

export interface RecordedRead {
  client: 'uncached' | 'cached' | 'write'
  query: string
  params: Record<string, unknown>
  apiVersion: string
  perspective: unknown
}

export interface VersionedSanityStore {
  /** Replace every document and clear the logs and hooks. */
  reset(documents?: readonly Doc[]): void
  /** The stored document, or `undefined`. */
  doc(id: string): Doc | undefined
  /** Every stored document. */
  all(): Doc[]
  /** Every read that ran, on any client, in order. */
  readonly reads: RecordedRead[]
  /** The mutations of each COMMITTED write, as the client serialized them. */
  readonly commits: SerializedMutation[][]
  /** What happened, in order: `read` and `commit`, for asserting a race ran. */
  readonly events: string[]
  /** Run once, just before the next commit is applied. */
  beforeNextCommit(hook: () => void | Promise<void>): void
  /** Make every commit reject until the next `reset()`. */
  failWrites(error?: Error): void
  /** The module shape of `@/lib/sanity/client` the code under test imports. */
  readonly clients: Record<
    'clientReadUncached' | 'clientReadCached' | 'clientWrite',
    unknown
  >
}

function stronglyReferenced(dataset: Doc[], id: string): boolean {
  const walk = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(walk)
    if (typeof value !== 'object' || value === null) return false
    const v = value as Record<string, unknown>
    if (v._ref === id && v._weak !== true) return true
    return Object.values(v).some(walk)
  }
  return dataset.some((doc) => doc._id !== id && walk(doc))
}

export function createVersionedSanityStore(): VersionedSanityStore {
  const real = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2025-02-19',
    useCdn: false,
  })

  let documents: Doc[] = []
  let reads: RecordedRead[] = []
  let commits: SerializedMutation[][] = []
  let events: string[] = []
  let hooks: Array<() => void | Promise<void>> = []
  let writeFailure: Error | null = null
  let revCounter = 0

  const visible = (apiVersion: string, perspective: unknown) =>
    documents.filter((d) => {
      if (knowsReleases(apiVersion)) {
        if (perspective === 'raw') return true
        return !isVersion(d._id) && !isDraft(d._id)
      }
      return !isVersion(d._id)
    })

  const fetchAs =
    (client: RecordedRead['client'], apiVersion: string) =>
    async (
      query: string,
      params: Record<string, unknown> = {},
      options: { perspective?: unknown } = {},
    ) => {
      reads.push({
        client,
        query,
        params,
        apiVersion,
        perspective: options.perspective,
      })
      events.push('read')
      const result = await evaluate(parse(query), {
        dataset: visible(apiVersion, options.perspective),
        params,
      })
      return result.get()
    }

  const apply = async (
    apiVersion: string,
    mutations: SerializedMutation[],
  ): Promise<Doc[]> => {
    const hook = hooks.shift()
    if (hook) await hook()
    if (writeFailure) throw writeFailure
    const rev = `rev-${++revCounter}`
    // Applied to a copy: a transaction that throws leaves the dataset as it was.
    const next = structuredClone(documents)
    const touched: string[] = []
    for (const mutation of mutations) {
      if ('delete' in mutation) {
        const at = next.findIndex((d) => d._id === mutation.delete.id)
        if (at !== -1) next.splice(at, 1)
        continue
      }
      if (!('patch' in mutation)) {
        const [body] = Object.values(mutation) as Doc[]
        const at = next.findIndex((d) => d._id === body._id)
        const after = new Mutation({ mutations: [mutation] }).apply(
          at === -1 ? null : next[at],
        )
        if (after && at === -1) next.push({ ...after, _rev: rev })
        else if (after) next[at] = { ...after, _rev: rev }
        touched.push(body._id)
        continue
      }
      const { id, ifRevisionID } = mutation.patch
      if (isVersion(id) && !knowsReleases(apiVersion)) {
        throw new Error(`400: ${id} needs API 2025-02-19 (modelled)`)
      }
      const at = next.findIndex((d) => d._id === id)
      if (at === -1) throw new Error(`404: no such document: ${id}`)
      if (ifRevisionID && next[at]._rev !== ifRevisionID) {
        throw Object.assign(new Error(`409: ${id} revision mismatch`), {
          statusCode: 409,
        })
      }
      const patched = new Mutation({ mutations: [mutation] }).apply(next[at])
      next[at] = { ...(patched as Doc), _rev: rev }
      touched.push(id)
    }
    for (const mutation of mutations) {
      if (
        'delete' in mutation &&
        stronglyReferenced(next, mutation.delete.id)
      ) {
        throw new Error(`409: ${mutation.delete.id} is still referenced`)
      }
    }
    documents = next
    commits.push(mutations)
    events.push('commit')
    return touched.flatMap((id) => next.filter((d) => d._id === id))
  }

  const writer = (apiVersion: string) => ({
    fetch: fetchAs('write', apiVersion),
    transaction: () => {
      const tx = real.transaction()
      tx.commit = (async () => {
        await apply(apiVersion, tx.serialize() as SerializedMutation[])
        return { transactionId: `tx-${commits.length}` }
      }) as typeof tx.commit
      return tx
    },
    patch: (id: string) => {
      const patch = real.patch(id)
      patch.commit = (async () => {
        const [doc] = await apply(apiVersion, [
          { patch: patch.serialize() as PatchBody },
        ])
        return doc
      }) as typeof patch.commit
      return patch
    },
  })

  const reader = (client: 'uncached' | 'cached') => ({
    fetch: fetchAs(client, DEFAULT_API_VERSION),
    withConfig: (config: { apiVersion: string }) => ({
      fetch: fetchAs(client, config.apiVersion),
    }),
  })

  return {
    reset(seed = []) {
      documents = structuredClone([...seed])
      reads = []
      commits = []
      events = []
      hooks = []
      writeFailure = null
    },
    doc: (id) => documents.find((d) => d._id === id),
    all: () => documents,
    get reads() {
      return reads
    },
    get commits() {
      return commits
    },
    get events() {
      return events
    },
    beforeNextCommit(hook) {
      hooks.push(hook)
    },
    failWrites(error = new Error('versionedSanityStore: write refused')) {
      writeFailure = error
    },
    clients: {
      clientReadUncached: reader('uncached'),
      clientReadCached: reader('cached'),
      clientWrite: {
        ...writer(DEFAULT_API_VERSION),
        withConfig: (config: { apiVersion: string }) =>
          writer(config.apiVersion),
      },
    },
  }
}
