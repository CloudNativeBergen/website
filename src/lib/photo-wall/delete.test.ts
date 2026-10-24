/**
 * @vitest-environment node
 *
 * `deleteWallPost` (Photo Wall spec §12, §14) on the versioned in-memory
 * store: the patch is built by the REAL `@sanity/client` (`serialize()` is
 * what is stored in `commits`), `ifRevisionID` is enforced by the store (the
 * installed `@sanity/mutator` ignores it), the reference count's GROQ is
 * executed, and a delete of a strongly referenced document is refused as
 * Sanity refuses it. What a raw delete sends over the wire is pinned on the
 * real client in `src/lib/sanity/purge.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { isAssetHeld } from '@/lib/sanity/orphaned-asset'
import { deleteWallPost } from './delete'

type Doc = Record<string, unknown> & { _id: string }
/** The store's raw `mutate`, as `deleteWithHistory` calls it. */
interface Mutator {
  /** The delete is last; a guarded one leads with its guard patch. */
  mutate: (mutations: { delete: { id: string } }[]) => Promise<unknown>
}
const store = () => h.store!

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const P1 = 'wallPost-11111111-1111-4111-8111-111111111111'
const P2 = 'wallPost-22222222-2222-4222-8222-222222222222'
const ASSET = 'image-sha1-1600x1000-jpg'
const OTHER_ASSET = 'image-sha2-1600x1000-jpg'

const post = (id: string, fields: Record<string, unknown> = {}): Doc => ({
  _id: id,
  _type: 'wallPost',
  _rev: `rev-${id}`,
  conference: ref('conf-A'),
  status: 'approved',
  photo: { _type: 'image', asset: ref(ASSET) },
  caption: 'Keynote',
  name: 'Ada',
  deviceKey: 'device-1',
  submittedAt: '2026-10-26T07:30:00Z',
  ...fields,
})
const asset = (id = ASSET): Doc => ({
  _id: id,
  _type: 'sanity.imageAsset',
  _rev: `rev-${id}`,
})

const del = (postId = P1, deviceKey?: string) =>
  deleteWallPost({ conferenceId: 'conf-A', postId, deviceKey })

/** What each commit was, in order, by kind and id. */
/** The no-op patch that carries a delete's revision guard. */
const isGuard = (patch: { unset?: unknown }) =>
  JSON.stringify(patch.unset) === JSON.stringify(['_deleteGuard'])

const commitLog = () =>
  store().commits.map((c) =>
    c.map((m) =>
      'patch' in m
        ? isGuard(m.patch)
          ? `guard ${m.patch.id}`
          : `patch ${m.patch.id}`
        : 'delete' in m
          ? `delete ${m.delete.id}${m.delete.purge ? ' purge' : ''}`
          : Object.keys(m)[0],
    ),
  )

