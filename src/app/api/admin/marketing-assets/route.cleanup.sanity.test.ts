/**
 * @vitest-environment node
 *
 * A failed upload's file in Sanity (#1167 review), asserted on the STORED
 * documents: the route's cleanup, the REAL pending-cleanup queue and the REAL
 * orphan check (#1159) run over an in-memory dataset — reads executed by
 * groq-js, writes serialized by the real `@sanity/client`. Only the move (which
 * Sanity asset an upload became) and the gallery write are stood in for, as
 * the two uploads' outcomes.
 *
 * Sanity deduplicates identical bytes into ONE asset, so two uploads of the
 * same file both see it created. The file must survive the one that fails
 * while the other is still moving, and still go once nothing references it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

type Doc = Record<string, unknown> & { _id: string }

const h = vi.hoisted(() => ({
  dataset: [] as (Record<string, unknown> & { _id: string })[],
  afterTasks: [] as (() => unknown)[],
  failCount: false,
  revs: 0,
  orgId: 'org-A',
  /** Runs once, just before the next transaction lands. */
  beforeCommit: null as null | (() => void),
  moveVideo: vi.fn(),
  moveAudio: vi.fn(),
  move: vi.fn(),
  create: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => h.afterTasks.push(task),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const real = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2025-02-19',
    useCdn: false,
  })
  const query = async (q: string, params: Record<string, unknown> = {}) =>
    (await evaluate(parse(q), { dataset: h.dataset, params })).get()
  const refsTo = (doc: unknown, id: string): boolean =>
    Array.isArray(doc)
      ? doc.some((v) => refsTo(v, id))
      : typeof doc === 'object' && doc !== null
        ? ((doc as Record<string, unknown>)._ref === id &&
            (doc as Record<string, unknown>)._weak !== true) ||
          Object.values(doc).some((v) => refsTo(v, id))
        : false
  const fail = (statusCode: number, message: string) =>
    Object.assign(new Error(message), { statusCode })
  /**
   * One transaction, atomically, under the rules a live probe of the
   * `development` dataset showed (#1243): a patch of a missing document is a
   * 404, a stale `ifRevisionID` a 409, a delete of a missing document a
   * no-op, a delete of a strongly referenced one a 409, and a strong
   * reference to a missing document is refused.
   */
  const commit = (mutations: Record<string, Record<string, unknown>>[]) => {
    const race = h.beforeCommit
    h.beforeCommit = null
    race?.()
    let next = structuredClone(h.dataset)
    for (const m of mutations) {
      if (m.createOrReplace) {
        const doc = structuredClone(m.createOrReplace) as Doc
        next = next.filter((d) => d._id !== doc._id)
        next.push({ ...doc, _rev: `rev-${++h.revs}` })
      } else if (m.delete) {
        const id = m.delete.id as string
        const holder = next.find((d) => d._id !== id && refsTo(d, id))
        if (holder) throw fail(409, `${id} is referenced by ${holder._id}`)
        next = next.filter((d) => d._id !== id)
      } else if (m.patch) {
        const i = next.findIndex((d) => d._id === m.patch.id)
        if (i < 0) throw fail(404, `${String(m.patch.id)} not found`)
        if (m.patch.ifRevisionID && m.patch.ifRevisionID !== next[i]._rev)
          throw fail(409, 'Revision mismatch')
        next[i] = {
          ...next[i],
          ...(m.patch.set as object),
          _rev: `rev-${++h.revs}`,
        }
      } else throw new Error('unexpected mutation')
    }
    h.dataset = next
    return {}
  }
  return {
    clientReadUncached: {
      withConfig: () => ({
        fetch: async (q: string, params: Record<string, unknown>) => {
          if (h.failCount) throw new Error('Sanity down')
          return query(q, params)
        },
      }),
      fetch: query,
    },
    clientWrite: {
      delete: async (id: string) => commit([{ delete: { id } }]),
      transaction: () => {
        const tx = real.transaction()
        tx.commit = (async () =>
          commit(
            tx.serialize() as Record<string, Record<string, unknown>>[],
          )) as unknown as typeof tx.commit
        return tx
      },
    },
  }
})
vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => ({ speaker: { _id: 'sp-1' } }),
}))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: async () => true,
  resolveCurrentOrgId: async () => h.orgId,
}))
vi.mock('@/lib/marketing-asset/guard', () => ({
  resolveAssetDetailsForCurrentOrg: async (details: object) => ({
    ...details,
    scope: 'organization',
  }),
}))
vi.mock('@/lib/marketing-asset/move', () => ({
  moveBlobToSanity: h.move,
  moveVideoBlobToSanity: h.moveVideo,
  moveAudioBlobToSanity: h.moveAudio,
  moveGifBlobToSanity: vi.fn(),
  discardBlob: vi.fn(),
}))
vi.mock('@/lib/marketing-asset/sanity', () => ({
  createMarketingAsset: h.create,
}))

