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
  'asset-2025': { _type: 'marketingAsset', orgId: 'org-A' },
  'asset-panorama': { _type: 'marketingAsset', orgId: 'org-A' },
  // Ours, but Studio (which no guard reaches) marked it with B's edition.
  'asset-studio-marked': { _type: 'marketingAsset', orgId: 'org-A' },
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
/** The edition mark each of our assets carries now. */
const MARKS: Record<string, string | null> = {
  'asset-ours': null,
  'asset-2025': 'conf-A-2025',
  'asset-studio-marked': 'conf-B',
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

/** The image each of our assets holds, as the background read projects it. */
const BACKGROUNDS: Record<
  string,
  {
    title: string
    alt: string
    url: string | null
    width: number | null
    height: number | null
  }
> = {
  'asset-ours': {
    title: 'Keynote hall',
    alt: 'The main hall from the stage',
    url: 'https://cdn.sanity.io/images/p/d/hall-3000x2000.jpg',
    width: 3000,
    height: 2000,
  },
  'asset-2025': {
    title: 'Portrait',
    alt: 'A speaker at the lectern',
    url: 'https://cdn.sanity.io/images/p/d/portrait-800x1200.png',
    width: 800,
    height: 1200,
  },
  // A panorama: capping only the short side would still ask for 11880 px.
  'asset-panorama': {
    title: 'Fjord',
    alt: 'A fjord from end to end',
    url: 'https://cdn.sanity.io/images/p/d/fjord-20000x2000.jpg',
    width: 20000,
    height: 2000,
  },
  // Another organization's, as a read that skipped the guard would find it.
  'asset-theirs': {
    title: 'Theirs',
    alt: 'Not ours',
    url: 'https://cdn.sanity.io/images/p/d/theirs-2000x2000.jpg',
    width: 2000,
    height: 2000,
  },
  // An asset with no image to draw (an audio track, #1178).
  'asset-studio-marked': {
    title: 'Track',
    alt: '',
    url: null,
    width: null,
    height: null,
  },
}

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
      // The edition mark an asset carries, for `edition: "keep"`.
      if (query.includes('][0]') && query.includes('"conferenceId"'))
        return params.id in MARKS ? { conferenceId: MARKS[params.id] } : null
      // A background: the image an asset holds, with its size.
      if (query.includes('"url": image.asset->url'))
        return BACKGROUNDS[params.id] ?? null
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
  edition: 'none' as 'none' | 'current' | 'keep',
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

  it('marks with THIS edition, resolved from the host; an edition id from the client is ignored', async () => {
    await assets().update({
      id: 'asset-ours',
      details: {
        ...DETAILS,
        edition: 'current',
        // Not part of the input: stripped, never written.
        conferenceId: 'conf-B',
      } as unknown as typeof DETAILS,
    })
    expect(h.patches[0].set).toMatchObject({
      scope: 'edition',
      conference: { _type: 'reference', _ref: 'conf-A' },
    })
    expect(JSON.stringify(h.patches)).not.toContain('conf-B')
  })

  it('keeps an older edition mark as it is', async () => {
    await assets().update({
      id: 'asset-2025',
      details: { ...DETAILS, edition: 'keep' },
    })
    expect(h.patches[0].set).toMatchObject({
      scope: 'edition',
      conference: { _type: 'reference', _ref: 'conf-A-2025' },
    })
  })

  it('refuses to keep a mark of ANOTHER organization’s edition, and writes nothing', async () => {
    const error = await assets()
      .update({
        id: 'asset-studio-marked',
        details: { ...DETAILS, edition: 'keep' },
      })
      .catch((e) => e)
    expect({ code: error.code, message: error.message }).toEqual({
      code: 'NOT_FOUND',
      message: 'No conference with that id for this request',
    })
    expect(h.patches).toEqual([])
  })

  it('refuses to keep a mark an organization-wide asset does not have', async () => {
    await expect(
      assets().update({
        id: 'asset-ours',
        details: { ...DETAILS, edition: 'keep' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.patches).toEqual([])
  })

  it('refuses to edit an asset staged in a Content Release, and writes nothing', async () => {
    h.releaseTwins = 1
    await expect(
      assets().update({ id: 'asset-ours', details: DETAILS }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('then edit it here'),
    })
    expect(h.patches).toEqual([])
  })

  // Each refusal is paired with the same request naming OUR document, which
  // succeeds: nothing else in the path refuses it.
  it.each([
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
    ['this edition', { edition: 'current' }],
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
    ['an edition id in place of a choice', { edition: 'conf-A' }],
    ['a blank title', { title: '   ' }],
    ['blank alt text', { alt: '' }],
    // Never a draft: the shape refuses it before any document is read.
    [
      'a draft subject',
      { subject: { type: 'sponsor', id: 'drafts.sponsor-ours' } },
    ],
  ] as const)('refuses %s as bad input', async (_, change) => {
    await expect(
      assets().update({
        id: 'asset-ours',
        details: { ...DETAILS, ...change } as typeof DETAILS,
      }),
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

describe('marketingAsset.background', () => {
  /** The CDN URL the proxy is asked for, out of the same-origin URL. */
  const proxied = (url: string) => {
    const parsed = new URL(url, 'http://tenant.example')
    expect(parsed.origin).toBe('http://tenant.example')
    expect(parsed.pathname).toBe('/api/proxy-image')
    return parsed.searchParams.get('url')
  }
  const backgroundReads = () =>
    h.read.mock.calls.filter(([query]) =>
      String(query).includes('"url": image.asset->url'),
    )

  it('answers our image through the same-origin proxy, at the size a drift needs', async () => {
    const picked = await assets().background({ id: 'asset-ours' })
    expect(picked).toMatchObject({
      _id: 'asset-ours',
      title: 'Keynote hall',
      alt: 'The main hall from the stage',
    })
    // The centred square the canvas's cover draw shows anyway, at 1188 (1080
    // plus the drift's 10%): the same pixels, and never more bytes.
    expect(proxied(picked.url)).toBe(
      'https://cdn.sanity.io/images/p/d/hall-3000x2000.jpg?w=1188&h=1188&fit=crop&crop=center&fm=webp&q=90',
    )
    const [, params] = backgroundReads()[0]
    expect(params).toMatchObject({ orgId: 'org-A', id: 'asset-ours' })
  })

  it('never asks for a rendition larger than the original', async () => {
    const picked = await assets().background({ id: 'asset-2025' })
    expect(proxied(picked.url)).toBe(
      'https://cdn.sanity.io/images/p/d/portrait-800x1200.png?w=800&h=800&fit=crop&crop=center&fm=webp&q=90',
    )
  })

  it('never asks for more than the square the canvas shows, however long the image', async () => {
    const picked = await assets().background({ id: 'asset-panorama' })
    expect(proxied(picked.url)).toBe(
      'https://cdn.sanity.io/images/p/d/fjord-20000x2000.jpg?w=1188&h=1188&fit=crop&crop=center&fm=webp&q=90',
    )
  })

  it('refuses another organization’s asset exactly as a missing one, before reading it', async () => {
    const foreign = await assets()
      .background({ id: 'asset-theirs' })
      .catch((e) => e)
    const missing = await assets()
      .background({ id: 'asset-nope' })
      .catch((e) => e)
    expect(foreign.code).toBe('NOT_FOUND')
    expect({ code: foreign.code, message: foreign.message }).toEqual({
      code: missing.code,
      message: missing.message,
    })
    expect(backgroundReads()).toEqual([])
  })

  it('refuses a draft id with the same answer, before reading it', async () => {
    const draft = await assets()
      .background({ id: 'drafts.asset-ours' })
      .catch((e) => e)
    expect(draft.code).toBe('NOT_FOUND')
    expect(draft.message).toBe(
      'No marketingAsset with that id for this request',
    )
    expect(backgroundReads()).toEqual([])
  })

  it('refuses an asset with no image to draw', async () => {
    await expect(
      assets().background({ id: 'asset-studio-marked' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a non-organizer before anything is read', async () => {
    await expect(
      assets(['org-B']).background({ id: 'asset-ours' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(h.read).not.toHaveBeenCalled()
  })
})
