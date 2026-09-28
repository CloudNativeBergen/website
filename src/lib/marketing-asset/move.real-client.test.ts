/**
 * @vitest-environment node
 *
 * The move against a local HTTP server standing in for Sanity's asset
 * endpoint, through the REAL upload (`./sanity-upload`: our own `fetch`, with
 * the real client only building the URL). The unit tests fake the upload;
 * this is the evidence for what they assume of it: that the body really
 * streams — backpressure from a server that stops reading reaches the blob —
 * and that a body which fails mid-upload ABORTS the request instead of
 * hanging it.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createClient, type SanityClient } from '@sanity/client'

const h = vi.hoisted(() => ({ client: null as SanityClient | null }))
vi.mock('server-only', () => ({}))
vi.mock('@vercel/blob', () => ({ del: vi.fn(async () => undefined) }))
vi.mock('next/server', () => ({ after: () => {} }))
vi.mock('@/lib/sanity/client', () => ({
  get clientWrite() {
    return h.client
  },
}))

import {
  moveAudioBlobToSanity,
  moveBlobToSanity,
  moveGifBlobToSanity,
  moveVideoBlobToSanity,
} from './move'
import { MARKETING_ASSET_MAX_IMAGE_BYTES } from './image-type'
import {
  MARKETING_ASSET_MAX_GIF_BYTES,
  MARKETING_ASSET_MAX_VIDEO_BYTES,
} from './motion-type'
import { mp3OfSeconds } from './__tests__/audio-fixtures'

interface Seen {
  bytes: number
  complete: boolean
  /** The client closed the request before sending all of it. */
  aborted: boolean
  contentType?: string
}
let seen: Seen[] = []
/** The request path of each upload: `/…/assets/images/…` or `/…/files/…`. */
let paths: string[] = []
let server: http.Server
/** A server that stops reading, to prove the move waits for it. */
const stall: { on: boolean; release: () => void } = {
  on: false,
  release: () => {},
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const record: Seen = {
      bytes: 0,
      complete: false,
      aborted: false,
      contentType: req.headers['content-type'],
    }
    seen.push(record)
    paths.push(req.url ?? '')
    req.on('data', (chunk: Buffer) => (record.bytes += chunk.length))
    // Sanity stops reading until the test lets it go on. After the `data`
    // listener, which would otherwise set the request flowing again.
    if (stall.on) {
      req.pause()
      stall.release = () => req.resume()
    }
    req.on('close', () => {
      if (!req.complete) record.aborted = true
    })
    req.on('end', () => {
      record.complete = true
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          document: {
            _id: 'image-real-1200x630-png',
            _createdAt: new Date().toISOString(),
            url: 'https://cdn.sanity.io/x.png',
            metadata: { dimensions: { width: 1200, height: 630 } },
          },
        }),
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  h.client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2023-05-03',
    token: 'test',
    useCdn: false,
    useProjectHostname: false,
    apiHost: `http://127.0.0.1:${port}`,
  })
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const HOST = 'abcstore123.public.blob.vercel-storage.com'

/**
 * The blob's `fetch` answered by the test; every other request — the upload
 * to the local "Sanity" — goes out for real.
 */
const realFetch = globalThis.fetch
function blobFetch(answer: () => Promise<Response>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    new URL(String(input)).hostname === HOST
      ? answer()
      : realFetch(input, init),
  )
}
const URL_OK = `https://${HOST}/marketing-asset/org-A/1790000000000-logo-X1.png`
const CHUNK = 256 * 1024

/**
 * A PNG-headed body of `total` bytes in 256 KB chunks, each a moment apart,
 * as a network would deliver it, so the request to Sanity is under way.
 */
function blobBody(total: number) {
  let sent = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, 2))
      if (sent >= total) return controller.close()
      const chunk = new Uint8Array(Math.min(CHUNK, total - sent))
      if (sent === 0)
        chunk.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      sent += chunk.length
      controller.enqueue(chunk)
    },
  })
}