import { POST, maxDuration } from './route'
import {
  PENDING_CLEANUP_DELAY_MS,
  sweepPendingCleanups,
} from '@/lib/marketing-asset/pending-cleanup'

const HOST = 'https://abc.public.blob.vercel-storage.com/marketing-asset/org-A'
const POSTER_ID = 'image-f00d-1280x720-png'
const IMAGE_ID = 'image-beef-800x600-png'

/** An upload landing in Sanity: the asset exists from now on, deduplicated. */
function stored(id: string) {
  if (!h.dataset.some((d) => d._id === id))
    h.dataset.push({
      _id: id,
      _type: id.startsWith('file-') ? 'sanity.fileAsset' : 'sanity.imageAsset',
    })
  return { _id: id, url: `https://cdn/${id}`, width: 1280, height: 720 }
}
const exists = (id: string) => h.dataset.some((d) => d._id === id)
const records = () =>
  h.dataset.filter((d) => d._type === 'marketingAssetCleanup')

async function post(body: object) {
  return POST(
    new Request('http://localhost/api/admin/marketing-assets', {
      method: 'POST',
      body: JSON.stringify({ title: 'Clip', alt: 'A clip', ...body }),
    }),
  )
}
async function runAfterTasks() {
  for (const task of h.afterTasks.splice(0)) await task()
}
const VIDEO_BODY = {
  kind: 'video',
  url: `${HOST}/1790000000000-clip-X1.mp4`,
  posterUrl: `${HOST}/1790000000001-clip-poster-X2.png`,
}

