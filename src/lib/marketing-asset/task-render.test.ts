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
  /** Runs once, just before a create lands: a concurrent attach. */
  beforeCreate: null as null | (() => void),
  /** Runs once, right after the Task is read: a newer attach landing. */
  afterTaskRead: null as null | (() => void),
  /** Runs once, just before a transaction lands: Studio opening a draft. */
  beforeTransaction: null as null | (() => void),
  /** Runs once, just before the entry's draft is read. */
  beforeDraftRead: null as null | (() => void),
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
      const race = h.beforeCreate
      h.beforeCreate = null
      h.afterTaskRead = null
      h.beforeTransaction = null
      h.beforeDraftRead = null
      race?.()
      const id = m.createIfNotExists._id as string
      const existing = h.dataset.find((d) => d._id === id)
      if (existing) return existing
      const created = {
        ...structuredClone(m.createIfNotExists),
        _rev: `rev-${++h.revs}`,
      } as unknown as Doc
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
      // The release-twin count reads at a newer API version; same dataset.
      withConfig: () => ({
        fetch: async (query: string, params: Record<string, unknown> = {}) =>
          (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
      }),
      fetch: async (query: string, params: Record<string, unknown> = {}) => {
        if (params.draftId && h.beforeDraftRead) {
          const race = h.beforeDraftRead
          h.beforeDraftRead = null
          race()
        }
        const value = (
          await evaluate(parse(query), { dataset: h.dataset, params })
        ).get()
        if (query.includes('"marketingTask"') && h.afterTaskRead) {
          const race = h.afterTaskRead
          h.afterTaskRead = null
          race()
        }
        return value
      },
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
      transaction: () => {
        const tx = real.transaction()
        tx.commit = (async () => {
          const race = h.beforeTransaction
          h.beforeTransaction = null
          race?.()
          // All or nothing, as a Sanity transaction is.
          const before = structuredClone(h.dataset)
          try {
            for (const m of tx.serialize()) commit(m as never)
          } catch (error) {
            h.dataset = before
            throw error
          }
          return {}
        }) as unknown as typeof tx.commit
        return tx
      },
    },
  }
})

import {
  saveTaskRenderToGallery,
  taskRenderAssetDocumentId,
} from './task-render'

/** A production Task id: `marketingTask.gen-<hash>` — it has a DOT. */
const TASK = 'marketingTask.gen-08a9f7bdf36600ee84200d4d2a5185e0'

const ORG = 'org-A'
/** The Task holds this render now, as the attach's save just wrote. */
function holds(imageAssetId: string) {
  const task = h.dataset.find((d) => d._id === TASK)!
  task.asset = {
    _type: 'image',
    asset: { _type: 'reference', _ref: imageAssetId },
  }
  // A save of the Task is a new revision of it.
  task._rev = `rev-task-${++h.revs}`
}
const entry = (imageAssetId: string) => (
  holds(imageAssetId),
  {
    orgId: ORG,
    conferenceId: 'conf-A',
    taskId: TASK,
    imageAssetId,
    title: 'Speaker card: Ada',
    alt: 'Ada Lovelace speaks at Cloud Native Bergen',
    subject: { type: 'speaker' as const, id: 'speaker-ada' },
  }
)
const gallery = () => h.dataset.filter((d) => d._type === 'marketingAsset')

