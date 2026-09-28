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
  /** Runs once, right after a write to the render Task lands. */
  afterTaskSave: null as null | (() => void),
  /** The real hand-off to posts instead of the recorder (#1166). */
  realHandoff: false,
  /** Runs before every read, with its query; what it returns runs after. */
  onFetch: null as null | ((query: string) => void | (() => void)),
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
vi.mock('@/lib/social/sanity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/social/sanity')>()
  return {
    ...actual,
    handoffStudioAttachment: async (
      ...args: Parameters<typeof actual.handoffStudioAttachment>
    ) => {
      h.handedOff.push(args[0])
      return h.realHandoff ? actual.handoffStudioAttachment(...args) : 'attached'
    },
  }
})

vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const real = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2025-02-19',
    useCdn: false,
  })
  const run = async (query: string, params: Record<string, unknown> = {}) => {
    const after = h.onFetch?.(query)
    const result = await (
      await evaluate(parse(query), { dataset: h.dataset, params })
    ).get()
    if (after) after()
    return result
  }
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
    const race = h.afterTaskSave
    if (
      race &&
      (mutations as Record<string, Record<string, unknown>>[]).some(
        (m) =>
          m.patch?.id === 'marketingTask.0ea845ff-af8f-4dc4-8694-63c2d47ce431',
      )
    ) {
      h.afterTaskSave = null
      race()
    }
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
import { marketingAssetRouter } from './marketingAsset'
import { deleteTask } from '@/lib/marketing/sanity'

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
const assets = () => t.createCallerFactory(marketingAssetRouter)(context())

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const image = (id: string) => ({ _type: 'image', asset: ref(id) })
/** Production-shaped: every Task id in production has a dot (#1228 review). */
const TASK = 'marketingTask.0ea845ff-af8f-4dc4-8694-63c2d47ce431'
const FIRST = 'image-first-1080x1080-png'
const SECOND = 'image-second-1080x1080-png'
const byId = (id: string) => h.dataset.find((d) => d._id === id)
const gallery = () => h.dataset.filter((d) => d._type === 'marketingAsset')
const task = () => byId(TASK)!

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
    // Ada has standing here: a talk at this edition.
    {
      _id: 'talk-ada',
      _type: 'talk',
      conference: ref('conf-A'),
      title: 'Ada on queues',
      speakers: [{ _key: 'a', ...ref('sp-ada') }],
    },
    // Speakers are shared across tenants; this one has none here.
    { _id: 'sp-foreign', _type: 'speaker', name: 'Someone else' },
    {
      _id: 'sponsor-ours',
      _type: 'sponsor',
      name: 'Acme',
      organization: ref('org-A'),
    },
    {
      _id: 'sponsor-foreign',
      _type: 'sponsor',
      name: 'Not ours',
      organization: ref('org-B'),
    },
    { _id: FIRST, _type: 'sanity.imageAsset' },
    { _id: SECOND, _type: 'sanity.imageAsset' },
    {
      _id: 'camp',
      _type: 'marketingCampaign',
      _rev: 'rev-camp',
      conference: ref('conf-A'),
    },
    {
      _id: TASK,
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
      prerequisites: [{ _key: 'r', ...ref(TASK), _weak: true }],
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
    taskId: TASK,
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
  h.afterTaskSave = null
  h.realHandoff = false
  h.onFetch = null
})

