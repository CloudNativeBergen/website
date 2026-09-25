/**
 * @vitest-environment node
 *
 * The marketing asset gallery through the tRPC caller (#1160). The tenancy
 * guard runs for REAL against a stubbed `clientReadUncached.fetch`, so another
 * organization's asset is refused BY THE GUARD, and the later reads and writes
 * are asserted never to have happened.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  read: vi.fn(),
  del: vi.fn(),
  orphan: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    transaction: () => {
      const ids: string[] = []
      const tx = {
        delete: (id: string) => (ids.push(id), tx),
        commit: () => h.del(ids),
      }
      return tx
    },
  },
  clientReadUncached: { fetch: h.read },
}))
vi.mock('@/lib/sanity/orphaned-asset', () => ({
  deleteImageAssetIfOrphaned: h.orphan,
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { marketingAssetRouter } from './marketingAsset'

const t = initTRPC.context<Context>().create()
function assets(organizerOrgIds: string[] = ['org-A']) {
  const speaker = { _id: 'sp-1', name: 'Ada', organizerOrgIds }
  const user = { email: 'a@example.com', name: 'Ada', picture: '' }
  return t.createCallerFactory(marketingAssetRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

/** Documents the stubbed dataset holds, by id. */
const DOCS: Record<string, { _type: string; orgId: string | null }> = {
  'asset-ours': { _type: 'marketingAsset', orgId: 'org-A' },
  'asset-theirs': { _type: 'marketingAsset', orgId: 'org-B' },
  'template-ours': { _type: 'planTemplate', orgId: 'org-A' },
}
const ROWS = [
  {
    _id: 'asset-ours',
    title: 'Logo',
    alt: 'The Cloud Native Days logo',
    kind: 'image',
    scope: 'organization',
    imageUrl: 'https://cdn.sanity.io/images/p/d/logo.png',
    assetId: 'image-logo-800x800-png',
    width: 800,
    height: 800,
    createdAt: '2026-09-25T10:00:00Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: { _id: 'conf-A', organization: { _ref: 'org-A' } },
    error: null,
  })
  h.read.mockImplementation(
    async (query: string, params: Record<string, string>) => {
      // The tenancy guard's by-id read.
      if (query.includes('"memberOrgIds"')) {
        const doc = DOCS[params.id]
        return doc ? { _type: doc._type, orgId: doc.orgId } : null
      }
      // The asset reads, which must be scoped to the caller's organization.
      if (params.orgId !== 'org-A') throw new Error('unscoped read')
      if (query.includes('_id in [$id, $draftId]'))
        return params.id === 'asset-ours'
          ? [
              'image-logo-800x800-png',
              'image-logo-800x800-png',
              'image-draft-1x1-png',
            ]
          : []
      return ROWS
    },
  )
  h.del.mockResolvedValue({})
  h.orphan.mockResolvedValue({
    id: 'image-logo-800x800-png',
    deleted: true,
    remainingReferences: 0,
  })
})

describe('marketingAsset.list', () => {
  it('lists this organization’s assets, read with the organization filter', async () => {
    const rows = await assets().list()
    expect(rows).toEqual([{ ...ROWS[0], softOnSocial: true }])
    const [query, params] = h.read.mock.calls[0]
    expect(query).toContain('organization._ref == $orgId')
    expect(query).toContain('_type == "marketingAsset"')
    // A Studio draft is not a second gallery entry.
    expect(query).toContain('!(_id in path("drafts.**"))')
    expect(params).toMatchObject({ orgId: 'org-A' })
  })

  it('flags nothing as soft when the short side is 1080 or more', async () => {
    h.read.mockResolvedValueOnce([{ ...ROWS[0], width: 1920, height: 1080 }])
    expect((await assets().list())[0].softOnSocial).toBe(false)
  })

  it('refuses a non-organizer before anything is read', async () => {
    await expect(assets(['org-B']).list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(h.read).not.toHaveBeenCalled()
  })
})

describe('marketingAsset.delete', () => {
  it('deletes our asset, then its image only through the orphan check', async () => {
    const result = await assets().delete({ id: 'asset-ours' })
    expect(result).toEqual({ deleted: true, imageDeleted: true })
    // Its Studio draft goes with it, in the same transaction.
    expect(h.del).toHaveBeenCalledWith(['asset-ours', 'drafts.asset-ours'])
    // The published image and the draft's own image, each once.
    expect(h.orphan.mock.calls).toEqual([
      ['image-logo-800x800-png'],
      ['image-draft-1x1-png'],
    ])
    // The document goes first: while it exists it is itself a reference.
    expect(h.del.mock.invocationCallOrder[0]).toBeLessThan(
      h.orphan.mock.invocationCallOrder[0],
    )
  })

  it('keeps an image something else still references, and says so', async () => {
    h.orphan.mockResolvedValue({
      id: 'image-logo-800x800-png',
      deleted: false,
      remainingReferences: 2,
    })
    expect(await assets().delete({ id: 'asset-ours' })).toEqual({
      deleted: true,
      imageDeleted: false,
    })
  })

  it('answers a foreign id exactly as a nonexistent one, and touches nothing', async () => {
    const foreign = await assets()
      .delete({ id: 'asset-theirs' })
      .catch((e) => e)
    const missing = await assets()
      .delete({ id: 'asset-nope' })
      .catch((e) => e)
    expect(foreign.code).toBe('NOT_FOUND')
    expect({ code: foreign.code, message: foreign.message }).toEqual({
      code: missing.code,
      message: missing.message,
    })
    expect(h.del).not.toHaveBeenCalled()
    expect(h.orphan).not.toHaveBeenCalled()
  })

  it('refuses a draft id with the same answer, and deletes nothing', async () => {
    const draft = await assets()
      .delete({ id: 'drafts.asset-ours' })
      .catch((e) => e)
    const missing = await assets()
      .delete({ id: 'asset-nope' })
      .catch((e) => e)
    expect({ code: draft.code, message: draft.message }).toEqual({
      code: missing.code,
      message: missing.message,
    })
    expect(h.del).not.toHaveBeenCalled()
  })

  it('refuses another type of our own organization', async () => {
    await expect(
      assets().delete({ id: 'template-ours' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(h.del).not.toHaveBeenCalled()
  })

  it('refuses a non-organizer before anything is read', async () => {
    await expect(
      assets(['org-B']).delete({ id: 'asset-ours' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.read).not.toHaveBeenCalled()
    expect(h.del).not.toHaveBeenCalled()
  })
})

/**
 * SURFACE TRIPWIRE, as in `tenancy.writes.test.ts`: a new mutation here must
 * decide whether it takes a client id and so needs the ownership guard.
 */
describe('the marketingAsset mutation surface is pinned', () => {
  it('has exactly one mutation, the guarded delete', () => {
    const procedures = (
      marketingAssetRouter as unknown as {
        _def: { procedures: Record<string, { _def?: { type?: string } }> }
      }
    )._def.procedures
    const mutations = Object.entries(procedures)
      .filter(([, p]) => p._def?.type === 'mutation')
      .map(([path]) => path)
    // Creating an asset is the move route, `/api/admin/marketing-assets`,
    // which resolves the organization itself and takes no document id.
    expect(mutations).toEqual(['delete'])
  })
})