beforeEach(() => {
  seen = []
  paths = []
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_abcstore123_secret')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the audio move through the real Sanity client (#1178)', () => {
  it('uploads the whole track to the FILE asset endpoint with the sniffed type', async () => {
    const track = mp3OfSeconds(5)
    vi.stubGlobal(
      'fetch',
      blobFetch(async () => new Response(new Uint8Array(track))),
    )
    const result = await moveAudioBlobToSanity(
      URL_OK.replace('logo-X1.png', 'theme-X1.mp3'),
      'org-A',
    )
    expect(result.ok).toBe(true)
    expect(seen).toEqual([
      {
        bytes: track.length,
        complete: true,
        aborted: false,
        contentType: 'audio/mpeg',
      },
    ])
    expect(paths[0]).toMatch(/\/assets\/files\/test\?/)
    expect(paths[0]).toContain('filename=theme-X1.mp3')
  })
})

describe('the move through the real Sanity client', () => {
  it('streams the whole blob to the asset endpoint with the sniffed type', async () => {
    vi.stubGlobal(
      'fetch',
      blobFetch(async () => new Response(blobBody(2 * 1024 * 1024))),
    )
    const result = await moveBlobToSanity(URL_OK, 'org-A')
    expect(result).toEqual({
      ok: true,
      asset: {
        _id: 'image-real-1200x630-png',
        url: 'https://cdn.sanity.io/x.png',
        width: 1200,
        height: 630,
        created: true,
      },
    })
    expect(seen).toEqual([
      {
        bytes: 2 * 1024 * 1024,
        complete: true,
        aborted: false,
        contentType: 'image/png',
      },
    ])
  })

  it(
    'aborts the half-sent request when the blob passes the limit, and answers',
    { timeout: 60_000 },
    async () => {
      vi.stubGlobal(
        'fetch',
        blobFetch(
          async () =>
            new Response(blobBody(MARKETING_ASSET_MAX_IMAGE_BYTES + CHUNK)),
        ),
      )
      const started = Date.now()
      const result = await moveBlobToSanity(URL_OK, 'org-A')
      expect(result).toEqual({ ok: false, reason: 'size' })
      // Answered by the abort, not rescued by the 45 s upload deadline.
      expect(Date.now() - started).toBeLessThan(5_000)
      // Let the server observe the closed socket.
      await vi.waitFor(() => expect(seen[0]?.bytes).toBeGreaterThan(0))
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(seen).toHaveLength(1)
      expect(seen[0].complete).toBe(false)
      // Closed by the client, not merely left hanging half-sent.
      await vi.waitFor(() => expect(seen[0].aborted).toBe(true))
      expect(seen[0].bytes).toBeLessThanOrEqual(MARKETING_ASSET_MAX_IMAGE_BYTES)
    },
  )
})

/** How many bytes of the blob the move has pulled so far. */
let pulled = 0

/**
 * A body of `total` bytes in 1 MiB chunks, each a FRESH buffer, starting with
 * `head`. Pulled only as the move asks for more.
 */
function freshBody(total: number, head: number[]) {
  const MIB = 1024 * 1024
  pulled = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise((resolve) => setImmediate(resolve))
      if (pulled >= total) return controller.close()
      const chunk = new Uint8Array(Math.min(MIB, total - pulled))
      if (pulled === 0) chunk.set(head)
      pulled += chunk.length
      controller.enqueue(chunk)
    },
  })
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const MP4_HEAD = [0, 0, 0, 0x20, ...ascii('ftypisom')]
const MOV_HEAD = [0, 0, 0, 0x14, ...ascii('ftypqt  ')]
const GIF_HEAD = ascii('GIF89a')
const VIDEO_URL = URL_OK.replace('logo-X1.png', 'clip-X1.mp4')

