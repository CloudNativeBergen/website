/**
 * @vitest-environment node
 *
 * The move against the REAL `@sanity/client` and a local HTTP server standing
 * in for Sanity's asset endpoint. The unit tests mock the client; this is the
 * evidence for what they assume of it: that the body really streams, and that
 * a body which fails mid-upload ABORTS the request instead of hanging it.
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
vi.mock('@/lib/sanity/client', () => ({
  get clientWrite() {
    return h.client
  },
}))

import { moveBlobToSanity } from './move'
import { MARKETING_ASSET_MAX_IMAGE_BYTES } from './image-type'

interface Seen {
  bytes: number
  complete: boolean
  contentType?: string
}
let seen: Seen[] = []
let server: http.Server

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const record: Seen = {
      bytes: 0,
      complete: false,
      contentType: req.headers['content-type'],
    }
    seen.push(record)
    req.on('data', (chunk: Buffer) => (record.bytes += chunk.length))
    req.on('end', () => {
      record.complete = true
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          document: {
            _id: 'image-real-1200x630-png',
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
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_abcstore123_secret')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the move through the real Sanity client', () => {
  it('streams the whole blob to the asset endpoint with the sniffed type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(blobBody(2 * 1024 * 1024))),
    )
    const result = await moveBlobToSanity(URL_OK, 'org-A')
    expect(result).toEqual({
      ok: true,
      asset: {
        _id: 'image-real-1200x630-png',
        url: 'https://cdn.sanity.io/x.png',
        width: 1200,
        height: 630,
      },
    })
    expect(seen).toEqual([
      { bytes: 2 * 1024 * 1024, complete: true, contentType: 'image/png' },
    ])
  })

  it(
    'aborts the half-sent request when the blob passes the limit, and answers',
    { timeout: 60_000 },
    async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
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
      expect(seen[0].bytes).toBeLessThanOrEqual(MARKETING_ASSET_MAX_IMAGE_BYTES)
    },
  )
})
