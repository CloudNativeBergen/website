/** @vitest-environment node */
import { crc32 } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  conference: vi.fn(),
  photos: vi.fn(),
  upstream: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: h.session }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.conference,
}))
vi.mock('@/lib/photo-wall/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/photo-wall/export')>()),
  readConsentedPhotos: h.photos,
}))

import { GET } from './route'

const CDN = 'https://cdn.sanity.io/images/proj/production'
const PHOTOS = [
  {
    _id: 'wallPost-a2',
    url: `${CDN}/a2-800x600.jpg`,
    submittedAt: '2026-10-26T09:30:00.000Z',
  },
  {
    _id: 'wallPost-a1',
    url: `${CDN}/a1-800x600.jpg`,
    submittedAt: '2026-10-26T09:00:00.000Z',
  },
  { _id: 'wallPost-a0', url: `${CDN}/a0-800x600.jpg`, submittedAt: null },
]
/** Each photo's bytes: its URL, so a mixed-up entry shows. */
const bytesOf = (url: string) => new TextEncoder().encode(`jpeg:${url}`)

const ORGANIZER = { _id: 'sp-1', organizerOrgIds: ['org-A'] }
const CONF_A = { _id: 'conf-A', organization: { _ref: 'org-A' } }

const get = () =>
  GET(new Request('https://2026.example.no/api/admin/photo-wall/export'))

/** The entries of a ZIP, from its central directory, CRC-checked. */
function unzip(zip: Uint8Array): Record<string, string> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let end = zip.length - 22
  while (view.getUint32(end, true) !== 0x06054b50) end--
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const entries: Record<string, string> = {}
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const skip =
      nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(
      zip.subarray(at + 46, at + 46 + nameLength),
    )
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true)
    const data = zip.subarray(start, start + size)
    expect(crc32(data)).toBe(crc)
    entries[name] = new TextDecoder().decode(data)
    at += 46 + skip
  }
  return entries
}

async function expectRefused(response: Response) {
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'Not found' })
  // Guard before fetch: no Wall Post is read, no photo fetched.
  expect(h.photos).not.toHaveBeenCalled()
  expect(h.upstream).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', h.upstream)
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'proj')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production')
  h.session.mockResolvedValue({ speaker: ORGANIZER })
  // The cached tenant read and the live one agree.
  h.conference.mockResolvedValue({ conference: CONF_A, error: null })
  h.photos.mockResolvedValue(PHOTOS)
  h.upstream.mockImplementation(
    async (url: string) => new Response(bytesOf(url), { status: 200 }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the consented ZIP export route (Photo Wall P5)', () => {
  it('streams every consented photo’s original into one ZIP, as an attachment', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="photo-wall-marketing.zip"',
    )
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const entries = unzip(new Uint8Array(await response.arrayBuffer()))
    expect(entries).toEqual({
      'a2.jpg': `jpeg:${CDN}/a2-800x600.jpg`,
      'a1.jpg': `jpeg:${CDN}/a1-800x600.jpg`,
      'a0.jpg': `jpeg:${CDN}/a0-800x600.jpg`,
    })
    expect(Object.keys(entries)).toEqual(['a2.jpg', 'a1.jpg', 'a0.jpg'])
    // The originals: the CDN URL exactly, never following a redirect.
    expect(h.upstream.mock.calls.map(([url]) => url)).toEqual(
      PHOTOS.map((p) => p.url),
    )
    expect(h.upstream).toHaveBeenCalledWith(
      PHOTOS[0].url,
      expect.objectContaining({ redirect: 'error' }),
    )
    // Read for THIS request's conference, the one the server resolved.
    expect(h.photos).toHaveBeenCalledWith('conf-A')
  })

  it('answers before it has fetched every photo: the ZIP streams, never buffered', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(h.upstream.mock.calls.length).toBeLessThan(PHOTOS.length)
    await response.arrayBuffer()
    expect(h.upstream).toHaveBeenCalledTimes(PHOTOS.length)
  })

  it('reads the conference live, not only from the cached tenant read', async () => {
    await get()
    expect(h.conference).toHaveBeenCalledWith({ uncached: true })
  })

  describe('refuses, before any Wall Post is read', () => {
    it('a request without a session', async () => {
      h.session.mockResolvedValue(null)
      await expectRefused(await get())
      // Not even the tenant read: an anonymous request reads nothing.
      expect(h.conference).not.toHaveBeenCalled()
    })

    it('a signed-in speaker who organizes nothing', async () => {
      h.session.mockResolvedValue({ speaker: { _id: 'sp-2' } })
      await expectRefused(await get())
    })

    it('an organizer of ANOTHER organization', async () => {
      h.session.mockResolvedValue({
        speaker: { _id: 'sp-3', organizerOrgIds: ['org-B'] },
      })
      await expectRefused(await get())
    })

    it('a domain whose conference does not resolve', async () => {
      h.conference.mockResolvedValue({
        conference: null,
        error: new Error('x'),
      })
      await expectRefused(await get())
    })

    it('a conference moved to another organization since the cached read', async () => {
      h.conference.mockImplementation(
        async (opts?: { uncached?: boolean }) => ({
          conference: opts?.uncached
            ? { ...CONF_A, organization: { _ref: 'org-B' } }
            : CONF_A,
          error: null,
        }),
      )
      await expectRefused(await get())
    })

    it('a live read that names another conference', async () => {
      h.conference.mockImplementation(
        async (opts?: { uncached?: boolean }) => ({
          conference: opts?.uncached ? { ...CONF_A, _id: 'conf-B' } : CONF_A,
          error: null,
        }),
      )
      await expectRefused(await get())
    })

    it('a live read that fails', async () => {
      h.conference.mockImplementation(async (opts?: { uncached?: boolean }) =>
        opts?.uncached
          ? { conference: null, error: new Error('timeout') }
          : { conference: CONF_A, error: null },
      )
      await expectRefused(await get())
    })
  })

  it('says there is nothing to export, and fetches nothing, when no photo has consent', async () => {
    h.photos.mockResolvedValue([])
    const response = await get()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'No approved photos with marketing consent',
    })
    expect(h.upstream).not.toHaveBeenCalled()
  })

  it('fails the download rather than leave a photo out silently', async () => {
    h.upstream.mockImplementation(async (url: string) =>
      url === PHOTOS[1].url
        ? new Response('gone', { status: 404 })
        : new Response(bytesOf(url), { status: 200 }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await get()
    await expect(response.arrayBuffer()).rejects.toThrow()
  })

  it('never fetches a photo URL off our own project’s CDN', async () => {
    h.photos.mockResolvedValue([
      {
        ...PHOTOS[0],
        url: 'https://evil.example/images/proj/production/a.jpg',
      },
    ])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await get()
    expect(response.status).toBe(502)
    expect(h.upstream).not.toHaveBeenCalled()
  })
})
