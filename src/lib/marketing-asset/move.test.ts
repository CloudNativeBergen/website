/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Readable } from 'node:stream'

const h = vi.hoisted(() => ({
  upload: vi.fn(),
  del: vi.fn(),
  uploadedBytes: 0,
  uploadedType: '' as string | undefined,
  aborted: false,
  cancelled: false,
  pulls: 0,
  // Work handed to `after()`: it runs once the response has gone.
  afterTasks: [] as (() => Promise<unknown> | unknown)[],
  syncThrow: false,
  handlerThrew: undefined as unknown,
}))
vi.mock('next/server', () => ({
  after: (task: () => Promise<unknown>) => h.afterTasks.push(task),
}))
vi.mock('server-only', () => ({}))
vi.mock('@vercel/blob', () => ({ del: h.del }))
vi.mock('@/lib/sanity/client', () => ({
  // The observable API, shaped like the real client's: it reads the body but,
  // like the real one, never reacts to the body stream failing, and an
  // unsubscribe is how a request is aborted — so the mock records it.
  clientWrite: {
    observable: {
      assets: {
        upload: (...args: unknown[]) => ({
          subscribe(observer: {
            next: (event: unknown) => void
            error: (error: unknown) => void
          }) {
            // The real client validates options synchronously inside
            // subscribe, so a bad request errors before subscribe returns.
            // Like rxjs, an error thrown BY the error handler is not the
            // subscriber's problem: it is reported elsewhere (rxjs rethrows it
            // on a later tick) and subscribe returns normally.
            if (h.syncThrow) {
              try {
                observer.error(new Error('invalid options'))
              } catch (thrown) {
                h.handlerThrew = thrown
              }
              return { unsubscribe() {} }
            }
            let open = true
            h.upload(...args).then(
              (document: unknown) => {
                if (!open) return
                open = false
                observer.next({ type: 'response', body: { document } })
              },
              (error: unknown) => {
                if (!open) return
                open = false
                observer.error(error)
              },
            )
            return {
              unsubscribe() {
                if (open) h.aborted = true
                open = false
              },
            }
          },
        }),
      },
    },
  },
}))

import { moveBlobToSanity } from './move'
import {
  MARKETING_ASSET_MAX_IMAGE_BYTES,
  SANITY_UPLOAD_DEADLINE_MS,
} from './image-type'

const HOST = 'abcstore123.public.blob.vercel-storage.com'
const ORG = 'org-A'
const URL_OK = `https://${HOST}/marketing-asset/${ORG}/1790000000000-logo-Xy12Ab.png`
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** A body delivered in small chunks, so the move must stream, not assume. */
function body(bytes: Uint8Array, chunk = 5) {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    cancel() {
      h.cancelled = true
    },
    pull(controller) {
      h.pulls++
      if (offset >= bytes.length) return controller.close()
      controller.enqueue(bytes.slice(offset, offset + chunk))
      offset += chunk
    },
  })
}
function png(size: number) {
  const bytes = new Uint8Array(size)
  bytes.set(PNG_HEAD)
  return bytes
}
function respond(bytes: Uint8Array, headers: Record<string, string> = {}) {
  return new Response(body(bytes), { status: 200, headers })
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  h.aborted = false
  h.afterTasks = []
  h.syncThrow = false
  h.handlerThrew = undefined
  h.cancelled = false
  h.pulls = 0
  vi.stubEnv('BLOB_STORE_ID', 'store_abcstore123')
  vi.stubGlobal('fetch', fetchMock)
  h.del.mockResolvedValue(undefined)
  h.upload.mockImplementation(
    async (
      _kind: string,
      stream: Readable,
      options: { contentType?: string },
    ) => {
      h.uploadedType = options.contentType
      h.uploadedBytes = 0
      // Read like an HTTP client pipes a body: on `data`/`end` only. A body
      // that fails therefore never settles this — as with the real client.
      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => (h.uploadedBytes += chunk.length))
        stream.on('end', resolve)
      })
      return {
        _id: 'image-abc-1200x630-png',
        _createdAt: new Date().toISOString(),
        url: 'https://cdn.sanity.io/x.png',
        metadata: { dimensions: { width: 1200, height: 630 } },
      }
    },
  )
})

