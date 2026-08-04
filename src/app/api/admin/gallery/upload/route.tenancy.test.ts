/**
 * REFERENCE INJECTION on the gallery UPLOAD route (#731 F4).
 *
 * The tRPC `gallery.admin.update` path is covered by
 * `src/server/routers/tenancy.refs.test.ts`; this is its API-route sibling,
 * which takes `metadata.speakers` from a multipart body and writes it straight
 * into the new image's `speakers[]` reference array — a write that also pushes a
 * "you were tagged" notification into that person's hub.
 *
 * The refusal is per-FILE (the route reports a result row per upload) rather
 * than a thrown response, so the assertion is that NO image was created.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const authMock = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => authMock() }))

const isOrganizerMock = vi.fn()
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: (...a: unknown[]) => isOrganizerMock(...a),
}))

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...a: unknown[]) => getConferenceMock(...a),
}))

const createGalleryImageMock = vi.fn()
vi.mock('@/lib/gallery/sanity', () => ({
  createGalleryImage: (...a: unknown[]) => createGalleryImageMock(...a),
}))

/** How many of the requested speaker ids the scoped count reports as ours. */
const h = vi.hoisted(() => ({ ownedCount: 0 }))
vi.mock('@/lib/sanity/client', () => {
  const client = {
    fetch: async (query: string) => {
      if (query.startsWith('count(')) return h.ownedCount
      return null
    },
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

import { POST } from './route'

const ORG_A = 'org-A'
const CONF_A = 'conf-A'

/** A request carrying one image and the given metadata. */
function requestWith(metadata: Record<string, unknown>) {
  const formData = new FormData()
  formData.append(
    'files',
    new File([new Uint8Array(8)], 'photo.png', { type: 'image/png' }),
  )
  formData.set('metadata', JSON.stringify(metadata))
  return { formData: () => Promise.resolve(formData) } as never
}

const METADATA = {
  photographer: 'Ada',
  location: 'Bergen',
  date: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  h.ownedCount = 0
  authMock.mockResolvedValue({ speaker: { _id: 'sp-admin' } })
  isOrganizerMock.mockResolvedValue(true)
  getConferenceMock.mockResolvedValue({
    conference: { _id: CONF_A, organization: { _ref: ORG_A } },
    domain: 'localhost',
    error: null,
  })
  createGalleryImageMock.mockResolvedValue({
    image: { _id: 'img-1' },
    error: null,
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('gallery upload refuses foreign speaker tags (#731 F4)', () => {
  it('does not create the image when a tagged speaker is not ours', async () => {
    h.ownedCount = 0
    const res = await POST(requestWith({ ...METADATA, speakers: ['sp-B'] }))
    const body = await res.json()
    expect(createGalleryImageMock).not.toHaveBeenCalled()
    expect(body.summary).toMatchObject({ successful: 0, failed: 1 })
    expect(body.results[0].error).toMatch(/not in this organization/)
  })

  it('creates the image when every tagged speaker is ours', async () => {
    h.ownedCount = 1
    const res = await POST(requestWith({ ...METADATA, speakers: ['sp-A'] }))
    const body = await res.json()
    expect(createGalleryImageMock).toHaveBeenCalled()
    expect(body.summary).toMatchObject({ successful: 1, failed: 0 })
  })

  it('FAILS CLOSED — an unreadable probe refuses the tag', async () => {
    h.ownedCount = -1
    const res = await POST(requestWith({ ...METADATA, speakers: ['sp-A'] }))
    const body = await res.json()
    expect(createGalleryImageMock).not.toHaveBeenCalled()
    expect(body.summary).toMatchObject({ successful: 0, failed: 1 })
  })

  it('an upload with no speaker tags is unaffected', async () => {
    const res = await POST(requestWith(METADATA))
    const body = await res.json()
    expect(createGalleryImageMock).toHaveBeenCalled()
    expect(body.summary).toMatchObject({ successful: 1, failed: 0 })
  })
})