// A spy left behind by a failed test would wrap itself in the next one.
afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  store().reset([post(P1), asset()])
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('deleteWallPost (§12)', () => {
  it('marks the post deleting, then deletes the asset and the post, both with their history', async () => {
    await expect(del()).resolves.toEqual({
      status: 'deleted',
      deviceKey: 'device-1',
    })
    expect(commitLog()).toEqual([
      [`patch ${P1}`],
      [`delete ${ASSET} purge`],
      [`guard ${P1}`, `delete ${P1} purge`],
    ])
    expect(store().doc(P1)).toBeUndefined()
    expect(store().doc(ASSET)).toBeUndefined()
  })

  it('step 1 is ONE patch guarded by the revision it read: deleting, photo unset, the asset id kept', async () => {
    // Look at step 1 alone: every write after it is refused.
    store().afterNextCommit(() => store().failWrites())
    await del()
    expect(store().commits[0]).toEqual([
      {
        patch: {
          id: P1,
          ifRevisionID: `rev-${P1}`,
          set: { status: 'deleting', deletingAssetId: ASSET },
          unset: ['photo'],
        },
      },
    ])
    expect(store().doc(P1)).toMatchObject({
      status: 'deleting',
      deletingAssetId: ASSET,
    })
    expect(store().doc(P1)).not.toHaveProperty('photo')
  })

  it.each(['pending', 'approved', 'notShown'])(
    'accepts a %s post',
    async (status) => {
      store().reset([post(P1, { status }), asset()])
      await expect(del()).resolves.toMatchObject({ status: 'deleted' })
      expect(store().doc(P1)).toBeUndefined()
    },
  )

  it("is gone, writing nothing, for another conference's post", async () => {
    // Its id, device and asset are this wall's; only the conference differs.
    store().reset([post(P1, { conference: ref('conf-B') }), asset()])
    await expect(del()).resolves.toEqual({ status: 'gone' })
    expect(store().commits).toEqual([])
    expect(store().doc(P1)).toBeDefined()
    expect(store().doc(ASSET)).toBeDefined()
  })

  it('is gone, writing nothing, for a document of another type at the id', async () => {
    store().reset([post(P1, { _type: 'feedbackResponse' }), asset()])
    await expect(del()).resolves.toEqual({ status: 'gone' })
    expect(store().commits).toEqual([])
  })

  it('is gone, reading nothing, for an id that is not a Wall Post id (no comma list)', async () => {
    await expect(del(`${P1},${P2}`)).resolves.toEqual({ status: 'gone' })
    await expect(del(`drafts.${P1}`)).resolves.toEqual({ status: 'gone' })
    expect(store().docReads).toEqual([])
    expect(store().commits).toEqual([])
  })

  it("with a device key, is gone, writing nothing, for another device's post (M6)", async () => {
    await expect(del(P1, 'device-2')).resolves.toEqual({ status: 'gone' })
    expect(store().commits).toEqual([])
    await expect(del(P1, 'device-1')).resolves.toMatchObject({
      status: 'deleted',
    })
  })

  it('keeps an asset another post of the wall shares, and deletes it with the last one', async () => {
    store().reset([post(P1), post(P2), asset()])
    const mutate = vi.spyOn(clientWrite as unknown as Mutator, 'mutate')
    await expect(del(P1)).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(P1)).toBeUndefined()
    expect(store().doc(ASSET)).toBeDefined()
    // Not even tried: the count kept it, not Sanity's refusal.
    expect(mutate.mock.calls.map(([m]) => m[m.length - 1].delete.id)).toEqual([
      P1,
    ])
    mutate.mockRestore()
    expect(store().doc(P2)).toMatchObject({ photo: { asset: ref(ASSET) } })

    await expect(del(P2)).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(ASSET)).toBeUndefined()
  })

  it("keeps an asset another TENANT's document holds (a sponsor logo of the same bytes)", async () => {
    store().reset([
      post(P1),
      asset(),
      {
        _id: 'sponsor-x',
        _type: 'sponsor',
        _rev: 'r',
        conference: ref('conf-B'),
        logo: { _type: 'image', asset: ref(ASSET) },
      },
    ])
    const mutate = vi.spyOn(clientWrite as unknown as Mutator, 'mutate')
    await expect(del()).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(P1)).toBeUndefined()
    expect(store().doc(ASSET)).toBeDefined()
    expect(mutate.mock.calls.map(([m]) => m[m.length - 1].delete.id)).toEqual([
      P1,
    ])
    mutate.mockRestore()
  })

  it('counts a reference that appears after the count as done: Sanity refuses the delete', async () => {
    // Another document takes the asset between the count and the delete:
    // just before the second commit (the asset's delete), after step 1.
    store().beforeNextCommit(() => {})
    store().beforeNextCommit(() =>
      store().put({
        _id: 'gallery-1',
        _type: 'galleryImage',
        _rev: 'r',
        image: { asset: ref(ASSET) },
      }),
    )
    await expect(del()).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(ASSET)).toBeDefined()
    expect(store().doc(P1)).toBeUndefined()
    // Done because the count after the refusal finds the reference.
    expect(
      store().reads.filter((r) => r.query.includes('references(')),
    ).toHaveLength(2)
  })

  describe('a 409 that is not a reference (transaction contention)', () => {
    const contended = () =>
      Object.assign(new Error('409: contention'), { statusCode: 409 })
    const refuseAsset = (times: number) => {
      const writer = clientWrite as unknown as Mutator
      const real = writer.mutate
      let left = times
      return vi.spyOn(writer, 'mutate').mockImplementation(async (m) => {
        if (m[m.length - 1].delete.id === ASSET && left-- > 0) throw contended()
        return real(m)
      })
    }

    it('twice on an unreferenced asset: the post is NOT deleted, it stays deleting with the asset id', async () => {
      const mutate = refuseAsset(2)
      await expect(del()).resolves.toEqual({
        status: 'failed',
        deviceKey: 'device-1',
        marked: true,
      })
      expect(store().doc(P1)).toMatchObject({
        status: 'deleting',
        deletingAssetId: ASSET,
      })
      expect(store().doc(ASSET)).toBeDefined()
      expect(mutate.mock.calls.map(([m]) => m[m.length - 1].delete.id)).toEqual(
        [ASSET, ASSET],
      )
      mutate.mockRestore()
    })

    it('once: the retry deletes the asset, then the post', async () => {
      const mutate = refuseAsset(1)
      await expect(del()).resolves.toMatchObject({ status: 'deleted' })
      expect(store().doc(ASSET)).toBeUndefined()
      expect(store().doc(P1)).toBeUndefined()
      mutate.mockRestore()
    })
  })

  it('a mark that committed but whose answer was lost: Try again does not count the post itself, while the query view still shows its reference', async () => {
    const before = post(P1)
    // Step 1 commits, then the request fails: the caller sees an error.
    store().afterNextCommit(() => {
      throw new Error('socket hang up')
    })
    await expect(del()).rejects.toThrow('socket hang up')
    expect(store().doc(P1)).toMatchObject({
      status: 'deleting',
      deletingAssetId: ASSET,
    })
    // Queries lag the document store: they still see the old photo.
    store().readsLagFor(P1, before)
    await expect(del()).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(ASSET)).toBeUndefined()
    expect(store().doc(P1)).toBeUndefined()
  })

  it("'held' leaves out the post itself, its draft and its release versions, never another document's", async () => {
    const holding = (id: string, type = 'wallPost') => ({
      _id: id,
      _type: type,
      _rev: 'r',
      photo: { _type: 'image', asset: ref(ASSET) },
    })
    store().reset([
      holding(P1),
      holding(`drafts.${P1}`),
      holding(`versions.rABC.${P1}`),
      asset(),
    ])
    // Executed GROQ (groq-js) at the count's API version, raw perspective.
    await expect(isAssetHeld(ASSET, { except: P1 })).resolves.toBe(false)
    for (const other of [
      `drafts.${P2}`,
      `versions.rABC.${P2}`,
      // An id that merely ends like the post's.
      `x${P1}`,
    ]) {
      store().reset([holding(P1), holding(other, 'sponsor'), asset()])
      await expect(isAssetHeld(ASSET, { except: P1 })).resolves.toBe(true)
    }
  })

  it("'held' is checked on the latest documents: a holder the query view still shows, gone since, does not hold", async () => {
    store().reset([post(P1), asset()])
    store().readsLagFor(P2, post(P2))
    await expect(isAssetHeld(ASSET, { except: P1 })).resolves.toBe(false)
    // …and one that still references it does.
    store().reset([post(P1), post(P2), asset()])
    await expect(isAssetHeld(ASSET, { except: P1 })).resolves.toBe(true)
  })

  it('two posts sharing an asset, both marks committed with their answers lost: the retries delete the asset and both posts', async () => {
    store().reset([post(P1), post(P2), asset()])
    const before = [post(P1), post(P2)]
    for (const id of [P1, P2]) {
      store().afterNextCommit(() => {
        throw new Error('socket hang up')
      })
      await expect(del(id)).rejects.toThrow('socket hang up')
    }
    expect(store().doc(P1)).toMatchObject({ status: 'deleting' })
    expect(store().doc(P2)).toMatchObject({ status: 'deleting' })
    // The query view still shows both photos.
    for (const doc of before) store().readsLagFor(doc._id, doc)
    const results = await Promise.all([del(P1), del(P2)])
    expect(results).toEqual([
      expect.objectContaining({ status: 'deleted' }),
      expect.objectContaining({ status: 'deleted' }),
    ])
    expect(store().doc(ASSET)).toBeUndefined()
    expect(store().doc(P1)).toBeUndefined()
    expect(store().doc(P2)).toBeUndefined()
  })

  it("when 'held' can't be told (a holder's read fails), the post stays deleting", async () => {
    store().reset([post(P1), post(P2), asset()])
    const reader = clientReadUncached as unknown as {
      withConfig: (config: { apiVersion: string }) => Record<string, unknown>
    }
    const real = reader.withConfig
    vi.spyOn(reader, 'withConfig').mockImplementation((config) => ({
      ...real(config),
      getDocument: async () => {
        throw new Error('503')
      },
    }))
    const mutate = vi.spyOn(clientWrite as unknown as Mutator, 'mutate')
    await expect(del()).resolves.toMatchObject({
      status: 'failed',
      marked: true,
    })
    expect(store().doc(P1)).toMatchObject({
      status: 'deleting',
      deletingAssetId: ASSET,
    })
    expect(store().doc(ASSET)).toBeDefined()
    // Not even tried: "can't tell" is not "not held".
    expect(mutate).not.toHaveBeenCalled()
  })

  it('step 3 is ONE transaction: a guard patch with the revision marked deleting, then the delete', async () => {
    let marked = ''
    store().afterNextCommit(() => {
      marked = String(store().doc(P1)?._rev)
    })
    await expect(del()).resolves.toMatchObject({ status: 'deleted' })
    expect(store().commits[2]).toEqual([
      {
        patch: { id: P1, ifRevisionID: marked, unset: ['_deleteGuard'] },
      },
      { delete: { id: P1, purge: true } },
    ])
  })

  /** A post a submit created anew under the id, after a Delete (§6.2). */
  const replacement = (): Doc =>
    post(P1, {
      _rev: 'rev-replacement',
      _createdAt: '2026-10-26T09:30:00Z',
      status: 'pending',
      photo: { _type: 'image', asset: ref(OTHER_ASSET) },
      caption: 'Someone else',
    })

  it('a second Delete that read the post before the first finished never deletes a replacement created since', async () => {
    store().reset([
      post(P1, {
        status: 'deleting',
        photo: undefined,
        deletingAssetId: ASSET,
      }),
      asset(),
    ])
    // The second Delete has read the post; before its first write, the first
    // Delete finishes and a submit creates a new post under the id.
    store().beforeNextCommit(async () => {
      await expect(del()).resolves.toMatchObject({ status: 'deleted' })
      store().put(replacement())
      store().put(asset(OTHER_ASSET))
    })
    await expect(del()).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(P1)).toMatchObject({
      _rev: 'rev-replacement',
      caption: 'Someone else',
      photo: { asset: ref(OTHER_ASSET) },
    })
    expect(store().doc(OTHER_ASSET)).toBeDefined()
  })

  it('a mark retry finds a replacement: it is gone, and the replacement is not touched', async () => {
    store().beforeNextCommit(async () => {
      store().remove(P1)
      store().put(replacement())
    })
    await expect(del()).resolves.toEqual({ status: 'gone' })
    expect(store().doc(P1)).toMatchObject({
      _rev: 'rev-replacement',
      status: 'pending',
      photo: { asset: ref(OTHER_ASSET) },
    })
    expect(store().commits).toEqual([])
  })

  it('a replacement with the same creation time is still told apart by its photo', async () => {
    store().beforeNextCommit(async () => {
      store().remove(P1)
      // No `_createdAt` on either: only the photo differs.
      store().put({ ...replacement(), _createdAt: undefined })
    })
    await expect(del()).resolves.toEqual({ status: 'gone' })
    expect(store().doc(P1)).toMatchObject({ _rev: 'rev-replacement' })
  })

  it('a STALE card: a replacement under the id before the first read is gone, untouched', async () => {
    store().reset([replacement(), asset(OTHER_ASSET)])
    await expect(
      deleteWallPost({
        conferenceId: 'conf-A',
        postId: P1,
        shown: { createdAt: null, assetId: ASSET },
      }),
    ).resolves.toEqual({ status: 'gone' })
    expect(store().commits).toEqual([])
    expect(store().doc(P1)).toMatchObject({ _rev: 'rev-replacement' })
  })

  it('the guarded delete refused with a 400 (not a revision conflict): the post stays deleting, failed, and Try again can finish it', async () => {
    // The REAL client, against Sanity answering 400 at the HTTP layer.
    const { createClient } = await import('@sanity/client')
    const { http, HttpResponse } = await import('msw')
    const { server } = await import('../../../__tests__/mocks/msw/server')
    const sent: unknown[] = []
    server.use(
      http.post(
        'https://real400.api.sanity.io/v2023-05-03/data/mutate/test',
        async ({ request }) => {
          sent.push(await request.json())
          return HttpResponse.json(
            { error: { description: 'refused (400)' } },
            { status: 400 },
          )
        },
      ),
    )
    const real = createClient({
      projectId: 'real400',
      dataset: 'test',
      apiVersion: '2023-05-03',
      useCdn: false,
      token: 't',
    })
    const writer = clientWrite as unknown as Mutator
    const stored = writer.mutate
    vi.spyOn(writer, 'mutate').mockImplementation(async (m) =>
      m[m.length - 1].delete.id === P1 ? real.mutate(m as never) : stored(m),
    )
    await expect(del()).resolves.toEqual({
      status: 'failed',
      deviceKey: 'device-1',
      marked: true,
    })
    expect(sent).toEqual([
      {
        mutations: [
          {
            patch: {
              id: P1,
              ifRevisionID: expect.any(String),
              unset: ['_deleteGuard'],
            },
          },
          { delete: { id: P1, purge: true } },
        ],
      },
    ])
    expect(store().doc(P1)).toMatchObject({
      status: 'deleting',
      deletingAssetId: ASSET,
    })
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(del()).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(P1)).toBeUndefined()
  })

  it('deletes a post without a photo, with no asset step', async () => {
    store().reset([post(P1, { photo: undefined })])
    await expect(del()).resolves.toMatchObject({ status: 'deleted' })
    expect(commitLog()).toEqual([
      [`patch ${P1}`],
      [`guard ${P1}`, `delete ${P1} purge`],
    ])
  })

  describe('a failed asset delete (§12, §14)', () => {
    const failCounts = (times: number) => {
      let left = times
      store().failReadsThat(
        (read) => read.query.includes('references($assetId)') && left-- > 0,
      )
    }

    it('retries once, and a second failure leaves the post deleting with the asset id', async () => {
      failCounts(2)
      await expect(del()).resolves.toEqual({
        status: 'failed',
        deviceKey: 'device-1',
        marked: true,
      })
      // Two attempts, and the count that decides the second failure.
      expect(
        store().reads.filter((r) => r.query.includes('references(')),
      ).toHaveLength(3)
      expect(store().doc(P1)).toMatchObject({
        status: 'deleting',
        deletingAssetId: ASSET,
      })
      expect(store().doc(ASSET)).toBeDefined()
    })

    it('one failure is retried and the delete finishes', async () => {
      failCounts(1)
      await expect(del()).resolves.toMatchObject({ status: 'deleted' })
      expect(store().doc(ASSET)).toBeUndefined()
      expect(store().doc(P1)).toBeUndefined()
    })

    it('a refused asset delete is retried once too', async () => {
      const refused = Object.assign(new Error('503'), { statusCode: 503 })
      const mutate = vi
        .spyOn(clientWrite as unknown as Mutator, 'mutate')
        .mockRejectedValueOnce(refused)
        .mockRejectedValueOnce(refused)
      await expect(del()).resolves.toMatchObject({
        status: 'failed',
        marked: true,
      })
      expect(mutate).toHaveBeenCalledTimes(2)
      mutate.mockRestore()
    })

    it('Try again resumes from deletingAssetId and finishes it', async () => {
      failCounts(2)
      await del()
      const commitsAfterFirst = store().commits.length
      await expect(del()).resolves.toEqual({
        status: 'deleted',
        deviceKey: 'device-1',
      })
      // No second step 1: the post was already deleting.
      expect(commitLog().slice(commitsAfterFirst)).toEqual([
        [`delete ${ASSET} purge`],
        [`guard ${P1}`, `delete ${P1} purge`],
      ])
      expect(store().doc(ASSET)).toBeUndefined()
      expect(store().doc(P1)).toBeUndefined()
    })

    it('Try again on a deleting post whose asset is already gone finishes the post', async () => {
      store().reset([
        post(P1, {
          status: 'deleting',
          photo: undefined,
          deletingAssetId: OTHER_ASSET,
        }),
      ])
      await expect(del()).resolves.toMatchObject({ status: 'deleted' })
      expect(store().doc(P1)).toBeUndefined()
    })
  })

  it('a failed document delete leaves it deleting, and Try again finishes it', async () => {
    const writer = clientWrite as unknown as Mutator
    const real = writer.mutate
    let refused = false
    const mutate = vi
      .spyOn(writer, 'mutate')
      .mockImplementation(async (mutations) => {
        if (!refused && mutations[mutations.length - 1].delete.id === P1) {
          refused = true
          throw Object.assign(new Error('503'), { statusCode: 503 })
        }
        return real(mutations)
      })
    await expect(del()).resolves.toMatchObject({
      status: 'failed',
      marked: true,
    })
    expect(store().doc(P1)).toMatchObject({ status: 'deleting' })
    expect(store().doc(ASSET)).toBeUndefined()
    await expect(del()).resolves.toMatchObject({ status: 'deleted' })
    expect(store().doc(P1)).toBeUndefined()
    mutate.mockRestore()
  })

  describe('revision conflicts on step 1', () => {
    it('re-reads once and retries: a marketing untick in between does not stop it', async () => {
      store().beforeNextCommit(() =>
        store().put({
          ...store().doc(P1)!,
          marketingConsent: false,
          _rev: 'rev-untick',
        }),
      )
      await expect(del()).resolves.toMatchObject({ status: 'deleted' })
      expect(store().commits[0]).toEqual([
        expect.objectContaining({
          patch: expect.objectContaining({ ifRevisionID: 'rev-untick' }),
        }),
      ])
    })

    it('accepts whatever status the re-read finds: an approval in between is deleted too', async () => {
      store().reset([post(P1, { status: 'pending' }), asset()])
      store().beforeNextCommit(() =>
        store().put({
          ...store().doc(P1)!,
          status: 'approved',
          _rev: 'rev-approved',
        }),
      )
      await expect(del()).resolves.toMatchObject({ status: 'deleted' })
      expect(store().doc(P1)).toBeUndefined()
    })

    it('a second conflict writes nothing and reports it unmarked', async () => {
      const bump = (rev: string) => () =>
        store().put({ ...store().doc(P1)!, _rev: rev })
      store().beforeNextCommit(bump('rev-a'))
      store().beforeNextCommit(bump('rev-b'))
      await expect(del()).resolves.toEqual({
        status: 'failed',
        deviceKey: 'device-1',
        marked: false,
      })
      expect(store().commits).toEqual([])
      expect(store().doc(P1)).toMatchObject({ status: 'approved' })
    })

    it('is gone when another Delete finished in between', async () => {
      store().beforeNextCommit(() => store().remove(P1))
      await expect(del()).resolves.toEqual({ status: 'gone' })
      expect(store().commits).toEqual([])
    })
  })
})
