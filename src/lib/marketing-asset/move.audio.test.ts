/**
 * @vitest-environment node
 *
 * The audio move (#1178): the same URL check and blob delete as an image, and
 * a track judged from its own bytes — format sniffed, length measured by
 * `measureAudio` on real MP3/WAV/M4A bytes. Only the Sanity client and
 * Vercel Blob are mocked (the image move's tests prove the stream plumbing
 * against them).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Readable } from 'node:stream'
import {
  behindId3,
  flacTone,
  m4aWithNoLength,
  mp3UnderClaimed,
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

import { discardBlob, moveAudioBlobToSanity } from './move'
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

  it('refuses an hour of MP3 whose header claims ten frames', async () => {
    fetchMock.mockResolvedValue(respond(mp3UnderClaimed(65 * 60)))
    expect(await moveAudioBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'length',
    })
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('refuses FLAC behind an ID3 tag as the wrong type', async () => {
    fetchMock.mockResolvedValue(respond(behindId3(flacTone())))
    expect(await moveAudioBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'type',
    })
  })

  it('refuses a track whose length cannot be read with its own reason', async () => {
    fetchMock.mockResolvedValue(respond(m4aWithNoLength()))
    expect(await moveAudioBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'unreadable',
    })
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('refuses by a content-length over 20 MB before reading a byte', async () => {
    // A small, valid body: only the declared size can refuse it.
    fetchMock.mockResolvedValue(
      respond(mp3OfSeconds(1), {
        'content-length': String(30 * 1024 * 1024),
      }),
    )
    expect(await moveAudioBlobToSanity(URL_OK, ORG)).toEqual({
      ok: false,
      reason: 'size',
    })
    expect(h.upload).not.toHaveBeenCalled()
  })

  it('fetches the blob without following redirects', async () => {
    fetchMock.mockResolvedValue(respond(mp3OfSeconds(1)))
    await moveAudioBlobToSanity(URL_OK, ORG)
    expect(fetchMock).toHaveBeenCalledWith(
      URL_OK,
      expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
    )
  })

  it('records a file Sanity already held (an old _createdAt) as not created', async () => {
    h.upload.mockResolvedValue({
      _id: 'file-shared-mp3',
      _createdAt: '2020-01-01T00:00:00Z',
      url: 'https://cdn.sanity.io/files/x.mp3',
    })
    fetchMock.mockResolvedValue(respond(mp3OfSeconds(1)))
    const result = await moveAudioBlobToSanity(URL_OK, ORG)
    expect(result.ok && result.asset.created).toBe(false)
  })

  /** The move's result if it has settled by now, else "pending". */
  const settled = (moving: Promise<unknown>) =>
    Promise.race([moving, new Promise((r) => setImmediate(() => r('pending')))])

  it('gives up on a Sanity upload that never answers, at the 45 s deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      h.upload.mockImplementation(() => new Promise(() => {}))
      fetchMock.mockResolvedValue(respond(mp3OfSeconds(1)))
      const moving = moveAudioBlobToSanity(URL_OK, ORG)
      await vi.waitFor(() => expect(h.upload).toHaveBeenCalled())
      await vi.advanceTimersByTimeAsync(44_000)
      expect(await settled(moving)).toBe('pending')
      await vi.advanceTimersByTimeAsync(1_001)
      expect(await settled(moving)).toEqual({ ok: false, reason: 'upload' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up on a blob that never finishes arriving, at the 45 s deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      // The body stalls after its first bytes, and fails only when the
      // move's own deadline aborts the fetch.
      fetchMock.mockImplementation(async (_url, init: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(mp3OfSeconds(0.1)))
            init.signal?.addEventListener('abort', () =>
              controller.error(new Error('aborted')),
            )
          },
        })
        return new Response(body)
      })
      const moving = moveAudioBlobToSanity(URL_OK, ORG)
      await vi.advanceTimersByTimeAsync(44_000)
      expect(await settled(moving)).toBe('pending')
      await vi.advanceTimersByTimeAsync(1_001)
      expect(await settled(moving)).toEqual({ ok: false, reason: 'fetch' })
      expect(h.upload).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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

describe('discardBlob', () => {
  it('deletes an upload of ours after the answer, without fetching it', async () => {
    discardBlob(URL_OK, ORG)
    expect(fetchMock).not.toHaveBeenCalled()
    for (const task of h.afterTasks.splice(0)) await task()
    expect(h.del).toHaveBeenCalledWith(URL_OK, expect.anything())
  })

  it('never deletes a URL that is not ours', async () => {
    discardBlob(URL_OK.replace(ORG, 'org-B'), ORG)
    discardBlob('https://evil.example/marketing-asset/org-A/x.mp3', ORG)
    expect(h.afterTasks).toEqual([])
    expect(h.del).not.toHaveBeenCalled()
  })
})
