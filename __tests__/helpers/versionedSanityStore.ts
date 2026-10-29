/**
 * An in-memory Sanity dataset that knows about drafts and release copies, for
 * tests that must not take a mock's word for what a query returns or what a
 * write does (#1346). Built on `./sanityStore` (its mutator and its GROQ
 * runner), with the visibility rules of
 * `src/lib/speaker/erasure.assets.sanity.test.ts` and revisions on top.
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
 *    touched a new `_rev`: the transaction's own id when the caller set one
 *    (`transaction().transactionId(id)`), as Sanity's `_rev` is the id of the
 *    transaction that last changed the document.
 *  - A patch of a document that does not exist refuses the whole transaction.
 *  - A `create` of an id that is already stored refuses the whole transaction.
 *    Sanity documents that it fails, not with which status: 409 here, MODELLED.
 *    `@sanity/mutator` keeps the stored document instead, so this is checked
 *    here (#1344).
 *  - A delete is refused while another document holds a STRONG reference to
 *    the deleted one (Sanity's rule). `_weak: true` on the stored reference is
 *    what makes it weak. The refusal's status, 409 (`statusCode` on the
 *    error), is MODELLED: Sanity documents the refusal, not its status, and
 *    it also answers 409 for other conflicts.
 *  - A raw `clientWrite.mutate([...])` (as `deleteWithHistory` sends a
 *    `{ delete: { id, purge: true } }`) is applied like any commit and kept in
 *    `commits` as written, `purge` included; the store keeps no history, so
 *    `purge` changes nothing else here.
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
import { createClient } from '@sanity/client'
import { Mutation, runGroq } from './sanityStore'

type Doc = Record<string, unknown> & { _id: string }
type PatchBody = { id: string; ifRevisionID?: string; unset?: string[] }
type SerializedMutation =
  | { patch: PatchBody }
  | { delete: { id: string; purge?: boolean } }
  | { create: Doc }
  | { createIfNotExists: Doc }
  | { createOrReplace: Doc }

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
  /**
   * The `cache` option the read was sent with. The store answers every read
   * from what is stored now, so this option changes nothing here: it is
   * recorded for a test to pin, where the real client would otherwise serve
   * a remembered answer.
   */
  cache: unknown
  /** The `signal` the read was sent with: a hook may wait on it to model a read that hangs until aborted. */
  signal?: AbortSignal
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
  /** Every id read through the doc endpoint (`getDocument`/`getDocuments`), in order. */
  readonly docReads: string[]
  /** What happened, in order: `read` and `commit`, for asserting a race ran. */
  readonly events: string[]
  /** Store a document as it is, replacing one with the same id. No commit. */
  put(document: Doc): void
  /** Delete a document outside any transaction: another writer's delete. */
  remove(id: string): void
  /**
   * Until the next `reset()`, reads see `seen` for this id (`null`: no such
   * document) instead of what is stored; writes, and `getDocument` (the doc
   * endpoint), still see what is stored.
   * Sanity documents this: queries run against a search store that is synced
   * from the document store outside transactions, and may lag behind it.
   */
  readsLagFor(id: string, seen: Doc | null): void
  /** Run once, just before the next commit is applied. */
  beforeNextCommit(hook: () => unknown): void
  /** Run once, right after the next commit has been applied. */
  afterNextCommit(hook: () => unknown): void
  /** Refuse every patch of this document until the next `reset()`. */
  failPatchesOf(id: string): void
  /** Let patches of this document through again. */
  allowPatchesOf(id: string): void
  /** Make the reads this picks reject until the next `reset()`. */
  failReadsThat(pick: (read: RecordedRead) => boolean): void
  /** Run before every read, until the next `reset()`: for a write that lands in between. */
  beforeEachRead(hook: (read: RecordedRead) => unknown): void
  /** Make every commit reject until the next `reset()`. */
  failWrites(error?: Error): void
  /**
   * Until the next `reset()`, a `commit({ returnDocuments: true })` answers
   * with NO documents: what Sanity may do for a mutation that changed
   * nothing (undocumented), so the reader's fallback is exercised.
   */
  withholdReturnedDocuments(): void
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
  let docReads: string[] = []
  let hooks: Array<() => unknown> = []
  let afterHooks: Array<() => unknown> = []
  let unpatchable = new Set<string>()
  let unreadable: ((read: RecordedRead) => boolean) | null = null
  let readHook: ((read: RecordedRead) => unknown) | null = null
  let writeFailure: Error | null = null
  let withholdDocuments = false
  let revCounter = 0

  let lagging = new Map<string, Doc | null>()
  const visible = (apiVersion: string, perspective: unknown) =>
    [
      ...documents.map((d) =>
        lagging.has(d._id) ? (lagging.get(d._id) ?? null) : d,
      ),
      // Deleted, but still shown by a search store that lags.
      ...[...lagging.values()].filter(
        (seen) => seen && !documents.some((d) => d._id === seen._id),
      ),
    ]
      .filter((d): d is Doc => d !== null)
      .filter((d) => {
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
      options: {
        perspective?: unknown
        cache?: unknown
        signal?: AbortSignal
      } = {},
    ) => {
      reads.push({
        client,
        query,
        params,
        apiVersion,
        perspective: options.perspective,
        cache: options.cache,
        ...(options.signal ? { signal: options.signal } : {}),
      })
      events.push('read')
      const read = reads[reads.length - 1]
      await readHook?.(read)
      if (unreadable?.(read)) {
        throw new Error('503: read refused (test)')
      }
      return runGroq(visible(apiVersion, options.perspective), query, params)
    }

  const apply = async (
    apiVersion: string,
    mutations: SerializedMutation[],
    transactionId?: string,
  ): Promise<{ docs: Doc[]; results: (Doc | undefined)[] }> => {
    const hook = hooks.shift()
    if (hook) await hook()
    if (writeFailure) throw writeFailure
    const rev = transactionId ?? `rev-${++revCounter}`
    // Applied to a copy: a transaction that throws leaves the dataset as it was.
    const next = structuredClone(documents)
    const touched: string[] = []
    // One entry per mutation, the document AS IT IS right after that
    // mutation: a `createIfNotExists` of an existing document carries the
    // document before the patch that follows it. MODELLED: Sanity's HTTP docs
    // do not document the per-entry shape of `results[].document`.
    const results: (Doc | undefined)[] = []
    const after = (id: string) =>
      structuredClone(next.find((d) => d._id === id))
    for (const mutation of mutations) {
      if ('delete' in mutation) {
        const at = next.findIndex((d) => d._id === mutation.delete.id)
        if (at !== -1) next.splice(at, 1)
        results.push(undefined)
        continue
      }
      if (!('patch' in mutation)) {
        const [body] = Object.values(mutation) as Doc[]
        // A document created without an id is given one, as Sanity does.
        if (!body._id) body._id = `created-${++revCounter}`
        const at = next.findIndex((d) => d._id === body._id)
        if ('create' in mutation && at !== -1) {
          throw Object.assign(new Error(`409: ${body._id} already exists`), {
            statusCode: 409,
          })
        }
        const applied = new Mutation({ mutations: [mutation] }).apply(
          at === -1 ? null : next[at],
        )
        if (applied && at === -1) next.push({ ...applied, _rev: rev })
        else if (applied) next[at] = { ...applied, _rev: rev }
        touched.push(body._id)
        results.push(after(body._id))
        continue
      }
      const { id, ifRevisionID } = mutation.patch
      if (unpatchable.has(id)) {
        throw new Error(`409: ${id} cannot be patched (test)`)
      }
      if (isVersion(id) && !knowsReleases(apiVersion)) {
        throw new Error(`400: ${id} needs API 2025-02-19 (modelled)`)
      }
      const at = next.findIndex((d) => d._id === id)
      // MODELLED: Sanity documents that a patch of a missing document fails,
      // not with which status; 404 here.
      if (at === -1) {
        throw Object.assign(new Error(`404: no such document: ${id}`), {
          statusCode: 404,
        })
      }
      if (ifRevisionID && next[at]._rev !== ifRevisionID) {
        throw Object.assign(new Error(`409: ${id} revision mismatch`), {
          statusCode: 409,
        })
      }
      const patched = new Mutation({ mutations: [mutation] }).apply(next[at])
      next[at] = { ...(patched as Doc), _rev: rev }
      touched.push(id)
      results.push(after(id))
    }
    for (const mutation of mutations) {
      if (
        'delete' in mutation &&
        stronglyReferenced(next, mutation.delete.id)
      ) {
        throw Object.assign(
          new Error(`409: ${mutation.delete.id} is still referenced`),
          { statusCode: 409 },
        )
      }
    }
    documents = next
    commits.push(mutations)
    events.push('commit')
    const afterHook = afterHooks.shift()
    if (afterHook) await afterHook()
    return {
      docs: touched.flatMap((id) => next.filter((d) => d._id === id)),
      results,
    }
  }

  const writer = (apiVersion: string) => ({
    fetch: fetchAs('write', apiVersion),
    // The doc endpoint reads the document store, past the search store's lag
    // (Sanity: "the absolute latest possible version of a document").
    getDocument,
    getDocuments,
    transaction: () => {
      const tx = real.transaction()
      // `returnDocuments`: the real client answers with one document per
      // mutation (`results[].document`). MODELLED: every mutation here gets
      // the document as it is after the whole transaction, including a
      // `createIfNotExists` that did nothing, where Sanity may send none.
      tx.commit = (async (options?: { returnDocuments?: boolean }) => {
        const { docs, results } = await apply(
          apiVersion,
          tx.serialize() as SerializedMutation[],
          tx.transactionId(),
        )
        if (options?.returnDocuments) return withholdDocuments ? [] : results
        return {
          transactionId: `tx-${commits.length}`,
          documentIds: docs.map((doc) => doc._id),
        }
      }) as typeof tx.commit
      return tx
    },
    // A plain `client.delete(id)`: one `delete` mutation, committed like any
    // other, so `commits` and `events` see it as a transaction would.
    delete: async (id: string) => {
      await apply(apiVersion, [{ delete: { id } }])
      return { transactionId: `tx-${commits.length}`, results: [] }
    },
    // A raw `client.mutate([...])`: the mutations as the caller wrote them,
    // committed like any other. A delete's `purge` is kept in `commits` for a
    // test to pin; the store keeps no history, so it changes nothing else.
    mutate: async (mutations: SerializedMutation | SerializedMutation[]) => {
      await apply(
        apiVersion,
        Array.isArray(mutations) ? mutations : [mutations],
      )
      return { transactionId: `tx-${commits.length}`, results: [] }
    },
    patch: (id: string) => {
      const patch = real.patch(id)
      patch.commit = (async () => {
        const {
          docs: [doc],
        } = await apply(apiVersion, [{ patch: patch.serialize() as PatchBody }])
        return doc
      }) as typeof patch.commit
      return patch
    },
  })

  // The doc endpoint on a read client: the document store, past the search
  // store's lag, as on the writer.
  const getDocument = async (id: string) => {
    docReads.push(id)
    return structuredClone(documents.find((d) => d._id === id)) ?? null
  }

  const getDocuments = async (ids: string[]) => {
    docReads.push(...ids)
    return ids.map(
      (id) => structuredClone(documents.find((d) => d._id === id)) ?? null,
    )
  }

  const reader = (client: 'uncached' | 'cached') => ({
    fetch: fetchAs(client, DEFAULT_API_VERSION),
    getDocument,
    getDocuments,
    withConfig: (config: { apiVersion: string }) => ({
      fetch: fetchAs(client, config.apiVersion),
      getDocument,
      getDocuments,
    }),
  })

  return {
    reset(seed = []) {
      documents = structuredClone([...seed])
      reads = []
      commits = []
      events = []
      docReads = []
      hooks = []
      afterHooks = []
      unpatchable = new Set()
      lagging = new Map()
      unreadable = null
      readHook = null
      writeFailure = null
      withholdDocuments = false
    },
    withholdReturnedDocuments() {
      withholdDocuments = true
    },
    put(document) {
      documents = [
        ...documents.filter((d) => d._id !== document._id),
        structuredClone(document),
      ]
    },
    remove(id) {
      documents = documents.filter((d) => d._id !== id)
    },
    readsLagFor(id, seen) {
      lagging.set(id, seen && structuredClone(seen))
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
    get docReads() {
      return docReads
    },
    beforeNextCommit(hook) {
      hooks.push(hook)
    },
    afterNextCommit(hook) {
      afterHooks.push(hook)
    },
    failPatchesOf(id) {
      unpatchable.add(id)
    },
    allowPatchesOf(id) {
      unpatchable.delete(id)
    },
    failReadsThat(pick) {
      unreadable = pick
    },
    beforeEachRead(hook) {
      readHook = hook
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
