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
  moveVideo: vi.fn(),
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
  const remove = (id: string) => {
    h.dataset = h.dataset.filter((d) => d._id !== id)
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
      delete: async (id: string) => remove(id),
      transaction: () => {
        const tx = real.transaction()
        tx.commit = (async () => {
          for (const m of tx.serialize() as Record<string, Doc>[]) {
            if (!m.createOrReplace) throw new Error('unexpected mutation')
            remove(m.createOrReplace._id)
            h.dataset.push(structuredClone(m.createOrReplace))
          }
          return {}
        }) as typeof tx.commit
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
  resolveCurrentOrgId: async () => 'org-A',
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
  moveAudioBlobToSanity: vi.fn(),
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
    const doc = {
      _id: `asset-${h.dataset.length}`,
      _type: 'marketingAsset',
      poster: asset.posterAssetId
        ? { asset: { _type: 'reference', _ref: asset.posterAssetId } }
        : undefined,
      video: asset.fileAssetId
        ? { asset: { _type: 'reference', _ref: asset.fileAssetId } }
        : undefined,
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
    await sweepPendingCleanups(later)
    expect(exists(IMAGE_ID)).toBe(false)
  })

  it('waits longer than any move can take', () => {
    expect(PENDING_CLEANUP_DELAY_MS).toBeGreaterThan(maxDuration * 1000 * 2)
  })
})
