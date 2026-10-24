/** @vitest-environment node */
import { crc32 } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  conference: vi.fn(),
  photos: vi.fn(),
  recheck: vi.fn(),
  upstream: vi.fn(),
  /** The order of re-checks and fetches. */
  log: [] as string[],
  /** The posts a live re-read finds still exportable. */
  eligible: new Set<string>(),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: h.session }))
// The one Sanity boundary of the authorization: the organization resolver
// and the live check run for real on top of it.
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.conference,
}))
vi.mock('@/lib/photo-wall/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/photo-wall/export')>()),
  readConsentedPhotos: h.photos,
  stillExportable: h.recheck,
  // Short, so a stalled photo times out within the test.
  PHOTO_TIMEOUT_MS: 50,
}))

import { GET } from './route'

const CDN = 'https://cdn.sanity.io/images/proj/production'
const photo = (id: string, submittedAt: string | null = null) => ({
  _id: `wallPost-${id}`,
  url: `${CDN}/${id}-800x600.jpg`,
  submittedAt,
})
/** Newest approval first; six, so the re-check runs in two batches. */
const PHOTOS = [
  photo('a6', '2026-10-26T09:30:00.000Z'),
  photo('a5', '2026-10-26T09:00:00.000Z'),
  photo('a4'),
  photo('a3'),
  photo('a2'),
  photo('a1'),
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

const zipOf = async (response: Response) =>
  unzip(new Uint8Array(await response.arrayBuffer()))

const entryOf = (id: string) => ({
  [`${id}.jpg`]: `jpeg:${CDN}/${id}-800x600.jpg`,
})

async function expectRefused(response: Response) {
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'Not found' })
  // Guard before fetch: no Wall Post is read, no photo fetched.
  expect(h.photos).not.toHaveBeenCalled()
  expect(h.recheck).not.toHaveBeenCalled()
  expect(h.upstream).not.toHaveBeenCalled()
}

/** The cached tenant read answers CONF_A; the live one `live`. */
const liveIs = (live: () => Promise<unknown>) =>
  h.conference.mockImplementation(async (opts?: { uncached?: boolean }) =>
    opts?.uncached ? live() : { conference: CONF_A, error: null },
  )

