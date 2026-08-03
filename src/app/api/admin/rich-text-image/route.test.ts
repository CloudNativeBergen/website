import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getAuthSessionMock = vi.fn()
vi.mock('@/lib/auth', () => ({
  getAuthSession: () => getAuthSessionMock(),
}))

const isOrganizerMock = vi.fn()
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: (...a: unknown[]) => isOrganizerMock(...a),
}))

const uploadMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { assets: { upload: (...a: unknown[]) => uploadMock(...a) } },
}))

import { POST } from './route'

const MAX_BYTES = 8 * 1024 * 1024

/** A request whose body never parses — the multipart parser rejects instead. */
const unparseableRequest = (error: unknown) =>
  ({ formData: () => Promise.reject(error) }) as unknown as Request

/** A request that parses fine and carries `file`. */
const requestWith = (file: File) => {
  const formData = new FormData()
  formData.set('file', file)
  return { formData: () => Promise.resolve(formData) } as unknown as Request
}

const imageOf = (bytes: number) =>
  new File([new Uint8Array(bytes)], 'photo.png', { type: 'image/png' })

beforeEach(() => {
  vi.clearAllMocks()
  getAuthSessionMock.mockResolvedValue({ speaker: { _id: 'speaker-1' } })
  isOrganizerMock.mockResolvedValue(true)
  uploadMock.mockResolvedValue({
    _id: 'image-0000000000000000000000000000000000000000-800x600-png',
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('/api/admin/rich-text-image — oversized bodies', () => {
  it.each([
    'Body exceeded 1 MB limit',
    'body size limit exceeded',
    'Request body length does not match content-length header',
    'request entity too large',
  ])('answers 413 when the parser rejects with %j', async (message) => {
    const res = await POST(unparseableRequest(new Error(message)))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({
      error: expect.stringContaining('too large'),
    })
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('answers 413 for a file that parses but exceeds 8 MB', async () => {
    const res = await POST(requestWith(imageOf(MAX_BYTES + 1)))
    expect(res.status).toBe(413)
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('does not dress a genuine parse failure up as a size problem', async () => {
    const res = await POST(
      unparseableRequest(new Error('Could not parse content as FormData.')),
    )
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to upload image' })
  })

  it('rejects an unauthenticated caller before touching the body', async () => {
    isOrganizerMock.mockResolvedValue(false)
    const formData = vi.fn()
    await POST({ formData } as unknown as Request)
    expect(formData).not.toHaveBeenCalled()
  })

  it('uploads an image that is within the limit', async () => {
    const res = await POST(requestWith(imageOf(1024)))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      assetId: 'image-0000000000000000000000000000000000000000-800x600-png',
    })
  })
})
