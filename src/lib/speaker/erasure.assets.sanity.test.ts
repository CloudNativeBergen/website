/**
 * @vitest-environment node
 *
 * Speaker erasure removes their images everywhere we hold them (#1162,
 * `docs/MARKETING_ASSETS_SPEC.md` §6) — asserted on the STORED DOCUMENTS.
 *
 * Reads run `groq-js` over an in-memory dataset; the transaction is a REAL
 * `@sanity/client` transaction whose serialized mutations are applied by
 * Sanity's own `@sanity/mutator`. What the harness MODELS rather than runs,
 * each one stated so it is not mistaken for evidence:
 *
 *  - VISIBILITY by API version and perspective. `versions.**` documents are
 *    visible only to a `raw` read at 2025-02-19 or later (Sanity's documented
 *    rule); at that version a read with no perspective sees published
 *    documents only; below it, the default sees drafts but no versions. So a
 *    read that drops `withConfig` or `perspective: 'raw'` stops seeing a
 *    release copy, and a test fails.
 *  - A MUTATION of a `versions.**` document is refused below API 2025-02-19.
 *    That is an ASSUMPTION, not verified against Sanity (production holds no
 *    release): it pins that the transaction is sent at the newer version,
 *    which is the safe side if the assumption is wrong.
 *  - `ifRevisionID`, which the mutator ignores: checked, whole transaction
 *    refused. A `delete`, which the mutator applies to any document it is
 *    handed: each mutation is routed to its own id.
 *  - A document delete — and the direct asset delete — is refused while a
 *    STRONG reference to it remains, Sanity's rule and the reason the file
 *    delete must come after the unsets.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const h = vi.hoisted(() => ({
  dataset: [] as Array<Record<string, unknown> & { _id: string }>,
  /** Asset ids whose direct delete fails, to leave a linked file behind. */
  failFileDelete: new Set<string>(),
  revCounter: 0,
}))

/** True when some other document holds a STRONG reference to `id`. */
function stronglyReferenced(
  dataset: Array<Record<string, unknown> & { _id: string }>,
  id: string,
): boolean {
  const walk = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(walk)
    if (typeof value !== 'object' || value === null) return false
    const v = value as Record<string, unknown>
    if (v._ref === id && v._weak !== true && v.weak !== true) return true
    return Object.values(v).some(walk)
  }
  return dataset.some((doc) => doc._id !== id && walk(doc))
}

vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const { parse, evaluate } = await import('groq-js')
  const { createRequire: req } = await import('node:module')
  const { Mutation } = req(req(import.meta.url).resolve('sanity/package.json'))(
    '@sanity/mutator',
  ) as {
    Mutation: new (o: { mutations: unknown[] }) => {
      apply: (d: unknown) => Record<string, unknown> | null
    }
  }
  const client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2025-02-19',
    useCdn: false,
  })

  const OLD = '2023-05-03' // the clients' own apiVersion
  const knowsReleases = (apiVersion: string) => apiVersion >= '2025-02-19'
  const isVersion = (id: string) => id.startsWith('versions.')

  const visible = (apiVersion: string, perspective: unknown) =>
    h.dataset.filter((d) => {
      if (knowsReleases(apiVersion)) {
        if (perspective === 'raw') return true
        return !isVersion(d._id) && !d._id.startsWith('drafts.')
      }
      return !isVersion(d._id)
    })
  const fetchAt =
    (apiVersion: string) =>
    async (
      query: string,
      params: Record<string, unknown> = {},
      opts: { perspective?: unknown } = {},
    ) =>
      (
        await evaluate(parse(query), {
          dataset: visible(apiVersion, opts.perspective),
          params,
        })
      ).get()
  const reader = {
    fetch: fetchAt(OLD),
    withConfig: (c: { apiVersion: string }) => ({
      fetch: fetchAt(c.apiVersion),
    }),
  }

  type Mut =
    | { patch: { id: string; ifRevisionID?: string } }
    | { delete: { id: string } }

  return {
    clientReadUncached: reader,
    clientReadCached: reader,
    clientWrite: {
      fetch: fetchAt(OLD),
      withConfig: (c: { apiVersion: string }) => ({
        transaction: () => transactionAt(c.apiVersion),
      }),
      transaction: () => transactionAt(OLD),
      delete: async (id: string) => {
        if (h.failFileDelete.has(id)) throw new Error('503: try again')
        if (stronglyReferenced(h.dataset, id)) {
          throw new Error(`409: ${id} is still referenced`)
        }
        h.dataset = h.dataset.filter((d) => d._id !== id)
        return {}
      },
    },
  }

  function transactionAt(apiVersion: string) {
    const tx = client.transaction()
    tx.commit = (async () => {
      const next = structuredClone(h.dataset)
      const rev = `rev-${++h.revCounter}`
      // Modelled, not verified: an empty transaction is treated as refused,
      // so a run that has nothing to write must not send one.
      if (tx.serialize().length === 0) throw new Error('400: empty transaction')
      for (const m of tx.serialize() as Mut[]) {
        const id = 'delete' in m ? m.delete.id : m.patch.id
        if (isVersion(id) && !knowsReleases(apiVersion)) {
          throw new Error(`400: ${id} needs API 2025-02-19 (modelled)`)
        }
      }
      for (const m of tx.serialize() as Mut[]) {
        if ('delete' in m) {
          const i = next.findIndex((d) => d._id === m.delete.id)
          if (i !== -1) next.splice(i, 1)
          continue
        }
        const i = next.findIndex((d) => d._id === m.patch.id)
        if (i === -1) throw new Error(`no such document: ${m.patch.id}`)
        if (m.patch.ifRevisionID && next[i]._rev !== m.patch.ifRevisionID) {
          throw new Error(`409: ${m.patch.id} revision mismatch`)
        }
        const patched = new Mutation({ mutations: [m] }).apply(next[i])
        next[i] = { ...(patched as (typeof next)[number]), _rev: rev }
      }
      for (const m of tx.serialize() as Mut[]) {
        if ('delete' in m && stronglyReferenced(next, m.delete.id)) {
          throw new Error(`409: ${m.delete.id} is still referenced`)
        }
      }
      h.dataset = next
      return { transactionId: rev }
    }) as typeof tx.commit
    return tx
  }
})

