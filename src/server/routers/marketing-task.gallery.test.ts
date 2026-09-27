/**
 * @vitest-environment node
 *
 * Attaching a render to a `studioRender` Task also saves it to the gallery
 * (#1165, spec §4.3), through the tRPC caller against one in-memory dataset.
 * Every read — the tenancy guard's and the shared orphan check's included —
 * is EXECUTED with groq-js; every write is built by the REAL `@sanity/client`
 * and applied with Sanity's own `@sanity/mutator`, by a store that refuses
 * what Sanity refuses (a stale revision; deleting something a strong
 * reference still holds). Assertions are on the stored documents.
 *
 * The one thing replaced is the hand-off to posts, which has its own tests
 * (`marketing-task.test.ts`): here it records each variant it is handed.
 */
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

type Doc = Record<string, unknown> & { _id: string }

const h = vi.hoisted(() => ({
  dataset: [] as (Record<string, unknown> & { _id: string })[],
  revs: 0,
  handedOff: [] as string[],
  /** Makes every write to a `marketingAsset` fail. */
  galleryDown: false,
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-A',
      organization: { _ref: 'org-A' },
      title: 'CNB 2027',
    },
    domain: 'cloudnativebergen.dev',
    error: null,
  }),
}))
vi.mock('@/lib/social/sanity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/social/sanity')>()),
  handoffStudioAttachment: async (variantId: string) => {
    h.handedOff.push(variantId)
    return 'attached'
  },
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const real = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2025-02-19',
    useCdn: false,
  })
  const run = async (query: string, params: Record<string, unknown> = {}) =>
    (await evaluate(parse(query), { dataset: h.dataset, params })).get()
  const client = {
    fetch: run,
    withConfig: () => ({ fetch: run }),
  }
  return {
    clientReadUncached: client,
    clientRead: client,
    clientWrite: {
      fetch: run,
      createIfNotExists: async (doc: Doc) =>
        (
          await commit(
            real
              .transaction()
              .createIfNotExists(doc as never)
              .serialize(),
          )
        )[0],
      patch: (id: string) => {
        const p = real.patch(id)
        p.commit = (async () =>
          (await commit([{ patch: p.serialize() }]))[0]) as typeof p.commit
        return p
      },
      transaction: () => {
        const tx = real.transaction()
        tx.commit = (async () =>
          commit(tx.serialize())) as unknown as typeof tx.commit
        return tx
      },
      delete: async (id: string) => commit([{ delete: { id } }]),
    },
  }

  /** All or nothing, as a Sanity transaction is. */
  async function commit(mutations: unknown[]): Promise<Doc[]> {
    const { Mutation } = createRequire(
      createRequire(import.meta.url).resolve('sanity/package.json'),
    )('@sanity/mutator') as {
      Mutation: new (o: { mutations: unknown[] }) => {
        apply: (doc: Doc | null) => Doc | null
      }
    }
    const next = structuredClone(h.dataset)
    const out: Doc[] = []
    const typeOf = (id: string) => next.find((d) => d._id === id)?._type
    for (const m of mutations as Record<string, Record<string, unknown>>[]) {
      if (m.createIfNotExists) {
        if (h.galleryDown && m.createIfNotExists._type === 'marketingAsset')
          throw new Error('Sanity down')
        const found = next.find((d) => d._id === m.createIfNotExists._id)
        if (found) {
          out.push(found)
          continue
        }
        const doc = {
          ...m.createIfNotExists,
          _createdAt: `2027-01-01T00:00:0${h.revs}Z`,
          _rev: `rev-${++h.revs}`,
        } as unknown as Doc
        next.push(doc)
        out.push(doc)
      } else if (m.patch) {
        const id = m.patch.id as string
        if (h.galleryDown && typeOf(id) === 'marketingAsset')
          throw new Error('Sanity down')
        const i = next.findIndex((d) => d._id === id)
        if (i < 0)
          throw Object.assign(new Error('missing'), { statusCode: 404 })
        if (m.patch.ifRevisionID && m.patch.ifRevisionID !== next[i]._rev)
          throw Object.assign(new Error('Revision mismatch'), {
            statusCode: 409,
          })
        const patched = new Mutation({ mutations: [m] }).apply(
          structuredClone(next[i]),
        )!
        patched._rev = `rev-${++h.revs}`
        next[i] = patched
        out.push(patched)
      } else if (m.delete) {
        const id = m.delete.id as string
        if (next.some((d) => d._id !== id && strongRefs(d).has(id)))
          throw Object.assign(new Error('Document is referenced'), {
            statusCode: 409,
          })
        const i = next.findIndex((d) => d._id === id)
        if (i >= 0) next.splice(i, 1)
      }
    }
    h.dataset = next
    return out
  }

  function strongRefs(value: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(value)) value.forEach((v) => strongRefs(v, out))
    else if (value && typeof value === 'object') {
      const r = value as { _ref?: unknown; _weak?: unknown }
      if (typeof r._ref === 'string' && r._weak !== true) out.add(r._ref)
      Object.values(value).forEach((v) => strongRefs(v, out))
    }
    return out
  }
})

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { marketingRouter } from './marketing'

