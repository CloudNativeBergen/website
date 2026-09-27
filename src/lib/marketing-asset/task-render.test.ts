/**
 * @vitest-environment node
 *
 * A render Task's gallery entry (#1165, spec §4.3), asserted on the STORED
 * documents: reads are executed with groq-js over an in-memory dataset
 * (through the real `scopedFetch`), and every write is built by the REAL
 * `@sanity/client` and applied with Sanity's own `@sanity/mutator`, under
 * the revision and create-if-not-exists rules Sanity enforces.
 */
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

type Doc = Record<string, unknown> & { _id: string }

const h = vi.hoisted(() => ({
  dataset: [] as (Record<string, unknown> & { _id: string })[],
  revs: 0,
  writes: 0,
  failWrites: false,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const real = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2025-02-19',
    useCdn: false,
  })
  const { Mutation } = createRequire(
    createRequire(import.meta.url).resolve('sanity/package.json'),
  )('@sanity/mutator') as {
    Mutation: new (o: { mutations: unknown[] }) => {
      apply: (doc: Doc | null) => Doc | null
    }
  }
  const commit = (m: Record<string, Record<string, unknown>>) => {
    if (h.failWrites) throw new Error('Sanity down')
    h.writes++
    if (m.createIfNotExists) {
      const id = m.createIfNotExists._id as string
      const existing = h.dataset.find((d) => d._id === id)
      if (existing) return existing
      const created = {
        ...structuredClone(m.createIfNotExists),
        _rev: `rev-${++h.revs}`,
      } as Doc
      h.dataset.push(created)
      return created
    }
    const i = h.dataset.findIndex((d) => d._id === m.patch.id)
    if (i < 0) throw Object.assign(new Error('missing'), { statusCode: 404 })
    if (m.patch.ifRevisionID && m.patch.ifRevisionID !== h.dataset[i]._rev)
      throw Object.assign(new Error('Revision mismatch'), { statusCode: 409 })
    const next = new Mutation({ mutations: [m] }).apply(
      structuredClone(h.dataset[i]),
    )!
    next._rev = `rev-${++h.revs}`
    h.dataset[i] = next
    return next
  }
  return {
    clientReadUncached: {
      fetch: async (query: string, params: Record<string, unknown> = {}) =>
        (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
    },
    clientWrite: {
      createIfNotExists: async (doc: Doc) =>
        commit(
          real
            .transaction()
            .createIfNotExists(doc as never)
            .serialize()[0] as never,
        ),
      patch: (id: string) => {
        const p = real.patch(id)
        p.commit = (async () =>
          commit({ patch: p.serialize() } as never)) as typeof p.commit
        return p
      },
    },
  }
})

import { saveTaskRenderToGallery } from './task-render'

const ORG = 'org-A'
const entry = (imageAssetId: string) => ({
  orgId: ORG,
  conferenceId: 'conf-A',
  taskId: 'task-1',
  imageAssetId,
  title: 'Speaker card: Ada',
  alt: 'Ada Lovelace speaks at Cloud Native Bergen',
  subject: { type: 'speaker' as const, id: 'speaker-ada' },
})
const gallery = () => h.dataset.filter((d) => d._type === 'marketingAsset')

beforeEach(() => {
  h.dataset = [
    { _id: 'org-A', _type: 'organization' },
    { _id: 'conf-A', _type: 'conference', organization: { _ref: ORG } },
  ]
  h.revs = 0
  h.writes = 0
  h.failWrites = false
})