describe('the video move through the real Sanity client (#1167)', () => {
  it(
    'streams a 100 MiB MP4 to the FILE endpoint without holding it',
    { timeout: 120_000 },
    async () => {
      vi.stubGlobal(
        'fetch',
        blobFetch(
          async () =>
            new Response(freshBody(MARKETING_ASSET_MAX_VIDEO_BYTES, MP4_HEAD)),
        ),
      )
      stall.on = true
      const moving = moveVideoBlobToSanity(VIDEO_URL, 'org-A')
      // Sanity has stopped reading. A streamed move stops pulling once the
      // socket's buffers are full; one that read the file whole would pull
      // all 100 MiB whatever Sanity does. Wait until the pulling settles.
      await vi.waitFor(() => expect(seen).toHaveLength(1), { timeout: 10_000 })
      let last = -1
      while (pulled !== last) {
        last = pulled
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
      const heldBack = pulled
      stall.on = false
      stall.release()
      const result = await moving
      expect(result.ok).toBe(true)
      // Backpressure reached the blob: a few MiB of socket buffer, never
      // the file.
      expect(heldBack).toBeLessThan(40 * 1024 * 1024)
      expect(seen).toEqual([
        {
          bytes: MARKETING_ASSET_MAX_VIDEO_BYTES,
          complete: true,
          aborted: false,
          contentType: 'video/mp4',
        },
      ])
      expect(paths[0]).toMatch(/\/assets\/files\/test\?/)
    },
  )

  it(
    'aborts an MP4 one chunk past 100 MiB and refuses it as too large',
    { timeout: 120_000 },
    async () => {
      vi.stubGlobal(
        'fetch',
        blobFetch(
          async () =>
            new Response(
              freshBody(
                MARKETING_ASSET_MAX_VIDEO_BYTES + 1024 * 1024,
                MP4_HEAD,
              ),
            ),
        ),
      )
      const result = await moveVideoBlobToSanity(VIDEO_URL, 'org-A')
      expect(result).toEqual({ ok: false, reason: 'size' })
      await vi.waitFor(() => expect(seen[0]?.aborted).toBe(true))
      expect(seen[0].complete).toBe(false)
      expect(seen[0].bytes).toBeLessThanOrEqual(MARKETING_ASSET_MAX_VIDEO_BYTES)
    },
  )

  it('refuses a QuickTime .mov before a byte reaches Sanity', async () => {
    vi.stubGlobal(
      'fetch',
      blobFetch(async () => new Response(freshBody(4 * 1024 * 1024, MOV_HEAD))),
    )
    const result = await moveVideoBlobToSanity(
      VIDEO_URL.replace('.mp4', '.mov'),
      'org-A',
    )
    expect(result).toEqual({ ok: false, reason: 'type' })
    expect(seen).toEqual([])
  })
})

describe('the GIF move through the real Sanity client (#1167)', () => {
  const GIF_URL = URL_OK.replace('logo-X1.png', 'wave-X1.gif')

  it('streams a GIF to the IMAGE endpoint as image/gif', async () => {
    vi.stubGlobal(
      'fetch',
      blobFetch(async () => new Response(freshBody(3 * 1024 * 1024, GIF_HEAD))),
    )
    const result = await moveGifBlobToSanity(GIF_URL, 'org-A')
    expect(result.ok).toBe(true)
    expect(seen).toEqual([
      {
        bytes: 3 * 1024 * 1024,
        complete: true,
        aborted: false,
        contentType: 'image/gif',
      },
    ])
    expect(paths[0]).toMatch(/\/assets\/images\/test\?/)
  })

  it('refuses a GIF over 10 MB, and a PNG sent as a GIF', async () => {
    vi.stubGlobal(
      'fetch',
      blobFetch(
        async () =>
          new Response(
            freshBody(MARKETING_ASSET_MAX_GIF_BYTES + 1024 * 1024, GIF_HEAD),
          ),
      ),
    )
    expect(await moveGifBlobToSanity(GIF_URL, 'org-A')).toEqual({
      ok: false,
      reason: 'size',
    })
    vi.stubGlobal(
      'fetch',
      blobFetch(
        async () =>
          new Response(
            freshBody(1024, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          ),
      ),
    )
    seen = []
    expect(await moveGifBlobToSanity(GIF_URL, 'org-A')).toEqual({
      ok: false,
      reason: 'type',
    })
    expect(seen).toEqual([])
  })
})
