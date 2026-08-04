import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

/**
 * TENANT ISOLATION for the gallery router (#616).
 *
 * READS: the admin list/count used to guard with `if (!conference)`, which never
 * fires (`getConferenceForDomain` returns a truthy `{} as Conference`), so an
 * unknown host queried with `conferenceId: undefined` and got every tenant's
 * photos. `listMine`/`countMine` passed only a `speakerId` — unscoped by
 * construction.
 *
 * WRITES: every mutation takes an image id from CLIENT INPUT and did not check
 * which tenant owns it, so an organizer of tenant A could edit or delete tenant
 * B's photos by id.
 */

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

type LooseAsyncMock = ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>
const getGalleryImagesMock: LooseAsyncMock = vi.fn(async () => [])
const getGalleryImageCountMock: LooseAsyncMock = vi.fn(async () => 0)
const getGalleryImageTenantMock: LooseAsyncMock = vi.fn()
const updateGalleryImageMock: LooseAsyncMock = vi.fn(async () => ({
  image: { _id: 'img-1' },
}))
const deleteGalleryImageMock: LooseAsyncMock = vi.fn(async () => true)
const untagSpeakerFromImageMock: LooseAsyncMock = vi.fn(async () => ({
  success: true,
}))
vi.mock('@/lib/gallery/sanity', () => ({
  getGalleryImages: (...a: unknown[]) => getGalleryImagesMock(...a),
  getGalleryImageCount: (...a: unknown[]) => getGalleryImageCountMock(...a),
  getGalleryImageTenant: (...a: unknown[]) => getGalleryImageTenantMock(...a),
  updateGalleryImage: (...a: unknown[]) => updateGalleryImageMock(...a),
  deleteGalleryImage: (...a: unknown[]) => deleteGalleryImageMock(...a),
  untagSpeakerFromImage: (...a: unknown[]) => untagSpeakerFromImageMock(...a),
}))

import { galleryRouter } from './gallery'

const CONFERENCE_ID = 'conf-1'
const ORG_ID = 'org-A'
const SPEAKER_ID = 'sp-1'

function caller() {
  const speaker = {
    _id: SPEAKER_ID,
    name: 'Speaker',
    organizerOrgIds: [ORG_ID],
  }
  const ctx = {
    session: { speaker, user: { name: 'Speaker' } },
    speaker,
  } as unknown as Context
  return galleryRouter.createCaller(ctx)
}

/** The Host resolves to a conference of ORG_ID. */
function knownHost() {
  getConferenceMock.mockResolvedValue({
    conference: { _id: CONFERENCE_ID, organization: { _ref: ORG_ID } },
    error: null,
  })
}

/** The Host resolves to NOTHING — the truthy-`{}` unknown-host case. */
function unknownHost() {
  getConferenceMock.mockResolvedValue({
    conference: {},
    error: new Error('Conference not found for domain: nobody.example.com'),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  knownHost()
  getGalleryImageTenantMock.mockResolvedValue({
    conferenceId: CONFERENCE_ID,
    orgId: ORG_ID,
  })
  updateGalleryImageMock.mockResolvedValue({ image: { _id: 'img-1' } })
  deleteGalleryImageMock.mockResolvedValue(true)
  untagSpeakerFromImageMock.mockResolvedValue({ success: true })
})

describe('gallery reads are scoped to the resolved tenant (#616)', () => {
  it('admin.list scopes to the resolved conference', async () => {
    await caller().admin.list({ limit: 50, offset: 0 })
    expect(getGalleryImagesMock).toHaveBeenCalledWith(
      expect.objectContaining({ conferenceId: CONFERENCE_ID }),
      expect.anything(),
    )
  })

  it('listMine scopes to the resolved ORG, not to the speaker alone', async () => {
    await caller().listMine()
    expect(getGalleryImagesMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, speakerId: SPEAKER_ID }),
    )
  })

  it('countMine scopes to the resolved ORG', async () => {
    await caller().countMine()
    expect(getGalleryImageCountMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, speakerId: SPEAKER_ID }),
    )
  })

  it('an UNKNOWN host reads nothing — every read path throws instead', async () => {
    unknownHost()
    await expect(
      caller().admin.list({ limit: 50, offset: 0 }),
    ).rejects.toBeTruthy()
    await expect(
      caller().admin.count({ limit: 50, offset: 0 }),
    ).rejects.toBeTruthy()
    await expect(caller().listMine()).rejects.toBeTruthy()
    await expect(caller().countMine()).rejects.toBeTruthy()
    expect(getGalleryImagesMock).not.toHaveBeenCalled()
    expect(getGalleryImageCountMock).not.toHaveBeenCalled()
  })
})

describe('gallery mutations reject another tenant’s image id (#616)', () => {
  /** The image id belongs to a DIFFERENT tenant. */
  function foreignImage() {
    getGalleryImageTenantMock.mockResolvedValue({
      conferenceId: 'conf-OTHER',
      orgId: 'org-B',
    })
  }

  it('update: NOT_FOUND, and nothing is written', async () => {
    foreignImage()
    await expect(
      caller().admin.update({ id: 'img-foreign', photographer: 'me' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(updateGalleryImageMock).not.toHaveBeenCalled()
  })

  it('delete: NOT_FOUND, and nothing is deleted', async () => {
    foreignImage()
    await expect(
      caller().admin.delete({ id: 'img-foreign' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(deleteGalleryImageMock).not.toHaveBeenCalled()
  })

  it('toggleFeatured: NOT_FOUND, and nothing is written', async () => {
    foreignImage()
    await expect(
      caller().admin.toggleFeatured({ id: 'img-foreign', featured: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(updateGalleryImageMock).not.toHaveBeenCalled()
  })

  it('untagSelf: NOT_FOUND for an image outside the caller’s org', async () => {
    foreignImage()
    await expect(
      caller().untagSelf({ imageId: 'img-foreign' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(untagSpeakerFromImageMock).not.toHaveBeenCalled()
  })

  it('an image with NO conference is refused (fail closed)', async () => {
    getGalleryImageTenantMock.mockResolvedValue({
      conferenceId: null,
      orgId: null,
    })
    await expect(
      caller().admin.delete({ id: 'img-orphan' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(deleteGalleryImageMock).not.toHaveBeenCalled()
  })

  it('a missing image is refused (fail closed)', async () => {
    getGalleryImageTenantMock.mockResolvedValue(null)
    await expect(
      caller().admin.delete({ id: 'img-missing' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(deleteGalleryImageMock).not.toHaveBeenCalled()
  })

  it('update cannot REASSIGN an owned image to another conference', async () => {
    await expect(
      caller().admin.update({ id: 'img-1', conference: 'conf-OTHER' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(updateGalleryImageMock).not.toHaveBeenCalled()
  })

  it('the caller’s OWN image still updates (single-tenant behaviour unchanged)', async () => {
    const result = await caller().admin.update({
      id: 'img-1',
      photographer: 'me',
    })
    expect(result).toEqual({ _id: 'img-1' })
    expect(updateGalleryImageMock).toHaveBeenCalledOnce()
  })
})