import { eraseSpeakerInPlace, verifySpeakerErasure } from './erasure'

const ADA = 'spkada0001'
const BOB = 'spkbob0002'
const TALK_ADA = 'talk-ada' // Ada and Bob give it together
const TALK_BOB = 'talk-bob'

const ADA_CARD = 'image-adacard-1200x630-png'
const TALK_CARD = 'image-talkcard-1200x630-png'
const ADA_CLIP = 'file-adaclip-mp4'
const RENDER = 'image-render-1080x1080-png' // a Task render, no gallery entry
const BOB_CARD = 'image-bobcard-1200x630-png'
const PROFILE = 'image-profile-400x400-jpg'

const LINKED = [ADA_CARD, TALK_CARD, ADA_CLIP, RENDER]

const ref = (id: string, extra: Record<string, unknown> = {}) => ({
  _type: 'reference',
  _ref: id,
  ...extra,
})
const weak = (id: string) => ref(id, { _weak: true })
const image = (id: string) => ({ _type: 'image', asset: ref(id) })

const doc = (id: string) => h.dataset.find((d) => d._id === id) as Doc
/** Documents holding a reference (`_ref`) to `id` — what Sanity counts. */
const referencesTo = (id: string) => {
  const holds = (value: unknown): boolean =>
    Array.isArray(value)
      ? value.some(holds)
      : typeof value === 'object' &&
        value !== null &&
        ((value as { _ref?: unknown })._ref === id ||
          Object.values(value).some(holds))
  return h.dataset.filter((d) => d._id !== id && holds(d))
}

function galleryAsset(id: string, subject: string, file: string): Doc {
  return {
    _id: id,
    _type: 'marketingAsset',
    _rev: 'r0',
    organization: ref('org-a'),
    scope: 'organization',
    kind: 'image',
    title: `Card ${id}`,
    alt: 'A speaker card',
    subject: weak(subject),
    image: image(file),
  }
}

