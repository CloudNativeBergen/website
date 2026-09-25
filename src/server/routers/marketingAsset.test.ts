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
  createdImageAssetId: 'image-logo-800x800-png' as string | undefined,
  releaseTwins: 0,
  versionedConfig: undefined as unknown,
  patches: [] as { id: string; set: unknown; unset: string[] }[],
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: (id: string) => {
      const op = { id, set: {} as unknown, unset: [] as string[] }
      const p = {
        set: (fields: unknown) => ((op.set = fields), p),
        unset: (paths: string[]) => (op.unset.push(...paths), p),
        commit: async () => (h.patches.push(op), { _id: id }),
      }
      return p
    },
    transaction: () => {
      const ids: string[] = []
      const tx = {
        delete: (id: string) => (ids.push(id), tx),
        commit: () => h.del(ids),
      }
      return tx
    },
  },
  clientReadUncached: {
    fetch: h.read,
    // The Content Release twin count reads at a version whose `raw` sees them.
    withConfig: (config: unknown) => {
      h.versionedConfig = config
      return { fetch: h.read }
    },
  },
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
const DOCS: Record<
  string,
  {
    _type: string
    orgId: string | null
    conferenceOrgId?: string
    memberOrgIds?: string[]
  }
> = {
  'asset-ours': { _type: 'marketingAsset', orgId: 'org-A' },
  // A Studio draft of ours: same type, same organization, so the tenancy
  // guard alone would let it through.
  'drafts.asset-ours': { _type: 'marketingAsset', orgId: 'org-A' },
  'asset-theirs': { _type: 'marketingAsset', orgId: 'org-B' },
  'template-ours': { _type: 'planTemplate', orgId: 'org-A' },
  'conf-A': { _type: 'conference', orgId: 'org-A' },
  'conf-A-2025': { _type: 'conference', orgId: 'org-A' },
  'conf-B': { _type: 'conference', orgId: 'org-B' },
  'drafts.conf-A': { _type: 'conference', orgId: 'org-A' },
  // Speakers are shared across tenants: standing is membership or a talk.
  'sp-member': { _type: 'speaker', orgId: null, memberOrgIds: ['org-A'] },
  'sp-talk-here': { _type: 'speaker', orgId: null, memberOrgIds: [] },
  'sp-theirs': { _type: 'speaker', orgId: null, memberOrgIds: ['org-B'] },
  'talk-ours': { _type: 'talk', orgId: null, conferenceOrgId: 'org-A' },
  'talk-theirs': { _type: 'talk', orgId: null, conferenceOrgId: 'org-B' },
  'sponsor-ours': { _type: 'sponsor', orgId: 'org-A' },
  'sponsor-theirs': { _type: 'sponsor', orgId: 'org-B' },
}
/** The organizations each speaker has a talk at (participation). */
const TALKS_AT: Record<string, string[]> = {
  'sp-talk-here': ['org-A'],
  'sp-theirs': ['org-B'],
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
  h.createdImageAssetId = 'image-logo-800x800-png'
  h.releaseTwins = 0
  h.versionedConfig = undefined
  h.patches = []
  h.getConference.mockResolvedValue({
    conference: { _id: 'conf-A', organization: { _ref: 'org-A' } },
    error: null,
  })
  h.read.mockImplementation(
    async (query: string, params: Record<string, string>) => {
      // The tenancy guard's by-id read.
      if (query.includes('"memberOrgIds"')) {
        const doc = DOCS[params.id]
        return doc
          ? {
              _type: doc._type,
              orgId: doc.orgId,
              conferenceOrgId: doc.conferenceOrgId ?? null,
              memberOrgIds: doc.memberOrgIds ?? [],
            }
          : null
      }
      // The speaker guard's participation probe.
      if (query.includes('references($speakerId)'))
        return TALKS_AT[params.speakerId] ?? []
      // The asset reads, which must be scoped to the caller's organization.
      if (params.orgId !== 'org-A') throw new Error('unscoped read')
      if (query.includes('path("versions.*." + $id)'))
        return { n: params.id === 'asset-ours' ? h.releaseTwins : 0 }
      if (query.includes('"createdImageAssetId"'))
        return params.id === 'asset-ours'
          ? {
              assetId: 'image-logo-800x800-png',
              createdImageAssetId: h.createdImageAssetId,
            }
          : null
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
    // Published documents only: a Studio draft (`drafts.x`) or a Content
    // Release version (`versions.r.x`) is not a second gallery entry.
    expect(query).toContain('_id in path("*")')
    // This edition, resolved from the request host, never from the client.
    expect(params).toMatchObject({ orgId: 'org-A', conferenceId: 'conf-A' })
  })

  it('passes the filters through to the read', async () => {
    await assets().list({
      editions: 'all',
      subjectId: 'sp-member',
      tag: 'Brand',
      search: 'logo dark',
    })
    const [, params] = h.read.mock.calls[0]
    expect(params).toMatchObject({
      allEditions: true,
      subjectId: 'sp-member',
      tag: 'brand',
      terms: ['logo*', 'dark*'],
    })
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
    // Whether the image went says whether ANY tenant holds those bytes, so
    // the answer does not include it.
    expect(result).toEqual({ deleted: true })
    // Its Studio draft goes with it, in the same transaction.
    expect(h.del).toHaveBeenCalledWith(['asset-ours', 'drafts.asset-ours'])
    expect(h.orphan.mock.calls).toEqual([['image-logo-800x800-png']])
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

  it('logs an image the orphan check could not decide on, so it can be retried', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.orphan.mockResolvedValue({
      id: 'image-logo-800x800-png',
      deleted: false,
      remainingReferences: -1,
    })
    expect(await assets().delete({ id: 'asset-ours' })).toEqual({
      deleted: true,
    })
    expect(String(warn.mock.calls[0]?.[0])).toContain('image-logo-800x800-png')
  })

  it.each([
    ['an image Sanity already held when it was uploaded', undefined],
    [
      'an image swapped in later (Studio), not the one the upload created',
      'image-created-then-replaced-1x1-png',
    ],
  ])("never deletes %s: it may be another tenant's", async (_, created) => {
    h.createdImageAssetId = created
    expect(await assets().delete({ id: 'asset-ours' })).toEqual({
      deleted: true,
    })
    expect(h.del).toHaveBeenCalled()
    expect(h.orphan).not.toHaveBeenCalled()
  })

  it('refuses to delete an asset staged in a Content Release, and touches nothing', async () => {
    h.releaseTwins = 1
    await expect(assets().delete({ id: 'asset-ours' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('Content Release'),
    })
    expect(h.del).not.toHaveBeenCalled()
    expect(h.orphan).not.toHaveBeenCalled()
    // Counted where release versions are visible.
    expect(h.versionedConfig).toEqual({
      apiVersion: '2025-02-19',
      perspective: 'raw',
    })
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

  it('refuses a Content Release version id the same way', async () => {
    DOCS['versions.r1.asset-ours'] = { _type: 'marketingAsset', orgId: 'org-A' }
    const version = await assets()
      .delete({ id: 'versions.r1.asset-ours' })
      .catch((e) => e)
    delete DOCS['versions.r1.asset-ours']
    expect(version.code).toBe('NOT_FOUND')
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

const DETAILS = {
  title: '  Speaker card  ',
  alt: 'Ada on stage',
  scope: 'organization' as const,
  tags: ['Speaker Card', 'speaker card', ' keynote '],
}

describe('marketingAsset.update', () => {
  it('writes the details to our asset, tags trimmed, lower-cased and once each', async () => {
    const result = await assets().update({
      id: 'asset-ours',
      details: {
        ...DETAILS,
        subject: { type: 'speaker', id: 'sp-member' },
        credit: ' Jane Designer ',
      },
    })
    expect(result).toEqual({ updated: true })
    expect(h.patches).toEqual([
      {
        id: 'asset-ours',
        set: {
          title: 'Speaker card',
          alt: 'Ada on stage',
          scope: 'organization',
          tags: ['speaker card', 'keynote'],
          subject: { _type: 'reference', _ref: 'sp-member', _weak: true },
          credit: 'Jane Designer',
        },
        // Organization-wide: no edition mark survives.
        unset: ['conference'],
      },
    ])
  })

  it('clears the subject and the credit when they are taken away', async () => {
    await assets().update({ id: 'asset-ours', details: DETAILS })
    expect(h.patches[0].unset).toEqual(['conference', 'subject', 'credit'])
  })

  it('marks our asset with an edition of THIS organization', async () => {
    await assets().update({
      id: 'asset-ours',
      details: { ...DETAILS, scope: 'edition', conferenceId: 'conf-A-2025' },
    })
    expect(h.patches[0].set).toMatchObject({
      scope: 'edition',
      conference: { _type: 'reference', _ref: 'conf-A-2025' },
    })
  })

  // Each refusal is paired with the same request naming OUR document, which
  // succeeds: nothing else in the path refuses it.
  it.each([
    [
      'an edition of another organization',
      { scope: 'edition', conferenceId: 'conf-B' },
      'conference',
    ],
    [
      'a speaker with standing only in another organization',
      { subject: { type: 'speaker', id: 'sp-theirs' } },
      'speaker',
    ],
    [
      'a talk of another organization',
      { subject: { type: 'talk', id: 'talk-theirs' } },
      'talk',
    ],
    [
      'a sponsor of another organization',
      { subject: { type: 'sponsor', id: 'sponsor-theirs' } },
      'sponsor',
    ],
    [
      'our talk named as a sponsor',
      { subject: { type: 'sponsor', id: 'talk-ours' } },
      'sponsor',
    ],
  ] as const)('refuses %s, and writes nothing', async (_, change, type) => {
    const error = await assets()
      .update({ id: 'asset-ours', details: { ...DETAILS, ...change } })
      .catch((e) => e)
    expect({ code: error.code, message: error.message }).toEqual({
      code: 'NOT_FOUND',
      message: `No ${type} with that id for this request`,
    })
    expect(h.patches).toEqual([])
  })

  it.each([
    ['our edition', { scope: 'edition', conferenceId: 'conf-A' }],
    [
      'a speaker who is a member here',
      { subject: { type: 'speaker', id: 'sp-member' } },
    ],
    [
      'a speaker with a talk here',
      { subject: { type: 'speaker', id: 'sp-talk-here' } },
    ],
    ['our talk', { subject: { type: 'talk', id: 'talk-ours' } }],
    ['our sponsor', { subject: { type: 'sponsor', id: 'sponsor-ours' } }],
  ] as const)('accepts %s', async (_, change) => {
    await assets().update({
      id: 'asset-ours',
      details: { ...DETAILS, ...change },
    })
    expect(h.patches).toHaveLength(1)
  })

  it('answers another organization’s asset as a missing one, before reading any subject', async () => {
    const foreign = await assets()
      .update({
        id: 'asset-theirs',
        details: { ...DETAILS, subject: { type: 'speaker', id: 'sp-theirs' } },
      })
      .catch((e) => e)
    const missing = await assets()
      .update({ id: 'asset-nope', details: DETAILS })
      .catch((e) => e)
    expect({ code: foreign.code, message: foreign.message }).toEqual({
      code: 'NOT_FOUND',
      message: missing.message,
    })
    expect(missing.message).toBe(
      'No marketingAsset with that id for this request',
    )
    // The subject's standing was never probed for a foreign asset.
    const probed = h.read.mock.calls.map(
      ([, params]) => params?.id ?? params?.speakerId,
    )
    expect(probed).not.toContain('sp-theirs')
    expect(h.patches).toEqual([])
  })

  it('refuses a draft id of our asset', async () => {
    await expect(
      assets().update({ id: 'drafts.asset-ours', details: DETAILS }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(h.patches).toEqual([])
  })

  it.each([
    ['an edition asset with no edition', { scope: 'edition' }],
    ['an organization-wide asset with an edition', { conferenceId: 'conf-A' }],
    ['a blank title', { title: '   ' }],
    ['blank alt text', { alt: '' }],
    // Never a draft: the shape refuses it before any document is read.
    [
      'a draft of our edition',
      { scope: 'edition', conferenceId: 'drafts.conf-A' },
    ],
    [
      'a draft subject',
      { subject: { type: 'sponsor', id: 'drafts.sponsor-ours' } },
    ],
  ] as const)('refuses %s as bad input', async (_, change) => {
    await expect(
      assets().update({ id: 'asset-ours', details: { ...DETAILS, ...change } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.patches).toEqual([])
  })

  it('refuses a non-organizer before anything is read', async () => {
    await expect(
      assets(['org-B']).update({ id: 'asset-ours', details: DETAILS }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.read).not.toHaveBeenCalled()
    expect(h.patches).toEqual([])
  })
})

/**
 * SURFACE TRIPWIRE, as in `tenancy.writes.test.ts`: a new mutation here must
 * decide whether it takes a client id and so needs the ownership guard.
 */
describe('the marketingAsset mutation surface is pinned', () => {
  it('has exactly the guarded delete and update', () => {
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
    expect(mutations.sort()).toEqual(['delete', 'update'])
  })
})