beforeEach(() => {
  vi.clearAllMocks()
  h.dataset = []
  h.afterTasks = []
  h.failCount = false
  h.orgId = 'org-A'
  h.beforeCommit = null
  // Both uploads of the same poster bytes see it created: Sanity dedupes.
  h.move.mockImplementation(async (url: string) => ({
    ok: true,
    asset: {
      ...stored(url.includes('poster') ? POSTER_ID : IMAGE_ID),
      created: true,
    },
  }))
  // The gallery entry, holding its files as references.
  h.create.mockImplementation(async (asset: Record<string, string>) => {
    // Sanity refuses a strong reference to a missing document (probed live).
    for (const id of [
      asset.posterAssetId,
      asset.fileAssetId,
      asset.imageAssetId,
    ])
      if (id && !exists(id)) throw new Error(`references non-existent ${id}`)
    const doc = {
      _id: `asset-${h.dataset.length}`,
      _type: 'marketingAsset',
      poster: asset.posterAssetId
        ? { asset: { _type: 'reference', _ref: asset.posterAssetId } }
        : undefined,
      video: asset.fileAssetId
        ? { asset: { _type: 'reference', _ref: asset.fileAssetId } }
        : undefined,
      audio: asset.kind === 'audio' ? true : undefined,
      image: asset.imageAssetId
        ? { asset: { _type: 'reference', _ref: asset.imageAssetId } }
        : undefined,
    }
    h.dataset.push(doc)
    return doc
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a failed upload never deletes a file another upload is still moving', () => {
  it('two uploads of the same poster, one failing: the survivor keeps its file', async () => {
    // Upload B: its poster and video land, its gallery write is still to come.
    let releaseB!: () => void
    const bWrites = new Promise<void>((resolve) => (releaseB = resolve))
    h.moveVideo.mockResolvedValueOnce({
      ok: true,
      asset: { ...stored('file-c1ip-mp4'), created: true },
    })
    const createNow = h.create.getMockImplementation()!
    h.create.mockImplementationOnce(async (asset) => {
      await bWrites
      return createNow(asset)
    })
    const b = post(VIDEO_BODY)

    // Upload A, the same poster bytes: its video fails to move.
    h.moveVideo.mockResolvedValueOnce({ ok: false, reason: 'upload' })
    const failedAt = Date.now()
    const a = await post(VIDEO_BODY)
    expect(a.status).toBe(502)
    await runAfterTasks()

    // Nothing references the poster yet, and still it stays: before the
    // delay, and at any sweep inside it.
    expect(exists(POSTER_ID)).toBe(true)
    for (const offset of [0, maxDuration * 1000, PENDING_CLEANUP_DELAY_MS - 1])
      await sweepPendingCleanups(failedAt + offset)
    expect(exists(POSTER_ID)).toBe(true)

    // B writes its entry; the sweep after the delay sees the reference.
    releaseB()
    expect((await b).status).toBe(200)
    const sweep = await sweepPendingCleanups(
      Date.now() + PENDING_CLEANUP_DELAY_MS + 1,
    )
    expect(exists(POSTER_ID)).toBe(true)
    expect(sweep).toEqual({ deleted: 0, kept: 1, retried: 0 })
    expect(records()).toEqual([])
  })
})

describe('a failed upload’s own file still goes, after the delay', () => {
  it('an image whose gallery write failed: deleted by the delayed sweep', async () => {
    h.create.mockRejectedValueOnce(new Error('write failed'))
    const response = await post({ url: `${HOST}/1790000000000-logo-X1.png` })
    expect(response.status).toBe(500)
    await runAfterTasks()
    expect(records().map((r) => r.assetId)).toEqual([IMAGE_ID])

    await sweepPendingCleanups(Date.now())
    expect(exists(IMAGE_ID)).toBe(true)

    const sweep = await sweepPendingCleanups(
      Date.now() + PENDING_CLEANUP_DELAY_MS + 1,
    )
    expect(exists(IMAGE_ID)).toBe(false)
    expect(sweep).toEqual({ deleted: 1, kept: 0, retried: 0 })
    expect(records()).toEqual([])
  })

  it('a video’s poster, when the video failed to move: deleted after the delay', async () => {
    h.moveVideo.mockResolvedValueOnce({ ok: false, reason: 'upload' })
    await post(VIDEO_BODY)
    await runAfterTasks()
    await sweepPendingCleanups(Date.now() + PENDING_CLEANUP_DELAY_MS + 1)
    expect(exists(POSTER_ID)).toBe(false)
  })

  it('keeps the record when the reference count fails, and deletes on the next run', async () => {
    h.create.mockRejectedValueOnce(new Error('write failed'))
    await post({ url: `${HOST}/1790000000000-logo-X1.png` })
    await runAfterTasks()
    const later = Date.now() + PENDING_CLEANUP_DELAY_MS + 1
    h.failCount = true
    expect(await sweepPendingCleanups(later)).toEqual({
      deleted: 0,
      kept: 0,
      retried: 1,
    })
    expect(exists(IMAGE_ID)).toBe(true)
    expect(records()).toHaveLength(1)
    h.failCount = false
    h.orgId = 'org-A'
    h.beforeCommit = null
    await sweepPendingCleanups(later)
    expect(exists(IMAGE_ID)).toBe(false)
  })

  it('waits longer than any move can take', () => {
    expect(PENDING_CLEANUP_DELAY_MS).toBeGreaterThan(maxDuration * 1000 * 2)
  })
})

describe('a later upload of a queued file’s bytes takes it off the queue (#1243 review)', () => {
  const queued = (assetId: string) =>
    h.dataset.push({
      _id: `marketingAssetCleanup.${assetId}`,
      _type: 'marketingAssetCleanup',
      assetId,
      // Long past the delay: the next sweep would act on it.
      recordedAt: new Date(
        Date.now() - 2 * PENDING_CLEANUP_DELAY_MS,
      ).toISOString(),
      _rev: 'rev-queued',
    })

  it('another organization’s video reusing a queued poster: the sweep during its MP4 stream keeps the poster, and the entry is written', async () => {
    stored(POSTER_ID)
    queued(POSTER_ID)
    h.orgId = 'org-B'
    // Sanity hands back the poster it already held: not created by this upload.
    h.move.mockResolvedValueOnce({
      ok: true,
      asset: { ...stored(POSTER_ID), created: false },
    })
    // The daily sweep runs while the MP4 streams, before any reference exists.
    h.moveVideo.mockImplementationOnce(async () => {
      await sweepPendingCleanups(Date.now())
      return { ok: true, asset: { ...stored('file-c1ip-mp4'), created: true } }
    })
    const response = await post(VIDEO_BODY)
    expect(response.status).toBe(200)
    expect(exists(POSTER_ID)).toBe(true)
    expect(
      h.dataset.some(
        (d) =>
          d._type === 'marketingAsset' &&
          (d.poster as { asset: { _ref: string } }).asset._ref === POSTER_ID,
      ),
    ).toBe(true)
    expect(records()).toEqual([])
  })

  it.each([
    ['an image', {}, () => h.move, IMAGE_ID],
    [
      'a track',
      { kind: 'audio', rightsConfirmed: true },
      () => h.moveAudio,
      'file-theme-mp3',
    ],
  ] as const)(
    '%s reusing a queued file: a sweep before the gallery write keeps it',
    async (_, body, move, id) => {
      stored(id)
      queued(id)
      move().mockResolvedValueOnce({
        ok: true,
        asset: {
          ...stored(id),
          created: false,
          mimeType: 'audio/mpeg',
          durationSeconds: 60,
        },
      })
      const createNow = h.create.getMockImplementation()!
      h.create.mockImplementationOnce(async (asset) => {
        await sweepPendingCleanups(Date.now())
        return createNow(asset)
      })
      const response = await post({
        url: `${HOST}/1790000000000-x-X1.png`,
        ...body,
      })
      expect(response.status).toBe(200)
      expect(exists(id)).toBe(true)
      expect(records()).toEqual([])
    },
  )

  it('an un-queue that fails never blocks the upload', async () => {
    stored(IMAGE_ID)
    queued(IMAGE_ID)
    h.move.mockResolvedValueOnce({
      ok: true,
      asset: { ...stored(IMAGE_ID), created: false },
    })
    h.beforeCommit = () => {
      throw new Error('Sanity down')
    }
    const response = await post({ url: `${HOST}/1790000000000-logo-X1.png` })
    expect(response.status).toBe(200)
    expect(records()).toHaveLength(1)
  })

  it('a sweep already past its read never deletes a file un-queued since', async () => {
    stored(POSTER_ID)
    queued(POSTER_ID)
    // The route's un-queue lands between the sweep's read and its delete.
    h.beforeCommit = () => {
      h.dataset = h.dataset.filter((d) => d._type !== 'marketingAssetCleanup')
    }
    const sweep = await sweepPendingCleanups(Date.now())
    expect(exists(POSTER_ID)).toBe(true)
    expect(sweep.deleted).toBe(0)
  })

  it('nor a file queued again since: the newer record waits its own delay', async () => {
    stored(POSTER_ID)
    queued(POSTER_ID)
    h.beforeCommit = () => {
      const record = h.dataset.find((d) => d._type === 'marketingAssetCleanup')!
      record.recordedAt = new Date().toISOString()
      record._rev = 'rev-requeued'
    }
    await sweepPendingCleanups(Date.now())
    expect(exists(POSTER_ID)).toBe(true)
    expect(records()).toHaveLength(1)
  })
})