beforeEach(() => {
  vi.clearAllMocks()
  h.log.length = 0
  vi.stubGlobal('fetch', h.upstream)
  vi.stubEnv('NEXT_PUBLIC_SANITY_PROJECT_ID', 'proj')
  vi.stubEnv('NEXT_PUBLIC_SANITY_DATASET', 'production')
  h.session.mockResolvedValue({ speaker: ORGANIZER })
  h.conference.mockResolvedValue({ conference: CONF_A, error: null })
  h.photos.mockResolvedValue(PHOTOS)
  h.eligible = new Set(PHOTOS.map((p) => p._id))
  h.recheck.mockImplementation(async (_: string, id: string) => {
    h.log.push(`recheck ${id}`)
    return h.eligible.has(id)
  })
  h.upstream.mockImplementation(async (url: string) => {
    h.log.push(`fetch ${url.slice(CDN.length + 1, CDN.length + 3)}`)
    return new Response(bytesOf(url), { status: 200 })
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
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
    const entries = await zipOf(response)
    expect(Object.keys(entries)).toEqual([
      'a6.jpg',
      'a5.jpg',
      'a4.jpg',
      'a3.jpg',
      'a2.jpg',
      'a1.jpg',
    ])
    expect(entries).toMatchObject({ ...entryOf('a6'), ...entryOf('a1') })
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

  describe('re-checks each post live, right before fetching its photo', () => {
    it('re-reads a post, fetches its photo, then the next', async () => {
      await (await get()).arrayBuffer()
      expect(h.recheck).toHaveBeenCalledWith('conf-A', 'wallPost-a6')
      expect(h.log).toEqual(
        ['a6', 'a5', 'a4', 'a3', 'a2', 'a1'].flatMap((id) => [
          `recheck wallPost-${id}`,
          `fetch ${id}`,
        ]),
      )
    })

    it('skips a post unticked, taken off the wall or deleted since the list was read', async () => {
      h.eligible.delete('wallPost-a5')
      h.eligible.delete('wallPost-a2')
      const entries = await zipOf(await get())
      expect(Object.keys(entries)).toEqual([
        'a6.jpg',
        'a4.jpg',
        'a3.jpg',
        'a1.jpg',
      ])
      const fetched = h.upstream.mock.calls.map(([url]) => url)
      expect(fetched).not.toContain(PHOTOS[1].url)
      expect(fetched).not.toContain(PHOTOS[4].url)
    })

    it('skips a post whose consent is revoked while the photo before it streams', async () => {
      h.upstream.mockImplementation(async (url: string) => {
        if (url !== PHOTOS[0].url)
          return new Response(bytesOf(url), { status: 200 })
        // a6's body: while the ZIP reads it, a5's contributor unticks.
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            h.eligible.delete('wallPost-a5')
            controller.enqueue(bytesOf(url))
            controller.close()
          },
        })
        return new Response(body, { status: 200 })
      })
      const entries = await zipOf(await get())
      expect(Object.keys(entries)).toEqual([
        'a6.jpg',
        'a4.jpg',
        'a3.jpg',
        'a2.jpg',
        'a1.jpg',
      ])
    })

    it('skips a photo the CDN no longer has, deleted after the re-check', async () => {
      h.upstream.mockImplementation(async (url: string) =>
        url === PHOTOS[2].url
          ? new Response('gone', { status: 404 })
          : new Response(bytesOf(url), { status: 200 }),
      )
      const entries = await zipOf(await get())
      expect(Object.keys(entries)).toEqual([
        'a6.jpg',
        'a5.jpg',
        'a3.jpg',
        'a2.jpg',
        'a1.jpg',
      ])
    })
  })

  it('stops fetching a photo when the organizer cancels the download', async () => {
    const cancel = new AbortController()
    const response = await GET(
      new Request('https://2026.example.no/api/admin/photo-wall/export', {
        signal: cancel.signal,
      }),
    )
    await response.body!.getReader().read()
    const [, init] = h.upstream.mock.calls[0] as [string, RequestInit]
    expect(init.signal!.aborted).toBe(false)
    cancel.abort()
    expect(init.signal!.aborted).toBe(true)
  })

  describe('fails the download when a photo stalls, within its timeout', () => {
    /** a5 answers through `stall`; every other photo at once. */
    const stallOn = (stall: (signal: AbortSignal) => Promise<Response>) =>
      h.upstream.mockImplementation(
        async (url: string, init: { signal: AbortSignal }) =>
          url === PHOTOS[1].url
            ? stall(init.signal)
            : new Response(bytesOf(url), { status: 200 }),
      )

    it('when its headers never come', async () => {
      // As the real fetch does: rejects with the signal's reason on abort.
      stallOn(
        (signal) =>
          new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason)),
          ),
      )
      const response = await get()
      await expect(response.arrayBuffer()).rejects.toThrow(
        'Photo wallPost-a5 timed out',
      )
    }, 3000)

    it('when its body stops halfway', async () => {
      // As the real fetch's body does (measured on undici, see the PR):
      // errors with the signal's reason when it aborts after the headers.
      stallOn(async (signal) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('first half'))
            signal.addEventListener('abort', () =>
              controller.error(signal.reason),
            )
          },
        })
        return new Response(body, { status: 200 })
      })
      const response = await get()
      await expect(response.arrayBuffer()).rejects.toMatchObject({
        name: 'TimeoutError',
      })
    }, 3000)
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
      liveIs(async () => ({
        conference: { ...CONF_A, organization: { _ref: 'org-B' } },
        error: null,
      }))
      await expectRefused(await get())
    })

    it('a live read that names another conference', async () => {
      liveIs(async () => ({
        conference: { ...CONF_A, _id: 'conf-B' },
        error: null,
      }))
      await expectRefused(await get())
    })

    it('a live read that fails', async () => {
      liveIs(async () => ({ conference: null, error: new Error('timeout') }))
      await expectRefused(await get())
    })

    it('a live read that throws, logged as an outage', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      liveIs(async () => {
        throw new Error('Sanity is down')
      })
      await expectRefused(await get())
      expect(logged).toHaveBeenCalledWith(
        'Photo Wall export: could not check the organizer',
        expect.objectContaining({ message: 'Sanity is down' }),
      )
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
        ? new Response('oops', { status: 500 })
        : new Response(bytesOf(url), { status: 200 }),
    )
    const response = await get()
    await expect(response.arrayBuffer()).rejects.toThrow(
      'Photo wallPost-a5 could not be fetched (500)',
    )
  })

  it('never fetches a photo URL off our own project’s CDN', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.photos.mockResolvedValue([
      {
        ...PHOTOS[0],
        url: 'https://evil.example/images/proj/production/a.jpg',
      },
    ])
    const response = await get()
    expect(response.status).toBe(502)
    expect(h.upstream).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalled()
  })
})