beforeEach(() => {
  h.dataset = [
    { _id: 'org-A', _type: 'organization' },
    { _id: 'conf-A', _type: 'conference', organization: { _ref: ORG } },
    {
      _id: TASK,
      _type: 'marketingTask',
      conference: { _type: 'reference', _ref: 'conf-A' },
    },
  ]
  h.beforeCreate = null
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
        task: { _type: 'reference', _ref: TASK, _weak: true },
      }),
    ])
    // Its own file: deleting the entry runs the orphan check on it.
    expect(gallery()[0]).toMatchObject({ createdImageAssetId: 'image-a' })
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
      createdImageAssetId: 'image-b',
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
      task: { _type: 'reference', _ref: TASK, _weak: true },
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
      task: { _type: 'reference', _ref: TASK, _weak: true },
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

  it('verifies a create that lost a race: the entry ends up holding THIS render', async () => {
    // Another attach created the entry, with its older render, between this
    // one's read and its create — which is then a no-op.
    h.beforeCreate = () =>
      h.dataset.push({
        _id: taskRenderAssetDocumentId(TASK),
        _type: 'marketingAsset',
        _rev: 'rev-other',
        organization: { _type: 'reference', _ref: ORG },
        title: 'Theirs',
        image: {
          _type: 'image',
          asset: { _type: 'reference', _ref: 'image-a' },
        },
        task: { _type: 'reference', _ref: TASK, _weak: true },
      })
    expect(await saveTaskRenderToGallery(entry('image-b'))).toBe('replaced')
    expect(gallery()).toHaveLength(1)
    expect(gallery()[0]).toMatchObject({
      image: { asset: { _ref: 'image-b' } },
      title: 'Theirs',
    })
  })

  it('writes nothing for a render the Task no longer holds', async () => {
    await saveTaskRenderToGallery(entry('image-b'))
    const before = structuredClone(gallery())
    const stale = entry('image-a')
    holds('image-b')
    expect(await saveTaskRenderToGallery(stale)).toBe('superseded')
    expect(gallery()).toEqual(before)
  })

  it('a re-render also swaps the image of a Studio draft of the entry, and only the image', async () => {
    await saveTaskRenderToGallery(entry('image-a'))
    const published = gallery()[0]
    h.dataset.push({
      ...structuredClone(published),
      _id: `drafts.${published._id}`,
      title: 'Draft title',
      alt: 'Draft alt',
    })
    await saveTaskRenderToGallery(entry('image-b'))
    expect(h.dataset.find((d) => d._id === published._id)).toMatchObject({
      image: { asset: { _ref: 'image-b' } },
    })
    expect(
      h.dataset.find((d) => d._id === `drafts.${published._id}`),
    ).toMatchObject({
      image: { asset: { _ref: 'image-b' } },
      title: 'Draft title',
      alt: 'Draft alt',
    })
  })

  it('never puts an older render back when a newer attach lands between its reads', async () => {
    await saveTaskRenderToGallery(entry('image-a'))
    // Attach B: saved to the Task (image-b) and to the entry, right after
    // this attach — still re-saving image-a — read the Task.
    holds('image-a')
    h.afterTaskRead = () => {
      holds('image-b')
      const stored = gallery()[0]
      stored.image = {
        _type: 'image',
        asset: { _type: 'reference', _ref: 'image-b' },
      }
      stored._rev = 'rev-b'
    }
    const stale = { ...entry('image-a') }
    // Make the entry differ so this attach believes it must write.
    gallery()[0].image = {
      _type: 'image',
      asset: { _type: 'reference', _ref: 'image-old' },
    }
    expect(await saveTaskRenderToGallery(stale)).toBe('superseded')
    expect(gallery()[0]).toMatchObject({
      image: { asset: { _ref: 'image-b' } },
    })
  })

  it('refuses to replace while a Content Release holds a copy of the entry, so the save stays pending', async () => {
    await saveTaskRenderToGallery(entry('image-a'))
    const published = gallery()[0]
    h.dataset.push({
      ...structuredClone(published),
      _id: `versions.r-launch.${published._id}`,
    })
    await expect(saveTaskRenderToGallery(entry('image-b'))).rejects.toThrow(
      /Content Release/,
    )
    // Nothing moved: publishing the release could not undo a replace.
    expect(h.dataset.find((d) => d._id === published._id)).toMatchObject({
      image: { asset: { _ref: 'image-a' } },
    })
  })

  it('a Studio draft opened between the draft check and the commit still gets the new image', async () => {
    await saveTaskRenderToGallery(entry('image-a'))
    const published = gallery()[0]
    // An organizer starts editing: Studio copies the published entry, with
    // its OLD image, into a draft — after this save looked for a draft.
    h.beforeTransaction = () =>
      h.dataset.push({
        ...structuredClone(published),
        _id: `drafts.${published._id}`,
        _rev: 'rev-draft',
        title: 'Being edited',
      })
    expect(await saveTaskRenderToGallery(entry('image-b'))).toBe('replaced')
    expect(
      h.dataset.find((d) => d._id === `drafts.${published._id}`),
    ).toMatchObject({
      image: { asset: { _ref: 'image-b' } },
      createdImageAssetId: 'image-b',
      title: 'Being edited',
    })
  })

  it('never syncs a draft back to an older render once a newer attach moved everything on', async () => {
    await saveTaskRenderToGallery(entry('image-a'))
    const published = gallery()[0]
    const draftId = `drafts.${published._id}`
    // A draft still on an older image: this attach (re-saving image-a) has
    // the draft to bring up to date.
    h.dataset.push({
      ...structuredClone(published),
      _id: draftId,
      _rev: 'rev-draft-old',
      image: {
        _type: 'image',
        asset: { _type: 'reference', _ref: 'image-old' },
      },
    })
    const stale = { ...entry('image-a') }
    // Attach B lands after this one found its entry on image-a and before
    // it read the draft: Task, entry and draft all move to image-b.
    h.beforeDraftRead = () => {
      holds('image-b')
      for (const doc of gallery()) {
        doc.image = {
          _type: 'image',
          asset: { _type: 'reference', _ref: 'image-b' },
        }
        doc._rev = `${doc._id}-rev-b`
      }
    }
    expect(await saveTaskRenderToGallery(stale)).toBe('superseded')
    expect(h.dataset.find((d) => d._id === draftId)).toMatchObject({
      image: { asset: { _ref: 'image-b' } },
    })
  })

  it('a Content Release copy made from the old image during the replace keeps the save pending', async () => {
    await saveTaskRenderToGallery(entry('image-a'))
    const published = gallery()[0]
    h.beforeTransaction = () =>
      h.dataset.push({
        ...structuredClone(published),
        _id: `versions.r-launch.${published._id}`,
      })
    await expect(saveTaskRenderToGallery(entry('image-b'))).rejects.toThrow(
      /Content Release/,
    )
  })

  it('a release copy that already holds this render does not block', async () => {
    await saveTaskRenderToGallery(entry('image-a'))
    const published = gallery()[0]
    h.dataset.push({
      ...structuredClone(published),
      _id: `versions.r-launch.${published._id}`,
    })
    expect(await saveTaskRenderToGallery(entry('image-a'))).toBe('unchanged')
  })

  it('the same-render fast path refuses while a stale release copy exists', async () => {
    await saveTaskRenderToGallery(entry('image-a'))
    const published = gallery()[0]
    h.dataset.push({
      ...structuredClone(published),
      _id: `versions.r-launch.${published._id}`,
      image: {
        _type: 'image',
        asset: { _type: 'reference', _ref: 'image-old' },
      },
    })
    await expect(saveTaskRenderToGallery(entry('image-a'))).rejects.toThrow(
      /Content Release/,
    )
  })
})