const t = initTRPC.context<Context>().create()
function context(): Context {
  const speaker = { _id: 'sp-org', name: 'Org', organizerOrgIds: ['org-A'] }
  const user = { email: 'o@example.com', name: 'Org', picture: '' }
  return {
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}
const marketing = () => t.createCallerFactory(marketingRouter)(context())

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const image = (id: string) => ({ _type: 'image', asset: ref(id) })
const FIRST = 'image-first-1080x1080-png'
const SECOND = 'image-second-1080x1080-png'
const byId = (id: string) => h.dataset.find((d) => d._id === id)
const gallery = () => h.dataset.filter((d) => d._type === 'marketingAsset')
const task = () => byId('task-r')!

function fixture(): Doc[] {
  return [
    { _id: 'org-A', _type: 'organization' },
    {
      _id: 'conf-A',
      _type: 'conference',
      organization: ref('org-A'),
      title: 'CNB 2027',
    },
    { _id: 'sp-ada', _type: 'speaker', name: 'Ada' },
    { _id: FIRST, _type: 'sanity.imageAsset' },
    { _id: SECOND, _type: 'sanity.imageAsset' },
    {
      _id: 'camp',
      _type: 'marketingCampaign',
      _rev: 'rev-camp',
      conference: ref('conf-A'),
    },
    {
      _id: 'task-r',
      _type: 'marketingTask',
      _rev: 'rev-task',
      conference: ref('conf-A'),
      campaign: { ...ref('camp'), _weak: true },
      kind: 'studioRender',
      title: 'Speaker card: Ada',
      alt: 'Ada speaks at CNB',
      subject: { ...ref('sp-ada'), _weak: true },
      pendingStudioAsset: image(FIRST),
    },
    {
      _id: 'task-pub',
      _type: 'marketingTask',
      _rev: 'rev-pub',
      conference: ref('conf-A'),
      campaign: { ...ref('camp'), _weak: true },
      kind: 'publishing',
      prerequisites: [{ _key: 'r', ...ref('task-r'), _weak: true }],
      variant: { ...ref('variant-1'), _weak: true },
    },
    {
      _id: 'variant-1',
      _type: 'socialPostVariant',
      conference: ref('conf-A'),
    },
  ]
}

/** Attach the image the Task's upload bound, as the studio does. */
async function attach(assetId: string) {
  return marketing().task.attachAsset({
    taskId: 'task-r',
    taskRev: task()._rev as string,
    assetId,
  })
}

/** A second render: the studio upload route binds it as pending. */
function upload(assetId: string) {
  Object.assign(task(), { pendingStudioAsset: image(assetId) })
}

beforeEach(() => {
  h.dataset = fixture()
  h.revs = 0
  h.handedOff = []
  h.galleryDown = false
})

describe('attaching a render also saves it to the gallery (#1165)', () => {
  it('the first attach creates one entry from the Task; a retry creates no second', async () => {
    expect(await attach(FIRST)).toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(gallery()).toEqual([
      expect.objectContaining({
        organization: ref('org-A'),
        scope: 'edition',
        conference: ref('conf-A'),
        image: image(FIRST),
        title: 'Speaker card: Ada',
        alt: 'Ada speaks at CNB',
        subject: { ...ref('sp-ada'), _weak: true },
        task: { ...ref('task-r'), _weak: true },
      }),
    ])
    expect(task()).not.toHaveProperty('gallerySavePending')
    const entry = structuredClone(gallery())
    expect(await attach(FIRST)).toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(gallery()).toEqual(entry)
  })

  it('a re-render swaps the image and keeps what an organizer edited', async () => {
    await attach(FIRST)
    Object.assign(gallery()[0], {
      title: 'Ada, the final card',
      alt: 'Edited alt text',
      tags: ['keynote', 'speakers'],
    })
    upload(SECOND)
    await attach(SECOND)
    expect(gallery()).toHaveLength(1)
    expect(gallery()[0]).toMatchObject({
      image: image(SECOND),
      title: 'Ada, the final card',
      alt: 'Edited alt text',
      tags: ['keynote', 'speakers'],
    })
  })

  it('the replaced file is deleted once nothing references it', async () => {
    await attach(FIRST)
    upload(SECOND)
    await attach(SECOND)
    expect(byId(FIRST)).toBeUndefined()
    expect(task().replacedRenders ?? []).toEqual([])
    expect(byId(SECOND)).toBeDefined()
  })

  it('the replaced file is kept while a post still references it', async () => {
    await attach(FIRST)
    h.dataset.push({
      _id: 'post-1',
      _type: 'socialPost',
      conference: ref('conf-A'),
      attachments: [{ _key: 'a', image: image(FIRST), alt: 'Ada' }],
    })
    upload(SECOND)
    await attach(SECOND)
    expect(byId(FIRST)).toBeDefined()
    expect(byId('post-1')).toMatchObject({
      attachments: [{ image: image(FIRST) }],
    })
    // Still recorded, so a later replacement or an erasure finds it.
    expect(task().replacedRenders).toEqual([FIRST])
    expect(gallery()[0]).toMatchObject({ image: image(SECOND) })
  })

  it('a failing gallery save leaves the Task attached and handed off; the next retry completes it', async () => {
    h.galleryDown = true
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await attach(FIRST)).toEqual({
      success: true,
      handoffFailures: [],
      galleryFailed: true,
    })
    logged.mockRestore()
    expect(task()).toMatchObject({
      asset: image(FIRST),
      handoffDoneFor: ['variant-1'],
      gallerySavePending: true,
    })
    expect(h.handedOff).toEqual(['variant-1'])
    expect(gallery()).toEqual([])

    h.galleryDown = false
    expect(await attach(FIRST)).toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(gallery()).toEqual([
      expect.objectContaining({ image: image(FIRST) }),
    ])
    expect(task()).not.toHaveProperty('gallerySavePending')
    // Handed off once: the retry does not hand the image off again.
    expect(h.handedOff).toEqual(['variant-1'])
  })

  it('a failing re-render save keeps the old file until the retry swaps it', async () => {
    await attach(FIRST)
    upload(SECOND)
    h.galleryDown = true
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await attach(SECOND)).toMatchObject({ galleryFailed: true })
    logged.mockRestore()
    // The gallery still shows the first render, so its file stays.
    expect(gallery()[0]).toMatchObject({ image: image(FIRST) })
    expect(byId(FIRST)).toBeDefined()
    expect(task()).toMatchObject({
      asset: image(SECOND),
      replacedRenders: [FIRST],
    })
    h.galleryDown = false
    await attach(SECOND)
    expect(gallery()[0]).toMatchObject({ image: image(SECOND) })
    expect(byId(FIRST)).toBeUndefined()
  })
})
