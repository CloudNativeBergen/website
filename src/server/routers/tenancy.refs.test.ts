/**
 * @vitest-environment node
 *
 * REFERENCE-INJECTION ISOLATION (#731 F1/F4).
 *
 * The sibling shape to "a client-supplied id reaching a patch": a client-supplied
 * id written INTO a reference field of a document the caller DOES own. No foreign
 * document is patched, but a foreign document is dereferenced, published, and —
 * for speakers — turned into the participation that
 * `requireSpeakerInCurrentOrg` reads as ownership.
 *
 * Covered here: `featured.admin.addSpeaker` / `addTalk` (which publish another
 * tenant's person, or their UNPUBLISHED CFP submission, on this public site) and
 * `gallery.admin.update`'s `speakers[]` tags (which also push a "you were
 * tagged" notification into that person's hub).
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  /** What the by-id ownership probe reports. */
  tenant: null as Record<string, unknown> | null,
  /** How many of the supplied reference ids the scoped count reports as ours. */
  ownedCount: 0,
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))

vi.mock('@/lib/sanity/client', () => {
  const client = {
    fetch: async (query: string) => {
      if (query.includes('"memberOrgIds"')) return h.tenant
      if (query.startsWith('count(')) return h.ownedCount
      return null
    },
    patch: () => {
      throw new Error('no write should reach Sanity in these tests')
    },
    delete: async () => ({ results: [] }),
    create: async () => ({ _id: 'new' }),
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

const featuredLib = vi.hoisted(() => ({
  addFeaturedSpeaker: vi.fn(),
  addFeaturedTalk: vi.fn(),
}))
vi.mock('@/lib/featured/sanity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  addFeaturedSpeaker: featuredLib.addFeaturedSpeaker,
  addFeaturedTalk: featuredLib.addFeaturedTalk,
}))

const galleryLib = vi.hoisted(() => ({
  updateGalleryImage: vi.fn(),
  getGalleryImageTenant: vi.fn(),
}))
vi.mock('@/lib/gallery/sanity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  updateGalleryImage: galleryLib.updateGalleryImage,
  getGalleryImageTenant: galleryLib.getGalleryImageTenant,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { featuredRouter } from './featured'
import { galleryRouter } from './gallery'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'

function ctx(): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const featured = () => t.createCallerFactory(featuredRouter)(ctx())
const gallery = () => t.createCallerFactory(galleryRouter)(ctx())

beforeEach(() => {
  vi.clearAllMocks()
  h.tenant = null
  h.ownedCount = 0
  h.getConference.mockResolvedValue({
    conference: { _id: CONF_A, organization: { _ref: ORG_A } },
    domain: 'localhost',
    error: null,
  })
  featuredLib.addFeaturedSpeaker.mockResolvedValue({
    success: true,
    error: null,
  })
  featuredLib.addFeaturedTalk.mockResolvedValue({ success: true, error: null })
  galleryLib.updateGalleryImage.mockResolvedValue({
    image: { _id: 'img-A' },
    error: null,
  })
  galleryLib.getGalleryImageTenant.mockResolvedValue({
    conferenceId: CONF_A,
    orgId: ORG_A,
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('featured content cannot reference another tenant (#731 F4)', () => {
  it('addSpeaker refuses a speaker this org has no standing over', async () => {
    h.ownedCount = 0
    await expect(
      featured().admin.addSpeaker({ speakerId: 'sp-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(featuredLib.addFeaturedSpeaker).not.toHaveBeenCalled()
  })

  it('addSpeaker still works for our own speaker', async () => {
    h.ownedCount = 1
    await expect(
      featured().admin.addSpeaker({ speakerId: 'sp-A' }),
    ).resolves.toMatchObject({ success: true })
    expect(featuredLib.addFeaturedSpeaker).toHaveBeenCalledWith(CONF_A, 'sp-A')
  })

  it('addTalk refuses another tenant’s talk', async () => {
    h.tenant = {
      _type: 'talk',
      orgId: null,
      conferenceId: 'conf-OTHER',
      conferenceOrgId: 'org-B',
      memberOrgIds: [],
    }
    await expect(
      featured().admin.addTalk({ talkId: 'talk-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(featuredLib.addFeaturedTalk).not.toHaveBeenCalled()
  })

  it('addTalk refuses a non-talk document — wrong `_type`', async () => {
    h.tenant = {
      _type: 'speaker',
      orgId: null,
      conferenceId: null,
      conferenceOrgId: ORG_A,
      memberOrgIds: [ORG_A],
    }
    await expect(
      featured().admin.addTalk({ talkId: 'sp-A' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(featuredLib.addFeaturedTalk).not.toHaveBeenCalled()
  })

  it('addTalk still works for our own talk', async () => {
    h.tenant = {
      _type: 'talk',
      orgId: null,
      conferenceId: CONF_A,
      conferenceOrgId: ORG_A,
      memberOrgIds: [],
    }
    await expect(
      featured().admin.addTalk({ talkId: 'talk-A' }),
    ).resolves.toMatchObject({ success: true })
    expect(featuredLib.addFeaturedTalk).toHaveBeenCalledWith(CONF_A, 'talk-A')
  })
})

describe('gallery speaker tags cannot reference another tenant (#731 F4)', () => {
  it('update refuses a foreign speaker id in speakers[]', async () => {
    h.ownedCount = 0
    await expect(
      gallery().admin.update({ id: 'img-A', speakers: ['sp-B'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(galleryLib.updateGalleryImage).not.toHaveBeenCalled()
  })

  it('update still tags our own speakers', async () => {
    h.ownedCount = 1
    await expect(
      gallery().admin.update({ id: 'img-A', speakers: ['sp-A'] }),
    ).resolves.toBeTruthy()
    expect(galleryLib.updateGalleryImage).toHaveBeenCalled()
  })
})
