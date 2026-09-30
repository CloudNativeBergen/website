import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
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

const getPreviousEditionsMock: LooseAsyncMock = vi.fn(async () => [])
vi.mock('@/lib/gallery/editions', () => ({
  getPreviousEditions: (...a: unknown[]) => getPreviousEditionsMock(...a),
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
    conference: {
      _id: CONFERENCE_ID,
      title: 'CND 2026',
      startDate: '2026-10-01',
      organization: { _ref: ORG_ID },
    },
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
  getPreviousEditionsMock.mockResolvedValue([PREVIOUS_EDITION])
})

/** The organization's one previous edition, as the server resolves it. */
const PREVIOUS_EDITION = {
  _id: 'conf-2025',
  title: 'CND 2025',
  startDate: '2025-10-01',
  endDate: '2025-10-02',
}

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

/**
 * PREVIOUS EDITIONS (#1191). The client names an edition by an OPAQUE selector
 * (the sibling conference's id); the server resolves the organization's past
 * editions itself and refuses any selector outside that set BEFORE the image
 * query runs. A selector that names another organization's conference — or a
 * future sibling, which the server never lists — reads nothing.
 */
describe('gallery reads from a previous edition of the same organization (#1191)', () => {
  it('admin.editions lists the current edition and the server-resolved previous ones', async () => {
    await expect(caller().admin.editions()).resolves.toEqual({
      current: { _id: CONFERENCE_ID, title: 'CND 2026' },
      previous: [PREVIOUS_EDITION],
    })
    expect(getPreviousEditionsMock).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ _id: CONFERENCE_ID, startDate: '2026-10-01' }),
    )
  })

  it('admin.list with a previous edition reads THAT conference, scoped to the org too', async () => {
    await caller().admin.list({ edition: 'conf-2025', limit: 50, offset: 0 })
    expect(getGalleryImagesMock).toHaveBeenCalledWith(
      expect.objectContaining({ conferenceId: 'conf-2025', orgId: ORG_ID }),
      expect.anything(),
    )
  })

  it('admin.count with a previous edition counts THAT conference, scoped to the org too', async () => {
    await caller().admin.count({ edition: 'conf-2025', limit: 50, offset: 0 })
    expect(getGalleryImageCountMock).toHaveBeenCalledWith(
      expect.objectContaining({ conferenceId: 'conf-2025', orgId: ORG_ID }),
      false,
    )
  })

  it('selecting the CURRENT edition explicitly is the default single-conference read', async () => {
    await caller().admin.list({ edition: CONFERENCE_ID, limit: 50, offset: 0 })
    expect(getGalleryImagesMock).toHaveBeenCalledWith(
      expect.objectContaining({ conferenceId: CONFERENCE_ID }),
      expect.anything(),
    )
    expect(getGalleryImagesMock.mock.calls[0][0]).not.toHaveProperty('orgId')
  })

  it('a selector outside the previous-edition set is NOT_FOUND and NO image query runs', async () => {
    for (const edition of ['conf-OTHER-ORG', 'conf-2027-future', 'nope']) {
      await expect(
        caller().admin.list({ edition, limit: 50, offset: 0 }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(
        caller().admin.count({ edition, limit: 50, offset: 0 }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    expect(getGalleryImagesMock).not.toHaveBeenCalled()
    expect(getGalleryImageCountMock).not.toHaveBeenCalled()
  })

  // The org-scoped authz waist already refuses (FORBIDDEN) a host whose
  // organization cannot be resolved; these lock in that the edition path never
  // reaches a read in either case — whichever guard fires first.
  it('a host whose conference has NO organization can select no previous edition', async () => {
    getConferenceMock.mockResolvedValue({
      conference: {
        _id: CONFERENCE_ID,
        title: 'Orphan',
        startDate: '2026-10-01',
      },
      error: null,
    })
    await expect(
      caller().admin.list({ edition: 'conf-2025', limit: 50, offset: 0 }),
    ).rejects.toBeInstanceOf(TRPCError)
    expect(getPreviousEditionsMock).not.toHaveBeenCalled()
    expect(getGalleryImagesMock).not.toHaveBeenCalled()
  })

  it('an UNKNOWN host lists no editions', async () => {
    unknownHost()
    await expect(caller().admin.editions()).rejects.toBeInstanceOf(TRPCError)
    expect(getPreviousEditionsMock).not.toHaveBeenCalled()
  })
})

describe('gallery mutations stay single-edition (#1191)', () => {
  /** An image of the SAME organization's previous edition — readable, never writable here. */
  function previousEditionImage() {
    getGalleryImageTenantMock.mockResolvedValue({
      conferenceId: 'conf-2025',
      orgId: ORG_ID,
    })
  }

  it('update of a previous-edition image is NOT_FOUND and nothing is written', async () => {
    previousEditionImage()
    await expect(
      caller().admin.update({ id: 'img-2025', photographer: 'me' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(updateGalleryImageMock).not.toHaveBeenCalled()
  })

  it('delete of a previous-edition image is NOT_FOUND and nothing is deleted', async () => {
    previousEditionImage()
    await expect(
      caller().admin.delete({ id: 'img-2025' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(deleteGalleryImageMock).not.toHaveBeenCalled()
  })

  it('toggleFeatured of a previous-edition image is NOT_FOUND and nothing is written', async () => {
    previousEditionImage()
    await expect(
      caller().admin.toggleFeatured({ id: 'img-2025', featured: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(updateGalleryImageMock).not.toHaveBeenCalled()
  })
})
