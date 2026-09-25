/**
 * @vitest-environment node
 *
 * The audio move (#1178): the same URL check and blob delete as an image, and
 * a track judged from its own bytes — format sniffed, length measured by the
 * real `music-metadata` on real MP3/WAV/M4A bytes. Only the Sanity client and
 * Vercel Blob are mocked (the image move's tests prove the stream plumbing
 * against them).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Readable } from 'node:stream'
import {
  m4aTone,
  mp3OfSeconds,
  mp4WithVideo,
  wavOfSeconds,
} from './__tests__/audio-fixtures'

const h = vi.hoisted(() => ({
  upload: vi.fn(),
  del: vi.fn(),
  afterTasks: [] as (() => Promise<unknown> | unknown)[],
}))
vi.mock('next/server', () => ({
  after: (task: () => Promise<unknown>) => h.afterTasks.push(task),
}))
vi.mock('server-only', () => ({}))
vi.mock('@vercel/blob', () => ({ del: h.del }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    observable: {
      assets: {
        upload: (...args: unknown[]) => ({
          subscribe(observer: { next: (event: unknown) => void }) {
            void h
              .upload(...args)
              .then((document: unknown) =>
                observer.next({ type: 'response', body: { document } }),
              )
            return { unsubscribe() {} }
          },
        }),
      },
    },
  },
}))

import { moveAudioBlobToSanity } from './move'
import { MARKETING_ASSET_MAX_AUDIO_BYTES } from './audio-type'

const HOST = 'abcstore123.public.blob.vercel-storage.com'
const ORG = 'org-A'
const URL_OK = `https://${HOST}/marketing-asset/${ORG}/1790000000000-theme-Xy12Ab.mp3`

const fetchMock = vi.fn()
const respond = (bytes: Uint8Array, headers: Record<string, string> = {}) =>
  new Response(new Blob([new Uint8Array(bytes)]).stream(), {
    status: 200,
    headers,
  })

let uploaded: { kind: string; bytes: number; type?: string } | null
beforeEach(() => {
  vi.clearAllMocks()
  h.afterTasks = []
  uploaded = null
  vi.stubEnv('BLOB_STORE_ID', 'store_abcstore123')
  vi.stubGlobal('fetch', fetchMock)
  h.del.mockResolvedValue(undefined)
  h.upload.mockImplementation(
    async (
      kind: string,
      stream: Readable,
      options: { contentType?: string },
    ) => {
      let bytes = 0
      for await (const chunk of stream) bytes += (chunk as Buffer).length
      uploaded = { kind, bytes, type: options.contentType }
      return {
        _id: 'file-abc-mp3',
        _createdAt: new Date().toISOString(),
        url: 'https://cdn.sanity.io/files/x.mp3',
      }
    },
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the audio move', () => {
  it.each([
    ['an MP3', mp3OfSeconds(4), 'audio/mpeg', 4],
    ['an M4A', m4aTone(), 'audio/mp4', 1],
    ['a WAV', wavOfSeconds(2), 'audio/wav', 2],
  ] as const)(
    'stores %s as a Sanity FILE with its sniffed type and measured length',
    async (_, bytes, type, seconds) => {
      // The blob's own content type lies; it is never consulted.
      fetchMock.mockResolvedValue(
        respond(bytes, { 'content-type': 'image/png' }),
      )
      const result = await moveAudioBlobToSanity(URL_OK, ORG)
      expect(result.ok && result.asset).toMatchObject({
        _id: 'file-abc-mp3',
        mimeType: type,
        created: true,
      })
      expect(result.ok && result.asset.durationSeconds).toBeCloseTo(seconds, 0)
      expect(uploaded).toEqual({ kind: 'file', bytes: bytes.length, type })
      // Nothing stays in Blob.
      for (const task of h.afterTasks.splice(0)) await task()
      expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
    },
  )

  it('refuses a track over ten minutes, under the size cap, before Sanity', async () => {
    const long = mp3OfSeconds(610)
    expect(long.length).toBeLessThan(MARKETING_ASSET_MAX_AUDIO_BYTES)
    fetchMock.mockResolvedValue(respond(long))
    expect(await moveAudioBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'length',
    })
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('takes a track of exactly ten minutes less a frame', async () => {
    fetchMock.mockResolvedValue(respond(mp3OfSeconds(599.9)))
    expect((await moveAudioBlobToSanity(URL_OK, ORG)).ok).toBe(true)
  })

  it('refuses a file over 20 MB by its bytes, whatever its header says', async () => {
    const big = new Uint8Array(MARKETING_ASSET_MAX_AUDIO_BYTES + 1)
    big.set(wavOfSeconds(0.01).subarray(0, 44))
    fetchMock.mockResolvedValue(respond(big, { 'content-length': '10' }))
    expect(await moveAudioBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'size',
    })
    expect(h.upload).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a PNG',
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    ['an MP4 with a video track', mp4WithVideo()],
    ['a WAV with no length', new TextEncoder().encode('RIFF0000WAVEgarbage')],
  ])('refuses %s as the wrong type', async (_, bytes) => {
    fetchMock.mockResolvedValue(
      respond(bytes, { 'content-type': 'audio/mpeg' }),
    )
    expect(await moveAudioBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'type',
    })
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('refuses a URL outside this organization without fetching or deleting it', async () => {
    const result = await moveAudioBlobToSanity(
      URL_OK.replace(ORG, 'org-B'),
      ORG,
    )
    expect(result).toEqual({ ok: false, reason: 'prefix' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.afterTasks).toEqual([])
  })
})
