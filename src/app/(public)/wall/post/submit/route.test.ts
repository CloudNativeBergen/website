/**
 * @vitest-environment node
 *
 * `POST /wall/post/submit` (Photo Wall spec §6.2) as Next calls it: a real
 * `Request`, the device cookie as the browser sends it, the conference from
 * the Host. The submit itself runs for real on the versioned in-memory store
 * (`src/lib/photo-wall/submit.sanity.test.ts` covers its every refusal);
 * here: the body limit before and while reading, the cookie, and the status
 * and body of each answer, which the phone decides retry or refusal by.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  uploads: 0,
  cookie: undefined as string | undefined,
  resolution: {} as Record<string, unknown>,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'konf_wall' && h.cookie ? { name, value: h.cookie } : undefined,
  }),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => h.resolution,
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  const clients = h.store.clients as Record<string, Record<string, unknown>>
  return {
    ...clients,
    clientWrite: {
      ...clients.clientWrite,
      assets: {
        upload: async () => {
          h.uploads++
          const asset = {
            _id: 'image-abc-640x480-jpg',
            _type: 'sanity.imageAsset',
          }
          h.store!.put(asset)
          return asset
        },
      },
    },
  }
})

import { issueWallDevice, wallDeviceKey } from '@/lib/photo-wall/device'
import { POST } from './route'

const PHOTO = readFileSync(
  join(
    __dirname,
    '../../../../../../__tests__/fixtures/photo-wall/canvas-chromium.jpg',
  ),
)
const UPLOAD_ID = '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b'
const URL = 'https://2026.example.no/wall/post/submit'
const conference = {
  _id: 'conf-A',
  startDate: '2026-10-26',
  endDate: '2099-10-27',
  domains: ['2026.example.no'],
}

function body(photo: Uint8Array = PHOTO) {
  const form = new FormData()
  form.set('uploadId', UPLOAD_ID)
  form.set('photo', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }))
  form.set('caption', 'Hei')
  form.set('cropX', '0.5')
  form.set('cropY', '0.5')
  form.set('marketingConsent', 'false')
  return form
}

const submit = (init: RequestInit = {}) =>
  POST(new Request(URL, { method: 'POST', body: body(), ...init }))

let device: ReturnType<typeof issueWallDevice>

beforeEach(() => {
  h.uploads = 0
  h.resolution = { conference, error: null, status: 'resolved' }
  device = issueWallDevice()
  h.cookie = device.value
  h.store!.reset([
    {
      _id: 'photoWall-conf-A',
      _type: 'photoWall',
      conference: { _type: 'reference', _ref: 'conf-A' },
      postingMode: 'open',
    },
  ])
})

describe('POST /wall/post/submit', () => {
  it('creates the post for the cookie’s device: 200 { ok: true }', async () => {
    const response = await submit()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(h.store!.doc(`wallPost-${UPLOAD_ID}`)).toMatchObject({
      deviceKey: wallDeviceKey(device.token),
      conference: { _ref: 'conf-A' },
      caption: 'Hei',
    })
  })

  it('answers a retry of the same uploadId 200 without uploading again', async () => {
    await submit()
    const retry = await submit()
    expect(retry.status).toBe(200)
    expect(h.uploads).toBe(1)
  })

  it('refuses a Content-Length over 4.5 MB with 413 before reading the body', async () => {
    let pulled = false
    // No eager pull: only a reader asks for bytes.
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled = true
          controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    const response = await POST(
      new Request(URL, {
        method: 'POST',
        body: stream,
        headers: {
          'content-length': '4500001',
          'content-type': 'multipart/form-data; boundary=x',
        },
        duplex: 'half',
      } as RequestInit),
    )
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      refusal: 'failed',
    })
    expect(pulled).toBe(false)
    expect(h.uploads).toBe(0)
  })

  it('accepts a body of exactly 4.5 MB by Content-Length (the limit is inclusive)', async () => {
    const encoded = new Response(body())
    const bytes = new Uint8Array(await encoded.arrayBuffer())
    const response = await POST(
      new Request(URL, {
        method: 'POST',
        body: bytes,
        headers: {
          'content-type': encoded.headers.get('content-type')!,
          // Claimed, not real: only the header is checked before reading.
          'content-length': '4500000',
        },
      }),
    )
    expect(response.status).toBe(200)
  })

  it('refuses a body without Content-Length once more than 4.5 MB of it has arrived', async () => {
    const chunk = new Uint8Array(1_000_000)
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent++
        controller.enqueue(chunk)
        if (sent === 20) controller.close()
      },
    })
    const response = await POST(
      new Request(URL, {
        method: 'POST',
        body: stream,
        headers: { 'content-type': 'multipart/form-data; boundary=x' },
        duplex: 'half',
      } as RequestInit),
    )
    expect(response.status).toBe(413)
    // It stopped reading at the limit, not at the end of the body.
    expect(sent).toBeLessThan(8)
    expect(h.uploads).toBe(0)
  })

  it('refuses a body that is not multipart with 400', async () => {
    const response = await submit({
      body: 'uploadId=x',
      headers: { 'content-type': 'text/plain' },
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      refusal: 'failed',
    })
  })

  it('refuses without a cookie: 400, nothing uploaded', async () => {
    h.cookie = undefined
    const response = await submit()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      refusal: 'failed',
    })
    expect(h.uploads).toBe(0)
  })

  it('refuses a cookie whose signature does not verify', async () => {
    const [data] = device.value.split('.')
    h.cookie = `${data}.${'A'.repeat(43)}`
    expect((await submit()).status).toBe(400)
    expect(h.uploads).toBe(0)
  })

  it('answers a limit 429 with the limit named', async () => {
    for (let i = 0; i < 3; i++) {
      h.store!.put({
        _id: `wallPost-seed-${i}`,
        _type: 'wallPost',
        conference: { _type: 'reference', _ref: 'conf-A' },
        deviceKey: wallDeviceKey(device.token),
        status: 'pending',
        submittedAt: '2026-01-01T00:00:00Z',
      })
    }
    const response = await submit()
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      refusal: 'pendingDevice',
    })
  })

  it('answers posting not open 403 closed', async () => {
    h.store!.put({
      ...h.store!.doc('photoWall-conf-A')!,
      postingMode: 'paused',
    })
    const response = await submit()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      refusal: 'closed',
    })
  })

  it('refuses on a host with no conference: 404, nothing uploaded', async () => {
    h.resolution = { conference: {}, status: 'not-found' }
    const response = await submit()
    expect(response.status).toBe(404)
    expect(h.uploads).toBe(0)
  })

  it('throws (a 5xx the phone retries) when the conference read failed', async () => {
    h.resolution = { conference: {}, status: 'unavailable' }
    await expect(submit()).rejects.toThrow(/Could not read the conference/)
    expect(h.uploads).toBe(0)
  })
})