describe('attaching a render also saves it to the gallery (#1165)', () => {
  it('the first attach creates one entry from the Task; a retry creates no second', async () => {
    expect(await attach(FIRST)).toEqual({
      success: true,
      handoffFailures: [],
      gallerySaved: true,
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
        task: { ...ref(TASK), _weak: true },
      }),
    ])
    expect(task()).not.toHaveProperty('galleryPending')
    const entry = structuredClone(gallery())
    expect(await attach(FIRST)).toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(gallery()).toEqual(entry)
  })

  it.each([
    ['a speaker with no standing here', 'sp-foreign'],
    ["another organization's sponsor", 'sponsor-foreign'],
  ])(
    'leaves out a Task subject that is %s (set in Studio, say)',
    async (_what, id) => {
      Object.assign(task(), { subject: { ...ref(id), _weak: true } })
      await attach(FIRST)
      expect(gallery()).toHaveLength(1)
      expect(gallery()[0]).not.toHaveProperty('subject')
    },
  )

  it("never writes a rejected subject's name into the entry's alt text", async () => {
    // No alt of its own: the alt is derived from the title and subject.
    Object.assign(task(), {
      alt: null,
      subject: { ...ref('sp-foreign'), _weak: true },
    })
    await attach(FIRST)
    expect(gallery()[0].alt).toBe('Speaker card: Ada')
  })

  it('derives the alt from a subject that passes', async () => {
    Object.assign(task(), { alt: null })
    await attach(FIRST)
    expect(gallery()[0].alt).toBe('Speaker card: Ada — Ada')
  })

  it('the entry takes the Task as it is when the entry is written, not as the attach first read it', async () => {
    Object.assign(task(), { alt: null })
    // Renamed, and its subject changed, right after the attach saved it.
    h.afterTaskSave = () =>
      Object.assign(task(), {
        title: 'Sponsor card: Acme',
        subject: { ...ref('sponsor-ours'), _weak: true },
        _rev: 'rev-task-edited',
      })
    await attach(FIRST)
    expect(gallery()).toEqual([
      expect.objectContaining({
        title: 'Sponsor card: Acme',
        alt: 'Sponsor card: Acme — Acme',
        subject: { ...ref('sponsor-ours'), _weak: true },
      }),
    ])
  })

  it('reports the gallery saved only when this answer saved it', async () => {
    expect(await attach(FIRST)).toMatchObject({ gallerySaved: true })
    await assets().delete({ id: gallery()[0]._id })
    // A handoff-only retry leaves the organizer's delete alone, and says so
    // by NOT claiming the gallery.
    expect(await attach(FIRST)).not.toHaveProperty('gallerySaved')
    expect(gallery()).toEqual([])
  })

  it('a handoff retry never recreates an entry the organizer deleted', async () => {
    await attach(FIRST)
    await assets().delete({ id: gallery()[0]._id })
    expect(gallery()).toEqual([])
    // Retry handoff from the Task editor: the same, already saved render.
    await attach(FIRST)
    expect(gallery()).toEqual([])
    // A new render of the Task goes to the gallery again.
    upload(SECOND)
    await attach(SECOND)
    expect(gallery()).toEqual([
      expect.objectContaining({ image: image(SECOND) }),
    ])
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
      galleryPending: true,
    })
    expect(h.handedOff).toEqual(['variant-1'])
    expect(gallery()).toEqual([])
    // The Task editor reads the mark and offers the retry.
    expect((await marketing().task.get({ taskId: TASK })).task).toMatchObject({
      assetId: FIRST,
      galleryPending: true,
      handoffPending: false,
    })

    h.galleryDown = false
    expect(await attach(FIRST)).toEqual({
      success: true,
      handoffFailures: [],
      gallerySaved: true,
    })
    expect(gallery()).toEqual([
      expect.objectContaining({ image: image(FIRST) }),
    ])
    expect(task()).not.toHaveProperty('galleryPending')
    expect((await marketing().task.get({ taskId: TASK })).task).toMatchObject({
      galleryPending: false,
    })
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

describe("deleting a render Task's gallery entry deletes its file once nothing holds it (#1165)", () => {
  // The user's decision on PR #1228, spec §5: the entry's image goes through
  // the shared orphan check like any gallery upload's, in either order.
  const removeTask = () =>
    deleteTask({
      taskId: TASK,
      taskRev: task()._rev as string,
      conferenceId: 'conf-A',
      variant: null,
      dependantIds: [],
    })
  const removeEntry = () => assets().delete({ id: gallery()[0]._id })

  it('Task deleted first: the entry keeps the file; deleting the entry then deletes it', async () => {
    await attach(FIRST)
    expect(await removeTask()).toBe(true)
    expect(byId(TASK)).toBeUndefined()
    expect(byId(FIRST)).toBeDefined()
    await removeEntry()
    expect(gallery()).toEqual([])
    expect(byId(FIRST)).toBeUndefined()
  })

  it('after a re-render, the entry takes its CURRENT image with it', async () => {
    await attach(FIRST)
    upload(SECOND)
    await attach(SECOND)
    await removeTask()
    expect(byId(SECOND)).toBeDefined()
    await removeEntry()
    expect(byId(SECOND)).toBeUndefined()
  })

  it('entry deleted first while a post holds the image: the file is kept, and still after the Task goes', async () => {
    await attach(FIRST)
    h.dataset.push({
      _id: 'post-1',
      _type: 'socialPost',
      conference: ref('conf-A'),
      attachments: [{ _key: 'a', image: image(FIRST), alt: 'Ada' }],
    })
    await removeEntry()
    expect(gallery()).toEqual([])
    expect(byId(FIRST)).toBeDefined()
    await removeTask()
    expect(byId(FIRST)).toBeDefined()
    expect(byId('post-1')).toMatchObject({
      attachments: [{ image: image(FIRST) }],
    })
  })

  it('entry deleted first with no post: the Task still holds the file, and its delete takes it', async () => {
    await attach(FIRST)
    await removeEntry()
    expect(byId(FIRST)).toBeDefined()
    await removeTask()
    expect(byId(FIRST)).toBeUndefined()
  })
})