describe('saveTaskRenderToGallery', () => {
  it('creates one edition entry from the Task, holding the Task weakly', async () => {
    expect(await saveTaskRenderToGallery(entry('image-a'))).toBe('created')
    expect(gallery()).toEqual([
      expect.objectContaining({
        _type: 'marketingAsset',
        organization: { _type: 'reference', _ref: ORG },
        scope: 'edition',
        conference: { _type: 'reference', _ref: 'conf-A' },
        kind: 'image',
        image: {
          _type: 'image',
          asset: { _type: 'reference', _ref: 'image-a' },
        },
        title: 'Speaker card: Ada',
        alt: 'Ada Lovelace speaks at Cloud Native Bergen',
        subject: { _type: 'reference', _ref: 'speaker-ada', _weak: true },
        tags: [],
        source: 'studio',
        task: { _type: 'reference', _ref: 'task-1', _weak: true },
      }),
    ])
    // Never claims the file as its own upload: the Task's upload made it.
    expect(gallery()[0]).not.toHaveProperty('createdImageAssetId')
    // A published id the gallery lists (no dot, so not a draft or version).
    expect(gallery()[0]._id).not.toContain('.')
  })

  it('leaves out a subject the Task does not have', async () => {
    await saveTaskRenderToGallery({ ...entry('image-a'), subject: null })
    expect(gallery()[0]).not.toHaveProperty('subject')
  })

  it('a retry of the same render creates no second entry and writes nothing', async () => {
    await saveTaskRenderToGallery(entry('image-a'))
    const before = structuredClone(gallery())
    const writes = h.writes
    expect(await saveTaskRenderToGallery(entry('image-a'))).toBe('unchanged')
    expect(gallery()).toEqual(before)
    expect(h.writes).toBe(writes)
  })

  it('a re-render swaps the image and keeps the title, tags and alt an organizer edited', async () => {
    await saveTaskRenderToGallery(entry('image-a'))
    const id = gallery()[0]._id
    Object.assign(gallery()[0], {
      title: 'Ada, final',
      alt: 'Edited alt',
      tags: ['keynote'],
      credit: 'Design team',
    })
    expect(
      await saveTaskRenderToGallery({
        ...entry('image-b'),
        title: 'New Task title',
        alt: 'New Task alt',
        subject: { type: 'speaker' as const, id: 'speaker-other' },
      }),
    ).toBe('replaced')
    expect(gallery()).toHaveLength(1)
    expect(gallery()[0]).toMatchObject({
      _id: id,
      image: { asset: { _ref: 'image-b' } },
      title: 'Ada, final',
      alt: 'Edited alt',
      tags: ['keynote'],
      credit: 'Design team',
      subject: { _ref: 'speaker-ada' },
    })
  })

  it('finds the entry by its Task reference, whatever its id', async () => {
    h.dataset.push({
      _id: 'some-other-id',
      _type: 'marketingAsset',
      organization: { _type: 'reference', _ref: ORG },
      scope: 'edition',
      title: 'Kept',
      image: { _type: 'image', asset: { _type: 'reference', _ref: 'image-a' } },
      task: { _type: 'reference', _ref: 'task-1', _weak: true },
    })
    expect(await saveTaskRenderToGallery(entry('image-b'))).toBe('replaced')
    expect(gallery()).toHaveLength(1)
    expect(gallery()[0]).toMatchObject({
      _id: 'some-other-id',
      title: 'Kept',
      image: { asset: { _ref: 'image-b' } },
    })
  })

  it("never touches another organization's entry for the same Task id", async () => {
    h.dataset.push({
      _id: 'theirs',
      _type: 'marketingAsset',
      organization: { _type: 'reference', _ref: 'org-B' },
      image: { _type: 'image', asset: { _type: 'reference', _ref: 'image-x' } },
      task: { _type: 'reference', _ref: 'task-1', _weak: true },
    })
    await saveTaskRenderToGallery(entry('image-a'))
    expect(h.dataset.find((d) => d._id === 'theirs')).toMatchObject({
      image: { asset: { _ref: 'image-x' } },
    })
    expect(
      gallery().filter(
        (d) => (d.organization as { _ref: string })._ref === ORG,
      ),
    ).toHaveLength(1)
  })

  it('throws when the write fails, so the caller can report it', async () => {
    h.failWrites = true
    await expect(saveTaskRenderToGallery(entry('image-a'))).rejects.toThrow()
  })
})