function seed() {
  h.revCounter = 0
  h.failFileDelete = new Set()
  h.dataset = [
    ...[ADA_CARD, TALK_CARD, RENDER, BOB_CARD, PROFILE].map((id) => ({
      _id: id,
      _type: 'sanity.imageAsset',
    })),
    { _id: ADA_CLIP, _type: 'sanity.fileAsset' },
    {
      _id: ADA,
      _type: 'speaker',
      _rev: 'r0',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      slug: { _type: 'slug', current: 'ada' },
      image: image(PROFILE),
    },
    {
      _id: BOB,
      _type: 'speaker',
      _rev: 'r0',
      name: 'Bob',
      email: 'bob@example.com',
      slug: { _type: 'slug', current: 'bob' },
    },
    { _id: TALK_ADA, _type: 'talk', speakers: [ref(ADA), ref(BOB)] },
    { _id: TALK_BOB, _type: 'talk', speakers: [ref(BOB)] },

    // About Ada: published, draft and release version of one gallery entry.
    galleryAsset('asset-ada', ADA, ADA_CARD),
    galleryAsset(`drafts.asset-ada`, ADA, ADA_CARD),
    galleryAsset(`versions.rlaunch.asset-ada`, ADA, ADA_CARD),
    // A video about Ada (the #1167 shape: the walk, not a field name, finds it).
    {
      ...galleryAsset('asset-clip', ADA, ADA_CARD),
      image: undefined,
      kind: 'video',
      video: { _type: 'file', asset: ref(ADA_CLIP) },
    },
    // About a talk Ada gives.
    galleryAsset('asset-talk', TALK_ADA, TALK_CARD),
    // About Bob alone — must be untouched.
    galleryAsset('asset-bob', BOB, BOB_CARD),

    // A Task about Ada whose render was never saved to the gallery.
    {
      _id: 'task-ada',
      _type: 'marketingTask',
      _rev: 'r0',
      title: 'Speaker card for Ada',
      subject: weak(ADA),
      asset: image(RENDER),
      alt: 'Ada on stage',
    },
    {
      _id: 'task-bob',
      _type: 'marketingTask',
      _rev: 'r0',
      title: 'Speaker card for Bob',
      subject: weak(TALK_BOB),
      asset: image(BOB_CARD),
    },

    // A published post with Ada's card and Bob's card, and its variant.
    {
      _id: 'post-1',
      _type: 'socialPost',
      _rev: 'r0',
      body: 'Meet our speakers',
      attachments: [
        { _key: 'att-ada', image: image(ADA_CARD), alt: 'Ada' },
        { _key: 'att-bob', image: image(BOB_CARD), alt: 'Bob' },
      ],
    },
    {
      _id: 'versions.rlaunch.post-1',
      _type: 'socialPost',
      _rev: 'r0',
      body: 'Meet our speakers (launch)',
      attachments: [{ _key: 'att-ada', image: image(ADA_CARD), alt: 'Ada' }],
    },
    {
      _id: 'var-1',
      _type: 'socialPostVariant',
      _rev: 'r0',
      post: weak('post-1'),
      platform: 'bluesky',
      body: 'Meet our speakers',
      status: 'published',
      attachments: [
        { _key: 'va-ada', source: 'att-ada' },
        { _key: 'va-bob', source: 'att-bob' },
      ],
    },
    // A post carrying the Task render.
    {
      _id: 'post-render',
      _type: 'socialPost',
      _rev: 'r0',
      body: 'Ada is speaking',
      attachments: [{ _key: 'att-r', image: image(RENDER), alt: 'Ada' }],
    },
  ].map((d) => JSON.parse(JSON.stringify(d)))
}