describe('finishing a render Task with an asset from the gallery (#1166)', () => {
  const LOGO = 'image-logo-1080x1080-png'
  const THEIRS = 'image-theirs-1080x1080-png'
  const GIF = 'image-dance-480x480-gif'
  const POSTER = 'image-poster-1920x1080-jpg'
  /** The organization-scoped read of the picked asset. */
  const ASSET_READ = '"imageAssetId": image.asset._ref'
  const asset = (
    id: string,
    fields: Record<string, unknown>,
  ): Doc => ({
    _id: id,
    _type: 'marketingAsset',
    _rev: `rev-${id}`,
    organization: ref('org-A'),
    scope: 'organization',
    kind: 'image',
    title: id,
    alt: `Alt of ${id}`,
    ...fields,
  })
  const post = (id: string) => byId(id)!
  /** The gallery as an organizer sees it: the attach guard bumps a revision. */
  const entries = () => gallery().map(({ _rev: _, ...doc }) => doc)
  const finish = (marketingAssetId: string) =>
    marketing().task.attachAsset({
      taskId: TASK,
      taskRev: task()._rev as string,
      marketingAssetId,
    })

  beforeEach(() => {
    h.realHandoff = true
    h.dataset.push(
      { _id: LOGO, _type: 'sanity.imageAsset', mimeType: 'image/png' },
      { _id: THEIRS, _type: 'sanity.imageAsset', mimeType: 'image/png' },
      { _id: GIF, _type: 'sanity.imageAsset', mimeType: 'image/gif' },
      { _id: POSTER, _type: 'sanity.imageAsset', mimeType: 'image/jpeg' },
      { _id: 'file-clip-mp4', _type: 'sanity.fileAsset' },
      asset('asset-logo', { image: image(LOGO), alt: 'The CNB logo' }),
      asset('asset-theirs', {
        organization: ref('org-B'),
        image: image(THEIRS),
      }),
      asset('asset-gif', { image: image(GIF) }),
      // A future kind (#1167) refused by the allowlist, not a denylist.
      asset('asset-kind-gif', { kind: 'gif', image: image(LOGO) }),
      asset('asset-video', {
        kind: 'video',
        video: { _type: 'file', asset: ref('file-clip-mp4') },
        poster: image(POSTER),
      }),
      asset('asset-audio', {
        kind: 'audio',
        audio: { _type: 'file', asset: ref('file-clip-mp4') },
      }),
      {
        _id: 'post-1',
        _type: 'socialPost',
        _rev: 'rev-post-1',
        conference: ref('conf-A'),
      },
      {
        _id: 'post-2',
        _type: 'socialPost',
        _rev: 'rev-post-2',
        conference: ref('conf-A'),
        attachments: [
          {
            _key: 'own',
            _type: 'socialPostAttachment',
            image: image(SECOND),
            alt: 'Already chosen',
          },
        ],
      },
      {
        _id: 'task-pub-2',
        _type: 'marketingTask',
        _rev: 'rev-pub-2',
        conference: ref('conf-A'),
        campaign: { ...ref('camp'), _weak: true },
        kind: 'publishing',
        prerequisites: [{ _key: 'r', ...ref(TASK), _weak: true }],
        variant: { ...ref('variant-2'), _weak: true },
      },
      {
        _id: 'variant-2',
        _type: 'socialPostVariant',
        _rev: 'rev-variant-2',
        conference: ref('conf-A'),
        post: ref('post-2'),
        status: 'draft',
        body: 'Two',
      },
    )
    Object.assign(byId('variant-1')!, {
      _rev: 'rev-variant-1',
      post: ref('post-1'),
      status: 'draft',
      body: 'One',
    })
  })

  it("completes the Task, and the waiting posts receive the image with the asset's alt", async () => {
    const galleryBefore = structuredClone(entries())
    expect(await finish('asset-logo')).toEqual({
      success: true,
      handoffFailures: [],
    })
    expect(task()).toMatchObject({
      asset: image(LOGO),
      galleryAsset: { ...ref('asset-logo'), _weak: true },
    })
    expect(task().handoffDoneFor).toEqual(
      expect.arrayContaining(['variant-1', 'variant-2']),
    )
    expect(post('post-1').attachments).toEqual([
      expect.objectContaining({
        _type: 'socialPostAttachment',
        image: image(LOGO),
        alt: 'The CNB logo',
      }),
    ])
    const key = (post('post-1').attachments as { _key: string }[])[0]._key
    expect(byId('variant-1')!.attachments).toEqual([
      expect.objectContaining({ source: key }),
    ])
    // Already in the gallery: no second entry, and no gallery mark.
    expect(entries()).toEqual(galleryBefore)
    expect(task()).not.toHaveProperty('galleryPending')
    // The Task's own pending upload is not this image and is left alone.
    expect(task().pendingStudioAsset).toEqual(image(FIRST))
  })

  it('leaves a post that already has an attachment as it is', async () => {
    const before = structuredClone(post('post-2'))
    await finish('asset-logo')
    expect(post('post-2')).toEqual(before)
  })

  it('clears a gallery mark a failed render save left: that render is replaced', async () => {
    Object.assign(task(), { asset: image(FIRST), galleryPending: true })
    const galleryBefore = structuredClone(entries())
    await finish('asset-logo')
    expect(task()).not.toHaveProperty('galleryPending')
    expect(entries()).toEqual(galleryBefore)
  })

  it.each([
    ["another organization's asset", 'asset-theirs', 'NOT_FOUND'],
    ['an id that does not exist', 'asset-nope', 'NOT_FOUND'],
    ['a GIF', 'asset-gif', 'BAD_REQUEST'],
    ['a video', 'asset-video', 'BAD_REQUEST'],
    ['an audio track', 'asset-audio', 'BAD_REQUEST'],
    ['a kind the allowlist does not name', 'asset-kind-gif', 'BAD_REQUEST'],
  ])('refuses %s and leaves the Task unchanged', async (_what, id, code) => {
    const before = structuredClone(h.dataset)
    await expect(finish(id)).rejects.toMatchObject({ code })
    expect(h.dataset).toEqual(before)
    expect(h.handedOff).toEqual([])
  })

  it("refuses another organization's asset exactly as a missing one, before reading it", async () => {
    const reads: string[] = []
    h.onFetch = (query) => void reads.push(query)
    const theirs = await finish('asset-theirs').catch((e: Error) => e)
    const missing = await finish('asset-nope').catch((e: Error) => e)
    expect(theirs).toMatchObject({ code: 'NOT_FOUND' })
    expect(missing).toMatchObject({ code: 'NOT_FOUND' })
    expect((theirs as Error).message).toBe((missing as Error).message)
    expect(reads.some((q) => q.includes(ASSET_READ))).toBe(false)
  })

  it.each([
    ["a gallery asset's image, sent as a bare image id", LOGO],
    ['an arbitrary image id', THEIRS],
  ])('still refuses %s that is not this Task\'s upload', async (_what, id) => {
    const before = structuredClone(h.dataset)
    await expect(attach(id)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Upload this image for this Task first.',
    })
    expect(h.dataset).toEqual(before)
  })

  it.each([
    [
      'edited',
      () => Object.assign(byId('asset-logo')!, { _rev: 'rev-edited' }),
    ],
    [
      'deleted',
      () => {
        h.dataset = h.dataset.filter((d) => d._id !== 'asset-logo')
      },
    ],
  ])(
    'refuses an asset %s between its read and the save; the Task is unchanged',
    async (_what, race) => {
      h.onFetch = (query) => (query.includes(ASSET_READ) ? race : undefined)
      const before = structuredClone(task())
      await expect(finish('asset-logo')).rejects.toThrow()
      expect(task()).toEqual(before)
      expect(post('post-1')).not.toHaveProperty('attachments')
    },
  )

  it("a retry hands the asset's alt, not the Task's", async () => {
    await finish('asset-logo')
    // A publishing Task that starts waiting afterwards.
    h.dataset.push(
      { _id: 'post-3', _type: 'socialPost', _rev: 'r', conference: ref('conf-A') },
      {
        _id: 'task-pub-3',
        _type: 'marketingTask',
        _rev: 'rev-pub-3',
        conference: ref('conf-A'),
        campaign: { ...ref('camp'), _weak: true },
        kind: 'publishing',
        prerequisites: [{ _key: 'r', ...ref(TASK), _weak: true }],
        variant: { ...ref('variant-3'), _weak: true },
      },
      {
        _id: 'variant-3',
        _type: 'socialPostVariant',
        _rev: 'rev-variant-3',
        conference: ref('conf-A'),
        post: ref('post-3'),
        status: 'draft',
        body: 'Three',
      },
    )
    const galleryBefore = structuredClone(entries())
    // Retry handoff, as the Task editor sends it: the Task's own image id.
    expect(await attach(LOGO)).toEqual({ success: true, handoffFailures: [] })
    expect(post('post-3').attachments).toEqual([
      expect.objectContaining({ image: image(LOGO), alt: 'The CNB logo' }),
    ])
    expect(entries()).toEqual(galleryBefore)
  })

  it("a studio render afterwards replaces it, and never records or deletes the gallery's file", async () => {
    await finish('asset-logo')
    upload(SECOND)
    await attach(SECOND)
    expect(task().asset).toEqual(image(SECOND))
    expect(task()).not.toHaveProperty('galleryAsset')
    expect(task().replacedRenders ?? []).not.toContain(LOGO)
    expect(byId(LOGO)).toBeDefined()
    expect(byId('asset-logo')).toMatchObject({ image: image(LOGO) })
  })
})
