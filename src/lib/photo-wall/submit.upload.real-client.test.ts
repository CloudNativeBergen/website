/**
 * @vitest-environment node
 *
 * What the upload of a Submit SENDS (Photo Wall spec §5, §14): the REAL
 * `@sanity/client` (the very package `next-sanity`'s `createClient` builds
 * `src/lib/sanity/client.ts` with; `next-sanity` itself is aliased to a mock
 * suite-wide, so the first test pins that the two resolve alike) uploads to a local HTTP server
 * standing in for Sanity's asset endpoint, and the test reads the request it
 * received. The reads and the create run on the versioned in-memory store;
 * only `clientWrite.assets` is the real client's.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { createClient, type SanityClient } from '@sanity/client'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  real: null as null | SanityClient,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  const clients = h.store.clients as Record<string, Record<string, unknown>>
  return {
    ...clients,
    clientWrite: {
      ...clients.clientWrite,
      get assets() {
        return h.real!.assets
      },
    },
  }
})

import { submitWallPost } from './submit'

const PHOTO = readFileSync(
  join(__dirname, '../../../__tests__/fixtures/photo-wall/canvas-chromium.jpg'),
)
const UPLOAD_ID = '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b'

interface Received {
  method?: string
  url: URL
  contentType?: string
  body: Buffer
}
let received: Received[] = []
let server: http.Server

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      received.push({
        method: req.method,
        url: new URL(req.url ?? '', 'http://local'),
        contentType: req.headers['content-type'],
        body: Buffer.concat(chunks),
      })
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          document: {
            _id: 'image-abc123-640x480-jpg',
            _type: 'sanity.imageAsset',
          },
        }),
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  h.real = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2023-05-03',
    token: 'test',
    useCdn: false,
    requestTagPrefix: 'web.write',
    useProjectHostname: false,
    apiHost: `http://127.0.0.1:${port}`,
  })
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

beforeEach(() => {
  received = []
  h.store!.reset([
    {
      _id: 'photoWall-conf-A',
      _type: 'photoWall',
      conference: { _type: 'reference', _ref: 'conf-A' },
      postingMode: 'open',
    },
  ])
})

it('is the @sanity/client next-sanity builds the production clients with', () => {
  const require = createRequire(import.meta.url)
  const fromNextSanity = createRequire(require.resolve('next-sanity'))
  expect(require.resolve('@sanity/client/package.json')).toBe(
    fromNextSanity.resolve('@sanity/client/package.json'),
  )
})

it('the upload request carries sourceName=photo-wall, the conference as sourceId, the filename and meta=none, with the bytes as sent', async () => {
  const form = new FormData()
  form.set('uploadId', UPLOAD_ID)
  form.set('photo', new Blob([new Uint8Array(PHOTO)], { type: 'image/jpeg' }))
  form.set('cropX', '0.5')
  form.set('cropY', '0.5')
  form.set('marketingConsent', 'false')

  await expect(
    submitWallPost({
      conference: { _id: 'conf-A', endDate: '2026-10-27' },
      device: { token: 't', key: 'a'.repeat(32) },
      form,
      now: new Date('2026-10-26T10:00:00.000Z'),
    }),
  ).resolves.toEqual({ ok: true })

  expect(received).toHaveLength(1)
  const [request] = received
  expect(request.method).toBe('POST')
  expect(request.url.pathname).toBe('/v2023-05-03/assets/images/test')
  expect(Object.fromEntries(request.url.searchParams)).toEqual({
    filename: `${UPLOAD_ID}.jpg`,
    meta: 'none',
    sourceId: 'conf-A',
    sourceName: 'photo-wall',
    tag: 'web.write',
  })
  expect(request.contentType).toBe('image/jpeg')
  expect(Buffer.compare(request.body, PHOTO)).toBe(0)
  // The post references the asset the endpoint answered with.
  expect(h.store!.doc(`wallPost-${UPLOAD_ID}`)?.photo).toEqual({
    _type: 'image',
    asset: { _type: 'reference', _ref: 'image-abc123-640x480-jpg' },
  })
})