beforeEach(() => {
  seed()
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('speaker erasure removes their images everywhere (#1162)', () => {
  it('deletes every linked file, and no document references one afterwards', async () => {
    const result = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(result.err).toBeNull()

    for (const file of LINKED) {
      expect(doc(file), `${file} still stored`).toBeUndefined()
      expect(
        referencesTo(file).map((d) => d._id),
        file,
      ).toEqual([])
    }
    expect(result.linkedFiles).toEqual(
      expect.arrayContaining(
        LINKED.map((id) => ({ id, deleted: true, error: null })),
      ),
    )
    expect(result.verification?.clean).toBe(true)
  })

  it('removes the gallery entries about the speaker and their talk, in every version', () => {
    return eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' }).then(() => {
      for (const id of [
        'asset-ada',
        'drafts.asset-ada',
        'versions.rlaunch.asset-ada',
        'asset-clip',
        'asset-talk',
      ]) {
        expect(doc(id), id).toBeUndefined()
      }
    })
  })

  it('leaves another speaker’s asset, Task and file untouched', async () => {
    const before = structuredClone([doc('asset-bob'), doc('task-bob')])
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect([doc('asset-bob'), doc('task-bob')]).toEqual(before)
    expect(doc(BOB_CARD)).toBeDefined()
  })

  it('a published post keeps its text and the other image, and loses Ada’s — variant included', async () => {
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(doc('post-1')).toMatchObject({
      body: 'Meet our speakers',
      attachments: [{ _key: 'att-bob', image: image(BOB_CARD), alt: 'Bob' }],
    })
    expect(doc('versions.rlaunch.post-1')).toMatchObject({
      body: 'Meet our speakers (launch)',
      attachments: [],
    })
    expect(doc('var-1')).toMatchObject({
      body: 'Meet our speakers',
      status: 'published',
      attachments: [{ _key: 'va-bob', source: 'att-bob' }],
    })
    expect(doc('post-render')).toMatchObject({
      body: 'Ada is speaking',
      attachments: [],
    })
  })

  it('finds a Task render with no gallery entry through the Task’s subject, and keeps the Task', async () => {
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    const task = doc('task-ada')
    expect(task.asset).toBeUndefined()
    expect(task).toMatchObject({
      title: 'Speaker card for Ada',
      subject: weak(ADA),
    })
    expect(doc(RENDER)).toBeUndefined()
  })

  it('is a fixed point: a second run plans nothing and changes nothing', async () => {
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    const after = structuredClone(h.dataset)
    const second = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(second.err).toBeNull()
    expect(second.plan?.noop).toBe(true)
    expect(second.linkedFiles).toEqual([])
    expect(h.dataset).toEqual(after)
    expect(second.verification?.clean).toBe(true)
  })

  it('verification FAILS when a linked file is left behind', async () => {
    h.failFileDelete.add(RENDER)
    const result = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(doc(RENDER)).toBeDefined()
    expect(result.linkedFiles).toContainEqual({
      id: RENDER,
      deleted: false,
      error: expect.stringContaining('503'),
    })
    expect(result.verification?.clean).toBe(false)
    expect(result.verification?.residual.linkedFiles).toBe(1)
    // A later standalone check handed the ids finds it even with no record
    // on the speaker — `priorFileIds` alone, not `erasedFileIds`.
    delete doc(ADA).erasedFileIds
    expect(
      (await verifySpeakerErasure(ADA, [], [RENDER]))?.residual.linkedFiles,
    ).toBe(1)
  })

  it('records the files on the speaker, so a re-run retries one a failed delete left, and a bare verify sees it', async () => {
    h.failFileDelete.add(RENDER)
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(doc(ADA).erasedFileIds).toEqual(expect.arrayContaining(LINKED))

    // Nothing links the render any more; only the record on the speaker does.
    const bare = await verifySpeakerErasure(ADA)
    expect(bare?.clean).toBe(false)
    expect(bare?.residual.linkedFiles).toBe(1)

    h.failFileDelete.clear()
    const retry = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(retry.plan?.noop).toBe(false)
    expect(retry.linkedFiles).toEqual([
      { id: RENDER, deleted: true, error: null },
    ])
    expect(doc(RENDER)).toBeUndefined()
    expect(retry.verification?.clean).toBe(true)

    // And then the fixed point.
    const third = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(third.plan?.noop).toBe(true)
  })

  it('finds an asset about a talk that exists only in a release', async () => {
    h.dataset.push(
      {
        _id: 'versions.rlaunch.talk-new',
        _type: 'talk',
        speakers: [ref(ADA)],
      },
      galleryAsset('asset-new-talk', 'talk-new', BOB_CARD),
    )
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(doc('asset-new-talk')).toBeUndefined()
  })

  it('verification FAILS on a leftover gallery entry about the speaker that holds no file', async () => {
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    h.dataset.push({
      ...galleryAsset('drafts.asset-empty', ADA, BOB_CARD),
      image: undefined,
    })
    const v = await verifySpeakerErasure(ADA)
    expect(v?.residual).toMatchObject({
      marketingAssets: 1,
      linkedFileHolders: 0,
      linkedFiles: 0,
    })
    expect(v?.clean).toBe(false)
  })

  it('verification FAILS while a gallery entry about the speaker remains', async () => {
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    h.dataset.push(galleryAsset('asset-late', ADA, BOB_CARD))
    const v = await verifySpeakerErasure(ADA)
    expect(v?.clean).toBe(false)
    expect(v?.residual.marketingAssets).toBe(1)
    expect(v?.residual.linkedFileHolders).toBeGreaterThan(0)
  })

  it('finds a STALE render still in a post tied to a subject Task, and leaves a shared logo alone', async () => {
    // task-ada rendered STALE, the handoff put it in post-stale, then a
    // re-render replaced task-ada.asset with RENDER. The handoff found the
    // post occupied, so it still holds STALE — and no link but the Task
    // chain leads there: task-pub needs task-ada, and owns var-stale.
    const STALE = 'image-stale-1080x1080-png'
    const LOGO = 'image-logo-400x400-png'
    const DIRECT = 'image-direct-1080x1080-png'
    h.dataset.push(
      { _id: STALE, _type: 'sanity.imageAsset' },
      { _id: LOGO, _type: 'sanity.imageAsset' },
      { _id: DIRECT, _type: 'sanity.imageAsset' },
      {
        _id: 'task-pub',
        _type: 'marketingTask',
        _rev: 'r0',
        kind: 'publishing',
        prerequisites: [weak('task-ada')],
        variant: weak('var-stale'),
      },
      {
        _id: 'var-stale',
        _type: 'socialPostVariant',
        _rev: 'r0',
        post: weak('post-stale'),
        attachments: [
          { _key: 'vs-1', source: 'att-stale' },
          { _key: 'vs-2', source: 'att-logo' },
        ],
      },
      {
        _id: 'post-stale',
        _type: 'socialPost',
        _rev: 'r0',
        body: 'Ada, rendered',
        attachments: [
          { _key: 'att-stale', image: image(STALE), alt: 'Ada' },
          { _key: 'att-logo', image: image(LOGO), alt: 'Logo' },
        ],
      },
      // The logo is used by a post that has nothing to do with Ada.
      {
        _id: 'post-other',
        _type: 'socialPost',
        _rev: 'r0',
        body: 'Tickets on sale',
        attachments: [{ _key: 'att-logo', image: image(LOGO), alt: 'Logo' }],
      },
      // A publishing Task ABOUT Ada, its variant's post holding an image no
      // gallery entry or render names.
      {
        _id: 'task-direct',
        _type: 'marketingTask',
        _rev: 'r0',
        kind: 'publishing',
        subject: weak(ADA),
        variant: weak('var-direct'),
      },
      {
        _id: 'var-direct',
        _type: 'socialPostVariant',
        _rev: 'r0',
        post: weak('post-direct'),
        attachments: [{ _key: 'vd-1', source: 'att-direct' }],
      },
      {
        _id: 'drafts.post-direct',
        _type: 'socialPost',
        _rev: 'r0',
        body: 'Ada speaks',
        attachments: [{ _key: 'att-direct', image: image(DIRECT), alt: 'Ada' }],
      },
    )
    const result = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(result.err).toBeNull()

    for (const file of [STALE, DIRECT]) {
      expect(doc(file), `${file} still stored`).toBeUndefined()
      expect(
        referencesTo(file).map((d) => d._id),
        file,
      ).toEqual([])
    }
    expect(doc('post-stale')).toMatchObject({
      body: 'Ada, rendered',
      attachments: [{ _key: 'att-logo', image: image(LOGO), alt: 'Logo' }],
    })
    expect(doc('var-stale').attachments).toEqual([
      { _key: 'vs-2', source: 'att-logo' },
    ])
    expect(doc('var-direct').attachments).toEqual([])
    expect(doc(LOGO)).toBeDefined()
    expect(doc('post-other').attachments).toHaveLength(1)
    expect(result.verification?.clean).toBe(true)
  })

  it('finds a release-only gallery asset and a draft-only Task, each with its own file', async () => {
    const REL = 'image-releaseonly-1200x630-png'
    const DRAFT = 'image-draftonly-1080x1080-png'
    h.dataset.push(
      { _id: REL, _type: 'sanity.imageAsset' },
      { _id: DRAFT, _type: 'sanity.imageAsset' },
      galleryAsset('versions.rlaunch.asset-rel', ADA, REL),
      {
        _id: 'drafts.task-draft',
        _type: 'marketingTask',
        _rev: 'r0',
        subject: weak(ADA),
        asset: image(DRAFT),
      },
    )
    await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(doc('versions.rlaunch.asset-rel')).toBeUndefined()
    expect(doc('drafts.task-draft').asset).toBeUndefined()
    expect(doc(REL)).toBeUndefined()
    expect(doc(DRAFT)).toBeUndefined()
  })

  it('REFUSES, writing nothing, when a file is held somewhere erasure cannot strip', async () => {
    h.dataset.push({
      _id: 'gallery-1',
      _type: 'imageGallery',
      image: image(ADA_CARD),
      speakers: [],
    })
    const before = structuredClone(h.dataset)
    const result = await eraseSpeakerInPlace({ speakerId: ADA, actor: 'test' })
    expect(result.err?.message).toContain('imageGallery gallery-1')
    expect(h.dataset).toEqual(before)
  })
})
