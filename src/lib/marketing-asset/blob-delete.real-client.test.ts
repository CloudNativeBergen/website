/**
 * @vitest-environment node
 *
 * The bounded blob delete against the REAL `@vercel/blob` and a local server
 * that never answers. A mock cannot show this: the library stops retrying only
 * for an `AbortError`, and `AbortSignal.timeout()` produces a `TimeoutError`,
 * which it retries (up to ten times, with growing waits) — measured, the
 * "bounded" delete then ran on past eight seconds.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteBlobWithin } from './blob-delete'

let server: http.Server
let hits = 0
/** 'hang' never answers; '503' fails at once, so the library retries. */
let mode: 'hang' | '503' = 'hang'
beforeAll(async () => {
  server = http.createServer((_req, res) => {
    hits++
    if (mode === '503') {
      res.statusCode = 503
      res.end('{"error":{"code":"service_unavailable"}}')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  vi.stubEnv('VERCEL_BLOB_API_URL', `http://127.0.0.1:${port}`)
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_store123_secret')
})
afterAll(async () => {
  vi.unstubAllEnvs()
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('deleteBlobWithin', () => {
  it('gives up at its deadline against a Blob API that never answers', async () => {
    mode = 'hang'
    const started = Date.now()
    await expect(
      deleteBlobWithin(
        'https://store123.public.blob.vercel-storage.com/marketing-asset/org-A/1790000000000-a.png',
        300,
      ),
    ).rejects.toBeTruthy()
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(hits).toBeGreaterThan(0)
  })

  it('gives up at its deadline during a retry wait against a failing Blob API', async () => {
    // Each 5xx starts a retry wait of 1–2 s, doubling; the library does not
    // watch the signal during a wait, so the deadline must not rely on it.
    mode = '503'
    hits = 0
    const started = Date.now()
    await expect(
      deleteBlobWithin(
        'https://store123.public.blob.vercel-storage.com/marketing-asset/org-A/1790000000000-a.png',
        300,
      ),
    ).rejects.toBeTruthy()
    // The first retry wait is 1–2 s: without the race nothing returns before
    // ~1 s, so this bound separates the two with room for a slow runner.
    expect(Date.now() - started).toBeLessThan(900)
    expect(hits).toBeGreaterThan(0)
  })
})
