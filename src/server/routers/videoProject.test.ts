/**
 * @vitest-environment node
 *
 * Saved studio videos (#1181) through the tRPC caller, against a two-tenant
 * dataset. Every read — the tenancy guard's included — is EXECUTED with
 * groq-js, and every write is built by the REAL `@sanity/client` (patch and
 * transaction builders) and applied with Sanity's REAL patch semantics
 * (`@sanity/mutator`). Only the network is replaced, by a store that also
 * refuses what Sanity refuses: a revision mismatch, and deleting a document
 * something still references strongly.
 */
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

type Doc = Record<string, unknown> & { _id: string }

const h = vi.hoisted(() => ({
  dataset: [] as (Record<string, unknown> & { _id: string })[],
  queries: [] as string[],
  revs: 0,
  /** Serialized mutations, in commit order. */
  mutations: [] as unknown[],
  /** Runs between a save's read and its commit: someone else saving. */
  beforeCommit: null as null | (() => void),
  host: { conferenceId: 'conf-A', orgId: 'org-A' },
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: h.host.conferenceId,
      organization: { _ref: h.host.orgId },
      title: 'This edition',
    },
    error: null,
  }),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const real = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2024-01-01',
    useCdn: false,
  })
  const run = async (query: string, params: Record<string, unknown> = {}) => {
    h.queries.push(query)
    const value = await evaluate(parse(query), { dataset: h.dataset, params })
    return value.get()
  }
  return {
    clientReadUncached: { fetch: run, withConfig: () => ({ fetch: run }) },
    clientWrite: {
      create: async (doc: Record<string, unknown>) => {
        const tx = real.transaction().create({
          _id: `vp-new-${h.revs + 1}`,
          ...doc,
        } as never)
        return (await commit(tx.serialize()))[0]
      },
      patch: (id: string) => {
        const p = real.patch(id)
        p.commit = (async () => {
          h.beforeCommit?.()
          return (await commit([{ patch: p.serialize() }]))[0]
        }) as typeof p.commit
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

  async function commit(mutations: unknown[]): Promise<Doc[]> {
    const { Mutation } = createRequire(
      createRequire(import.meta.url).resolve('sanity/package.json'),
    )('@sanity/mutator') as {
      Mutation: new (o: { mutations: unknown[] }) => {
        apply: (doc: Doc | null) => Doc | null
      }
    }
    h.mutations.push(...mutations)
    const out: Doc[] = []
    for (const m of mutations as Record<string, Record<string, unknown>>[]) {
      if (m.create) {
        const doc = { ...m.create, _rev: `rev-${++h.revs}` } as unknown as Doc
        h.dataset.push(doc)
        out.push(doc)
      } else if (m.patch) {
        const i = h.dataset.findIndex((d) => d._id === m.patch.id)
        if (i < 0)
          throw Object.assign(new Error('missing'), { statusCode: 404 })
        if (m.patch.ifRevisionID && m.patch.ifRevisionID !== h.dataset[i]._rev)
          throw Object.assign(new Error('Revision mismatch'), {
            statusCode: 409,
          })
        const next = new Mutation({ mutations: [m] }).apply(
          structuredClone(h.dataset[i]),
        )!
        next._rev = `rev-${++h.revs}`
        h.dataset[i] = next
        out.push(next)
      } else if (m.delete) {
        const id = m.delete.id as string
        const holders = h.dataset.filter(
          (d) => d._id !== id && strongRefs(d).has(id),
        )
        if (holders.length > 0)
          throw Object.assign(new Error('Document is referenced'), {
            statusCode: 409,
          })
        h.dataset = h.dataset.filter((d) => d._id !== id)
      }
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
import { videoProjectRouter } from './videoProject'
import { marketingAssetRouter } from './marketingAsset'
import type { ProjectSceneInput } from '@/lib/video-project/format'
import {
  listVideoProjects,
  readGalleryFiles,
  readVideoProject,
  readVideoProjectCreatedFiles,
  readVideoProjectDocument,
  readVideoProjectFiles,
} from '@/lib/video-project/sanity'

const t = initTRPC.context<Context>().create()
function context(): Context {
  const speaker = { _id: 'sp-1', name: 'Ada', organizerOrgIds: ['org-A'] }
  const user = { email: 'a@example.com', name: 'Ada', picture: '' }
  return {
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}
const projects = () => t.createCallerFactory(videoProjectRouter)(context())
const assets = () => t.createCallerFactory(marketingAssetRouter)(context())

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const HALL = 'image-hall-3000x2000-jpg'
const HALL_URL = 'https://cdn.sanity.io/images/p/d/hall-3000x2000.jpg'
const THEME = 'file-theme-mp3'

function fixture(): Doc[] {
  return [
    { _id: 'org-A', _type: 'organization' },
    { _id: 'org-B', _type: 'organization' },
    { _id: 'sp-ada', _type: 'speaker', name: 'Ada' },
    {
      _id: 'conf-A',
      _type: 'conference',
      organization: ref('org-A'),
      title: 'CND 2026',
    },
    {
      _id: 'conf-B',
      _type: 'conference',
      organization: ref('org-B'),
      title: 'B 2026',
    },
    {
      _id: HALL,
      _type: 'sanity.imageAsset',
      url: HALL_URL,
      metadata: { dimensions: { width: 3000, height: 2000 } },
    },
    {
      _id: 'image-theirs-100x100-png',
      _type: 'sanity.imageAsset',
      url: 'https://cdn.sanity.io/images/p/d/theirs-100x100.png',
      metadata: { dimensions: { width: 100, height: 100 } },
    },
    {
      _id: THEME,
      _type: 'sanity.fileAsset',
      url: 'https://cdn.sanity.io/files/p/d/theme.mp3',
    },
    {
      _id: 'asset-hall',
      _type: 'marketingAsset',
      organization: ref('org-A'),
      scope: 'organization',
      kind: 'image',
      title: 'Keynote hall',
      alt: 'The main hall',
      image: { _type: 'image', asset: ref(HALL) },
      createdImageAssetId: HALL,
      subject: { ...ref('sp-ada'), _weak: true },
    },
    {
      _id: 'asset-theme',
      _type: 'marketingAsset',
      organization: ref('org-A'),
      scope: 'organization',
      kind: 'audio',
      title: 'Theme',
      audio: { _type: 'file', asset: ref(THEME) },
      createdFileAssetId: THEME,
      rightsConfirmation: {
        confirmedBy: { ...ref('sp-1'), _weak: true },
        confirmedAt: '2026-09-20T10:00:00Z',
      },
    },
    {
      _id: 'asset-theirs',
      _type: 'marketingAsset',
      organization: ref('org-B'),
      scope: 'organization',
      kind: 'image',
      title: 'Theirs',
      alt: 'Theirs',
      image: { _type: 'image', asset: ref('image-theirs-100x100-png') },
    },
    {
      _id: 'vp-theirs',
      _type: 'videoProject',
      _rev: 'rev-b',
      organization: ref('org-B'),
      scope: 'organization',
      title: 'Their video',
      formatVersion: 1,
      scenes: [],
    },
  ]
}

const LINE = {
  text: 'Hello',
  verticalPosition: 30,
  fontSize: 120,
  fontFamily: 'Space Grotesk',
  isBold: true,
  isUppercase: false,
  color: '#FFFFFF',
  textAlign: 'left' as const,
  horizontalPosition: 6,
  textPadding: 5,
}

function scene(
  key: string,
  image: ProjectSceneInput['design']['background']['image'] = null,
): ProjectSceneInput {
  return {
    key,
    duration: 2.5,
    transition: 'fade',
    motion: {
      drift: true,
      elements: [
        { id: 'text0', entrance: 'pop', exit: 'fade', enter: 0.3, leave: 2 },
        {
          id: 'logo',
          entrance: 'slide-up',
          exit: 'none',
          enter: 0,
          leave: 2.5,
        },
      ],
    },
    design: {
      background: { color: '#1D4ED8', image },
      textLines: [LINE, { ...LINE, text: 'World', textAlign: 'center' }],
      logo: { size: 360, bottom: 40, right: 40, variant: 'gradient' },
      qr: {
        url: 'https://example.com/program',
        size: 250,
        dotsColor: '#FFFFFF',
        backgroundColor: 'transparent',
        dotsType: 'dots',
        cornerSquareType: 'rounded',
        cornerDotType: 'dot',
        horizontalPosition: 50,
        verticalPosition: 67,
      },
    },
  }
}

const TWO_SCENES = [
  scene('scene-a', { name: 'Keynote hall', galleryAssetId: 'asset-hall' }),
  scene('scene-b'),
]

const doc = (id: string) => h.dataset.find((d) => d._id === id)

beforeEach(() => {
  h.dataset = fixture()
  h.queries = []
  h.mutations = []
  h.revs = 0
  h.beforeCommit = null
})

/** The opened scene the editor gets back for an input scene. */
function opened(input: ProjectSceneInput, fileId?: string) {
  const image = input.design.background.image
  return {
    ...input,
    design: {
      ...input.design,
      background: {
        color: input.design.background.color,
        image: image
          ? {
              name: image.name,
              fileId,
              galleryAssetId: image.galleryAssetId,
              url: expect.stringMatching(/^\/api\/proxy-image\?url=/),
            }
          : null,
      },
    },
  }
}

describe('save, leave, reopen', () => {
  it('opens exactly what was saved, holding files by reference', async () => {
    const created = await projects().create({
      title: 'Launch teaser',
      scenes: TWO_SCENES,
    })
    expect(created.scenes).toEqual([
      { key: 'scene-a', fileId: HALL },
      { key: 'scene-b', fileId: null },
    ])

    const project = await projects().open({ id: created._id })
    expect(project).toMatchObject({
      _id: created._id,
      _rev: created._rev,
      title: 'Launch teaser',
      scope: 'organization',
      track: null,
    })
    expect(project.scenes).toEqual([
      opened(TWO_SCENES[0], HALL),
      opened(TWO_SCENES[1]),
    ])
    // Drawn through the same-origin proxy, as a canvas-sized rendition.
    const url = new URL(
      project.scenes[0].design.background.image!.url,
      'http://x',
    )
    expect(url.searchParams.get('url')).toContain(HALL_URL)

    const stored = doc(created._id)!
    expect(stored).toMatchObject({
      organization: ref('org-A'),
      scope: 'organization',
      formatVersion: 1,
    })
    const scenes = stored.scenes as Record<string, unknown>[]
    expect(scenes.map((s) => s._key)).toEqual(['scene-a', 'scene-b'])
    expect(scenes[0].background).toEqual({
      color: '#1D4ED8',
      image: {
        _type: 'image',
        asset: ref(HALL),
        name: 'Keynote hall',
        galleryAsset: { ...ref('asset-hall'), _weak: true },
        createdByGallery: true,
        // Copied from the asset, so erasure finds the file after it is gone.
        subject: { ...ref('sp-ada'), _weak: true },
      },
    })
    // Every array member keyed, and never bytes.
    for (const s of scenes) {
      for (const line of s.textLines as { _key?: string }[])
        expect(line._key).toMatch(/^line-/)
      for (const m of s.elements as { _key?: string }[])
        expect(m._key).toMatch(/^motion-/)
    }
    expect(JSON.stringify(stored)).not.toContain('data:')
  })

  it('saves over the revision it loaded, as one whole array, and carries the new one back', async () => {
    const created = await projects().create({
      title: 'Teaser',
      scenes: TWO_SCENES,
    })
    const loaded = await projects().open({ id: created._id })
    const edited = [
      {
        ...TWO_SCENES[1],
        design: {
          ...TWO_SCENES[1].design,
          textLines: [{ ...LINE, text: 'Changed' }],
        },
      },
      // The opened background, sent back by file id.
      scene('scene-a', {
        name: 'Keynote hall',
        galleryAssetId: 'asset-hall',
        fileId: loaded.scenes[0].design.background.image!.fileId,
      }),
    ]
    h.mutations = []
    const saved = await projects().save({
      id: created._id,
      rev: loaded._rev,
      title: 'Teaser v2',
      scenes: edited,
    })
    expect(saved._rev).toBe(doc(created._id)!._rev)
    expect(saved._rev).not.toBe(loaded._rev)

    // One patch: compare-and-set on the loaded revision, one set of the
    // whole array, no inserts.
    expect(h.mutations).toHaveLength(1)
    const patch = (h.mutations[0] as { patch: Record<string, unknown> }).patch
    expect(patch.ifRevisionID).toBe(loaded._rev)
    expect(patch).not.toHaveProperty('insert')
    expect((patch.set as { scenes: unknown[] }).scenes).toHaveLength(2)

    const reopened = await projects().open({ id: created._id })
    expect(reopened.title).toBe('Teaser v2')
    expect(reopened._rev).toBe(saved._rev)
    expect(reopened.scenes).toEqual([
      opened(edited[0]),
      opened(edited[1], HALL),
    ])
  })

  it('stores the track with its rights confirmation copied from the gallery', async () => {
    const track = {
      galleryAssetId: 'asset-theme',
      start: 12,
      volume: 0.8,
      fadeIn: 1,
      fadeOut: 2,
    }
    const created = await projects().create({
      title: 'With music',
      scenes: [scene('s')],
      track,
    })
    expect(doc(created._id)!.track).toEqual({
      file: {
        _type: 'file',
        asset: ref(THEME),
        galleryAsset: { ...ref('asset-theme'), _weak: true },
        createdByGallery: true,
      },
      title: 'Theme',
      rightsConfirmation: {
        confirmedBy: { ...ref('sp-1'), _weak: true },
        confirmedAt: '2026-09-20T10:00:00Z',
      },
      start: 12,
      volume: 0.8,
      fadeIn: 1,
      fadeOut: 2,
    })
    const project = await projects().open({ id: created._id })
    expect(project.track).toEqual({
      ...track,
      fileId: THEME,
      title: 'Theme',
      rights: { confirmedBy: 'sp-1', confirmedAt: '2026-09-20T10:00:00Z' },
    })
  })
})

describe('a save over a newer save', () => {
  it('is refused as a conflict, and the newer save stands', async () => {
    const created = await projects().create({
      title: 'Teaser',
      scenes: TWO_SCENES,
    })
    const mine = await projects().open({ id: created._id })
    const theirs = await projects().open({ id: created._id })
    await projects().save({
      id: created._id,
      rev: theirs._rev,
      title: 'Theirs',
      scenes: [scene('x')],
    })
    h.mutations = []

    await expect(
      projects().save({
        id: created._id,
        rev: mine._rev,
        title: 'Mine',
        scenes: [scene('y')],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('Someone saved'),
    })
    expect(doc(created._id)!.title).toBe('Theirs')
    // Refused on the revision it read, before any write was attempted.
    expect(h.mutations).toEqual([])
  })

  it('is refused when the other save lands between the read and the write', async () => {
    const created = await projects().create({
      title: 'Teaser',
      scenes: TWO_SCENES,
    })
    const mine = await projects().open({ id: created._id })
    h.beforeCommit = () => {
      h.beforeCommit = null
      const i = h.dataset.findIndex((d) => d._id === created._id)
      h.dataset[i] = { ...h.dataset[i], title: 'Theirs', _rev: 'rev-theirs' }
    }
    await expect(
      projects().save({
        id: created._id,
        rev: mine._rev,
        title: 'Mine',
        scenes: [scene('y')],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(doc(created._id)!.title).toBe('Theirs')
  })
})

describe('duplicate', () => {
  it('writes an independent copy with fresh keys and "Copy of" in the title', async () => {
    const created = await projects().create({
      title: 'Teaser',
      scenes: TWO_SCENES,
    })
    const { _id } = await projects().duplicate({ id: created._id })
    expect(_id).not.toBe(created._id)

    const source = doc(created._id)!
    const copy = doc(_id)!
    expect(copy.title).toBe('Copy of Teaser')
    const keys = (d: Doc) =>
      (d.scenes as Record<string, unknown>[]).flatMap((s) => [
        s._key,
        ...(s.textLines as { _key: string }[]).map((l) => l._key),
        ...(s.elements as { _key: string }[]).map((m) => m._key),
      ])
    const fresh = new Set(keys(copy))
    for (const key of keys(source)) expect(fresh.has(key)).toBe(false)

    // Editing the copy leaves the source as it was, and the other way round.
    const before = await projects().open({ id: created._id })
    const dup = await projects().open({ id: _id })
    expect(dup.scenes.map((s) => s.design)).toEqual(
      before.scenes.map((s) => s.design),
    )
    await projects().save({
      id: _id,
      rev: dup._rev,
      title: 'Variation',
      scenes: [scene('only', { name: 'hall', fileId: HALL })],
    })
    expect(await projects().open({ id: created._id })).toEqual(before)
    const afterCopyEdit = await projects().open({ id: _id })
    await projects().save({
      id: created._id,
      rev: before._rev,
      title: 'Changed',
      scenes: [scene('z')],
    })
    expect(await projects().open({ id: _id })).toEqual(afterCopyEdit)
  })
})

describe('the gallery asset behind a background', () => {
  it('can be deleted: the project opens intact, and the file is kept', async () => {
    const created = await projects().create({
      title: 'Teaser',
      scenes: TWO_SCENES,
    })
    const before = await projects().open({ id: created._id })

    await assets().delete({ id: 'asset-hall' })
    expect(doc('asset-hall')).toBeUndefined()
    expect(doc(HALL)).toBeDefined()

    const after = await projects().open({ id: created._id })
    expect(after).toEqual(before)
    // And it still saves, holding the file without the gallery.
    await projects().save({
      id: created._id,
      rev: after._rev,
      title: 'Still fine',
      scenes: after.scenes.map((s) => ({
        ...s,
        design: {
          ...s.design,
          background: {
            ...s.design.background,
            image: s.design.background.image && {
              name: s.design.background.image.name,
              fileId: s.design.background.image.fileId,
              galleryAssetId: s.design.background.image.galleryAssetId,
            },
          },
        },
      })),
    })
    expect(doc(created._id)!.title).toBe('Still fine')

    // Deleting the project then lets the orphan check take the file.
    await projects().delete({ id: created._id })
    expect(doc(created._id)).toBeUndefined()
    expect(doc(HALL)).toBeUndefined()
  })

  it('stays while the gallery still holds it when the project is deleted', async () => {
    const created = await projects().create({
      title: 'Teaser',
      scenes: TWO_SCENES,
    })
    await projects().delete({ id: created._id })
    expect(doc(HALL)).toBeDefined()
    expect(doc('asset-hall')).toBeDefined()
  })
})

describe('a file the project lets go of', () => {
  const withoutBackground = (id: string, rev: string) =>
    projects().save({ id, rev, title: 'Plain', scenes: [scene('only')] })

  it('is orphan-checked after the save: deleted once nothing holds it', async () => {
    const created = await projects().create({ title: 'T', scenes: TWO_SCENES })
    await assets().delete({ id: 'asset-hall' })
    expect(doc(HALL)).toBeDefined()
    const { _rev } = await projects().open({ id: created._id })
    await withoutBackground(created._id, _rev)
    expect(doc(HALL)).toBeUndefined()
  })

  it('is kept while the gallery still holds it', async () => {
    const created = await projects().create({ title: 'T', scenes: TWO_SCENES })
    await withoutBackground(created._id, created._rev)
    expect(doc(HALL)).toBeDefined()
  })

  it('keeps its subject when saved again from the file alone', async () => {
    const created = await projects().create({ title: 'T', scenes: TWO_SCENES })
    await assets().delete({ id: 'asset-hall' })
    await projects().save({
      id: created._id,
      rev: created._rev,
      title: 'Again',
      scenes: [scene('a', { name: 'hall', fileId: HALL })],
    })
    const image = (
      doc(created._id)!.scenes as { background: { image: unknown } }[]
    )[0].background.image
    expect(image).toMatchObject({ subject: { ...ref('sp-ada'), _weak: true } })
  })
})

describe('saving as a new project after a conflict', () => {
  it('may hold the files the open project holds, with no gallery asset', async () => {
    const created = await projects().create({ title: 'T', scenes: TWO_SCENES })
    await assets().delete({ id: 'asset-hall' })
    const held = [scene('a', { name: 'hall', fileId: HALL })]
    await expect(
      projects().create({ title: 'Copy', scenes: held }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    const copy = await projects().create({
      title: 'Copy',
      scenes: held,
      copyFilesFrom: created._id,
    })
    expect(copy.scenes).toEqual([{ key: 'a', fileId: HALL }])
  })

  it('cannot borrow another organization’s files: its id lends nothing, and it is never read', async () => {
    h.queries = []
    await expect(
      projects().create({
        title: 'Copy',
        scenes: [scene('a', { name: 'x', fileId: 'image-theirs-100x100-png' })],
        copyFilesFrom: 'vp-theirs',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining(
        "Scene 1's background is not in the gallery",
      ),
    })
    // The guard's read, then nothing of that project.
    expect(h.queries[0]).toContain('"memberOrgIds"')
    expect(h.queries.slice(1).some((q) => q.includes('videoProject'))).toBe(
      false,
    )
    expect(h.mutations).toEqual([])
  })

  it('still saves when the source was deleted after the conflict', async () => {
    const created = await projects().create({
      title: 'T',
      scenes: [scene('s')],
    })
    await projects().delete({ id: created._id })
    const copy = await projects().create({
      title: 'Rescued',
      scenes: [scene('s')],
      copyFilesFrom: created._id,
    })
    expect(doc(copy._id)!.title).toBe('Rescued')
  })

  it('keeps the source’s edition and track', async () => {
    const created = await projects().create({
      title: 'T',
      scenes: [scene('s')],
      edition: 'current',
      track: {
        galleryAssetId: 'asset-theme',
        start: 1,
        volume: 0.5,
        fadeIn: 0,
        fadeOut: 0,
      },
    })
    const copy = await projects().create({
      title: 'Rescued',
      scenes: [scene('s')],
      copyFilesFrom: created._id,
    })
    expect(doc(copy._id)).toMatchObject({
      scope: 'edition',
      conference: ref('conf-A'),
      track: doc(created._id)!.track,
    })
  })
})

describe("a copy of a project Studio pointed at another organization's edition", () => {
  it('is refused by the conference guard, on save-as-new and on duplicate', async () => {
    const created = await projects().create({
      title: 'T',
      scenes: [scene('s')],
    })
    const i = h.dataset.findIndex((d) => d._id === created._id)
    h.dataset[i] = {
      ...h.dataset[i],
      scope: 'edition',
      conference: ref('conf-B'),
    }
    h.mutations = []
    const refused = {
      code: 'NOT_FOUND',
      message: expect.stringContaining('conference'),
    }
    await expect(
      projects().create({
        title: 'C',
        scenes: [scene('s')],
        copyFilesFrom: created._id,
      }),
    ).rejects.toMatchObject(refused)
    await expect(
      projects().duplicate({ id: created._id }),
    ).rejects.toMatchObject(refused)
    expect(h.mutations).toEqual([])
  })
})

describe('a project with a Content Release copy', () => {
  it('is neither saved over nor deleted here', async () => {
    const created = await projects().create({ title: 'T', scenes: TWO_SCENES })
    h.dataset.push({
      ...doc(created._id)!,
      _id: `versions.rlaunch.${created._id}`,
    })
    h.mutations = []
    const inRelease = {
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('Content Release'),
    }
    await expect(
      projects().save({
        id: created._id,
        rev: created._rev,
        title: 'X',
        scenes: [scene('s')],
      }),
    ).rejects.toMatchObject(inRelease)
    await expect(projects().delete({ id: created._id })).rejects.toMatchObject(
      inRelease,
    )
    expect(h.mutations).toEqual([])
  })
})

describe('saving a background that was not kept', () => {
  it('is refused, naming the scenes, and nothing is written', async () => {
    const scenes = [
      scene('one'),
      scene('two', { name: 'photo.jpg' }),
      scene('three', { name: 'theirs', galleryAssetId: 'asset-theirs' }),
      scene('four', { name: 'nowhere', fileId: HALL }),
    ]
    await expect(
      projects().create({ title: 'T', scenes }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'The backgrounds of scenes 2, 3 and 4 are not in the gallery, so the project cannot be saved. Keep each in the gallery or choose one from it, then save.',
    })
    expect(h.mutations).toEqual([])
  })

  it('refuses a data URL as a gallery id or file id', async () => {
    await expect(
      projects().create({
        title: 'T',
        scenes: [
          scene('one', {
            name: 'x',
            galleryAssetId: 'data:image/png;base64,AAAA',
          }),
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.mutations).toEqual([])
  })
})

describe('another organization', () => {
  it('never sees its projects in the list', async () => {
    await projects().create({ title: 'Ours', scenes: [scene('s')] })
    const rows = await projects().list()
    expect(rows.map((r) => r.title)).toEqual(['Ours'])
  })

  const calls = {
    open: (id: string) => projects().open({ id }),
    save: (id: string) =>
      projects().save({
        id,
        rev: 'rev-b',
        title: 'Mine',
        scenes: [scene('s')],
      }),
    duplicate: (id: string) => projects().duplicate({ id }),
    delete: (id: string) => projects().delete({ id }),
  }
  for (const [name, call] of Object.entries(calls)) {
    it(`cannot ${name} one by id: the same answer as a nonexistent id, and nothing fetched`, async () => {
      const answer = async (id: string) => {
        h.queries = []
        const error = await call(id).then(
          () => null,
          (e: { code: string; message: string }) => ({
            code: e.code,
            message: e.message,
          }),
        )
        // The guard's by-id tenancy read is the only query that ran.
        expect(h.queries).toHaveLength(1)
        expect(h.queries[0]).toContain('"memberOrgIds"')
        return error
      }
      const foreign = await answer('vp-theirs')
      expect(foreign).toEqual({
        code: 'NOT_FOUND',
        message: 'No videoProject with that id for this request',
      })
      expect(await answer('vp-missing')).toEqual(foreign)
      expect(h.mutations).toEqual([])
      expect(doc('vp-theirs')).toMatchObject({
        title: 'Their video',
        _rev: 'rev-b',
      })
    })
  }

  it('cannot be written through a gallery id of its own', async () => {
    await expect(
      projects().create({
        title: 'T',
        scenes: [
          scene('s', { name: 'theirs', galleryAssetId: 'asset-theirs' }),
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('a project in another format version', () => {
  const store = (formatVersion: unknown) => {
    h.dataset.push({
      _id: 'vp-future',
      _type: 'videoProject',
      _rev: 'rev-f',
      organization: ref('org-A'),
      scope: 'organization',
      title: 'From the future',
      formatVersion,
      scenes: [{ _key: 's', duration: 3, transition: 'cut', hologram: true }],
    })
  }

  it('is refused on open, save and duplicate, with a clear message', async () => {
    store(2)
    const newer = {
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining(
        'saved by a newer version of the studio (format 2)',
      ),
    }
    await expect(projects().open({ id: 'vp-future' })).rejects.toMatchObject(
      newer,
    )
    await expect(
      projects().save({
        id: 'vp-future',
        rev: 'rev-f',
        title: 'Mine',
        scenes: [scene('s')],
      }),
    ).rejects.toMatchObject(newer)
    await expect(
      projects().duplicate({ id: 'vp-future' }),
    ).rejects.toMatchObject(newer)
    expect(h.mutations).toEqual([])
  })

  it('refuses a project with no version rather than guessing', async () => {
    store(undefined)
    await expect(projects().open({ id: 'vp-future' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message:
        'This project was saved in a format this studio cannot read, so it cannot be opened.',
    })
  })

  it('refuses a current-version project whose stored shape it cannot read', async () => {
    store(1)
    await expect(projects().open({ id: 'vp-future' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('cannot read'),
    })
  })
})

describe('every project read is scoped to the organization on its own', () => {
  // Behind the guard already; these prove the reads would not leak without it.
  it('finds nothing of another organization by id', async () => {
    h.dataset.push({
      ...doc('vp-theirs')!,
      _id: 'vp-theirs-full',
      scenes: [
        {
          _key: 's',
          background: {
            color: '#000',
            image: {
              _type: 'image',
              asset: ref('image-theirs-100x100-png'),
              createdByGallery: true,
            },
          },
        },
      ],
    })
    expect(await readVideoProject('org-A', 'vp-theirs-full')).toBeNull()
    expect(await readVideoProjectFiles('org-A', 'vp-theirs-full')).toBeNull()
    expect(await readVideoProjectDocument('org-A', 'vp-theirs-full')).toBeNull()
    expect(
      await readVideoProjectCreatedFiles('org-A', 'vp-theirs-full'),
    ).toEqual([])
    expect(
      await readGalleryFiles('org-A', ['asset-theirs', 'asset-hall']),
    ).toEqual([expect.objectContaining({ _id: 'asset-hall' })])
    expect(await listVideoProjects('org-A')).toEqual([])
    // And the same reads do find it for its own organization.
    expect(
      await readVideoProjectCreatedFiles('org-B', 'vp-theirs-full'),
    ).toEqual(['image-theirs-100x100-png'])
  })
})

/**
 * SURFACE TRIPWIRE, as in `tenancy.writes.test.ts`: a new mutation here must
 * decide whether it takes a client id and so needs the ownership guard.
 */
describe('the videoProject mutation surface is pinned', () => {
  it('has exactly create and the guarded save, duplicate and delete', () => {
    const procedures = (
      videoProjectRouter as unknown as {
        _def: { procedures: Record<string, { _def?: { type?: string } }> }
      }
    )._def.procedures
    const mutations = Object.entries(procedures)
      .filter(([, p]) => p._def?.type === 'mutation')
      .map(([path]) => path)
    // `create` takes no document id: the organization is the request host's.
    expect(mutations.sort()).toEqual(['create', 'delete', 'duplicate', 'save'])
  })
})