/** Run what the move handed to `after()`, as Next does after responding. */
async function runAfter() {
  const tasks = h.afterTasks.splice(0)
  for (const task of tasks) await task()
}
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the move refuses a URL it does not own BEFORE fetching it', () => {
  it.each([
    ['a foreign host', URL_OK.replace(HOST, 'evil.example')],
    ['another Blob store', URL_OK.replace('abcstore123', 'otherstore')],
    ['another organization', URL_OK.replace(ORG, 'org-B')],
    ['a proposal attachment', `https://${HOST}/proposal-x-1790000000000-a.pdf`],
  ])('%s', async (_, url) => {
    const result = await moveBlobToSanity(url, ORG)
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.upload).not.toHaveBeenCalled()
    // A URL we do not own is never deleted either, now or after responding.
    expect(h.afterTasks).toEqual([])
    expect(h.del).not.toHaveBeenCalled()
  })

  it('refuses everything when the store host is not configured', async () => {
    vi.stubEnv('BLOB_STORE_ID', '')
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '')
    expect((await moveBlobToSanity(URL_OK, ORG)).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the move checks the file itself', () => {
  it('streams a real PNG into Sanity with the sniffed type and deletes the blob', async () => {
    fetchMock.mockResolvedValue(respond(png(1000)))
    const result = await moveBlobToSanity(URL_OK, ORG)
    expect(result).toEqual({
      ok: true,
      asset: {
        _id: 'image-abc-1200x630-png',
        url: 'https://cdn.sanity.io/x.png',
        width: 1200,
        height: 630,
        created: true,
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      URL_OK,
      expect.objectContaining({ redirect: 'error' }),
    )
    expect(h.uploadedBytes).toBe(1000)
    expect(h.uploadedType).toBe('image/png')
    await runAfter()
    expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
  })

  it('refuses a file whose bytes are not an allowed image, whatever its name says', async () => {
    const gif = new TextEncoder().encode('GIF89a-this-is-not-a-png')
    fetchMock.mockResolvedValue(respond(gif, { 'content-type': 'image/png' }))
    expect(await moveBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'type',
    })
    expect(h.upload).not.toHaveBeenCalled()
    await runAfter()
    expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
  })

  it('refuses a declared size over the limit without reading the body', async () => {
    fetchMock.mockResolvedValue(
      respond(png(100), {
        'content-length': String(MARKETING_ASSET_MAX_IMAGE_BYTES + 1),
      }),
    )
    expect(await moveBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'size',
    })
    // A stream pulls once on construction to fill its queue; nothing past that.
    expect(h.pulls).toBeLessThanOrEqual(1)
    expect(h.cancelled).toBe(true)
    expect(h.upload).not.toHaveBeenCalled()
    await runAfter()
    expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
  })

  it('refuses a body that turns out larger than the limit, whatever the header said', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        body(png(MARKETING_ASSET_MAX_IMAGE_BYTES + 10), 1024 * 1024),
        {
          headers: { 'content-length': '1000' },
        },
      ),
    )
    expect(await moveBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'size',
    })
    expect(h.uploadedBytes).toBeLessThanOrEqual(MARKETING_ASSET_MAX_IMAGE_BYTES)
    // The half-sent request to Sanity is aborted, not left hanging.
    expect(h.aborted).toBe(true)
    await runAfter()
    expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
  })

  it('reports a failed fetch and still deletes the blob', async () => {
    fetchMock.mockResolvedValue(new Response('gone', { status: 404 }))
    expect(await moveBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'fetch',
    })
    await runAfter()
    expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
  })

  it('reports a failed Sanity upload and still deletes the blob', async () => {
    fetchMock.mockResolvedValue(respond(png(100)))
    h.upload.mockRejectedValue(new Error('sanity down'))
    expect(await moveBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'upload',
    })
    // Nobody will read the rest of the blob: it is let go, not left open.
    expect(h.cancelled).toBe(true)
    await runAfter()
    expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
  })

  it('answers a blob that fails while its type is read, and still deletes it', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.error(new Error('connection reset'))
          },
        }),
      ),
    )
    expect(await moveBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'fetch',
    })
    expect(h.upload).not.toHaveBeenCalled()
    await runAfter()
    expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
  })

  it('answers a blob that fails mid-upload as a failed read, and aborts the upload', async () => {
    let sent = false
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            if (sent) return controller.error(new Error('connection reset'))
            sent = true
            controller.enqueue(png(100))
          },
        }),
      ),
    )
    expect(await moveBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'fetch',
    })
    expect(h.aborted).toBe(true)
    await runAfter()
    expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
  })

  it('gives up on a Sanity upload that never answers, before the route is killed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      fetchMock.mockResolvedValue(respond(png(100)))
      h.upload.mockImplementation(() => new Promise(() => {}))
      const moved = moveBlobToSanity(URL_OK, ORG)
      await vi.advanceTimersByTimeAsync(SANITY_UPLOAD_DEADLINE_MS - 1)
      expect(h.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await moved).toEqual({ ok: false, reason: 'upload' })
      expect(h.aborted).toBe(true)
      await runAfter()
      expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers before the blob is deleted: a slow, retrying delete runs after the response', async () => {
    fetchMock.mockResolvedValue(respond(png(100)))
    h.del.mockImplementation(() => new Promise(() => {}))
    expect((await moveBlobToSanity(URL_OK, ORG)).ok).toBe(true)
    // Nothing deleted yet: the delete is queued for after the response...
    expect(h.del).not.toHaveBeenCalled()
    expect(h.afterTasks).toHaveLength(1)
    void h.afterTasks[0]()
    // ...and bounded, so a Blob outage cannot hold the function open.
    const [, options] = h.del.mock.calls[0]
    expect(options.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('aborts a blob fetch that outlives the move deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      let aborted = false
      fetchMock.mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_, reject) =>
            init.signal.addEventListener('abort', () => {
              aborted = true
              reject(init.signal.reason)
            }),
          ),
      )
      const moved = moveBlobToSanity(URL_OK, ORG)
      await vi.advanceTimersByTimeAsync(SANITY_UPLOAD_DEADLINE_MS - 1)
      expect(aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(aborted).toBe(true)
      expect(await moved).toEqual({ ok: false, reason: 'fetch' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers promptly when the Sanity request fails synchronously', async () => {
    h.syncThrow = true
    fetchMock.mockResolvedValue(respond(png(100)))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const moved = moveBlobToSanity(URL_OK, ORG)
      await vi.advanceTimersByTimeAsync(10)
      expect(await moved).toEqual({ ok: false, reason: 'upload' })
      // The error handler itself did not blow up, and no deadline is left.
      expect(h.handlerThrew).toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports an image Sanity already held (identical bytes) as not created by this upload', async () => {
    fetchMock.mockResolvedValue(respond(png(100)))
    h.upload.mockResolvedValue({
      _id: 'image-shared-800x800-png',
      _createdAt: '2020-01-01T00:00:00Z',
      url: 'https://cdn.sanity.io/shared.png',
      metadata: { dimensions: { width: 800, height: 800 } },
    })
    expect(await moveBlobToSanity(URL_OK, ORG)).toMatchObject({
      ok: true,
      asset: { _id: 'image-shared-800x800-png', created: false },
    })
  })

  it('counts an asset stamped a moment before the move started as created (server clocks differ)', async () => {
    fetchMock.mockResolvedValue(respond(png(100)))
    h.upload.mockResolvedValue({
      _id: 'image-fresh-800x800-png',
      _createdAt: new Date(Date.now() - 4_000).toISOString(),
      url: 'https://cdn.sanity.io/fresh.png',
      metadata: { dimensions: { width: 800, height: 800 } },
    })
    expect(await moveBlobToSanity(URL_OK, ORG)).toMatchObject({
      ok: true,
      asset: { created: true },
    })
  })

  it('counts an asset stamped well before the move as NOT created', async () => {
    fetchMock.mockResolvedValue(respond(png(100)))
    h.upload.mockResolvedValue({
      _id: 'image-older-800x800-png',
      _createdAt: new Date(Date.now() - 60_000).toISOString(),
      url: 'https://cdn.sanity.io/older.png',
      metadata: { dimensions: { width: 800, height: 800 } },
    })
    expect(await moveBlobToSanity(URL_OK, ORG)).toMatchObject({
      ok: true,
      asset: { created: false },
    })
  })
})
