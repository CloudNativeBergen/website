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
beforeAll(async () => {
  server = http.createServer(() => {
    hits++ // never answers
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
})
