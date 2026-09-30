/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('@vercel/blob/client', () => ({ upload: h.upload }))

import { blobAssetUploader } from './upload'

const file = new File([new Uint8Array(10)], 'Logo.PNG', { type: 'image/png' })
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  h.upload.mockResolvedValue({
    url: 'https://s.public.blob.vercel-storage.com/marketing-asset/org-A/1-logo-x.png',
  })
})
afterEach(() => vi.unstubAllGlobals())

const DETAILS = {
  title: 'x',
  alt: 'y',
  edition: 'none' as const,
  tags: [] as string[],
}

describe('blobAssetUploader', () => {
  it('uploads under this organization’s folder, then asks the server to move it', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ _id: 'asset-1', softOnSocial: false }),
    )
    await blobAssetUploader('org-A')(file, {
      ...DETAILS,
      title: 'Logo',
      alt: 'The logo',
    })
    expect(h.upload.mock.calls[0][0]).toMatch(
      /^marketing-asset\/org-A\/\d{13}-logo\.png$/,
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      url: 'https://s.public.blob.vercel-storage.com/marketing-asset/org-A/1-logo-x.png',
      title: 'Logo',
      alt: 'The logo',
      edition: 'none',
      tags: [],
    })
  })

  it('sends a track under its one type name, with its kind and confirmation', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ _id: 'asset-2', softOnSocial: false }),
    )
    // Firefox names a WAV `audio/x-wav`; the token allows `audio/wav`.
    const track = new File([new Uint8Array(10)], 'Theme.WAV', {
      type: 'audio/x-wav',
    })
    await blobAssetUploader('org-A')(
      track,
      { title: 'Theme', edition: 'none', tags: [] },
      { kind: 'audio', rightsConfirmed: true },
    )
    expect(h.upload.mock.calls[0][0]).toMatch(
      /^marketing-asset\/org-A\/\d{13}-theme\.wav$/,
    )
    expect(h.upload.mock.calls[0][2]).toMatchObject({
      contentType: 'audio/wav',
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      kind: 'audio',
      rightsConfirmed: true,
      title: 'Theme',
    })
  })

  it('shows the server’s own refusal as it is', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: 'Only PNG, JPEG and WebP images can be added.' },
        { status: 400 },
      ),
    )
    await expect(blobAssetUploader('org-A')(file, DETAILS)).rejects.toThrow(
      'Only PNG, JPEG and WebP images can be added.',
    )
  })

  it('never shows a library’s raw error text', async () => {
    h.upload.mockRejectedValue(
      new Error('Vercel Blob: Failed to retrieve the client token'),
    )
    await expect(blobAssetUploader('org-A')(file, DETAILS)).rejects.toThrow(
      'The image could not be added. Try again.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never shows a network error from the move request either', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(blobAssetUploader('org-A')(file, DETAILS)).rejects.toThrow(
      'The image could not be added. Try again.',
    )
  })

  it('names the file by its real type when it has no extension', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ _id: 'a', softOnSocial: false }),
    )
    const bare = new File([new Uint8Array(10)], 'logo', { type: 'image/webp' })
    await blobAssetUploader('kkdemo.org')(bare, DETAILS)
    expect(h.upload.mock.calls[0][0]).toMatch(
      /^marketing-asset\/kkdemo\.org\/\d{13}-logo\.webp$/,
    )
  })

  it('sends a studio save’s tab with it (#1164)', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ _id: 'asset-3', softOnSocial: true }),
    )
    const capture = new File(
      [new Uint8Array(10)],
      'ada-speaker-spotlight.png',
      {
        type: 'image/png',
      },
    )
    await blobAssetUploader('org-A')(
      capture,
      { ...DETAILS, subject: { type: 'speaker', id: 'ada' } },
      { kind: 'image', studio: { tab: 'speakers' } },
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      kind: 'image',
      studio: { tab: 'speakers' },
      subject: { type: 'speaker', id: 'ada' },
    })
  })

  it('carries a capture over 4.5 MB straight to Blob, never through a multipart body', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ _id: 'asset-4', softOnSocial: false }),
    )
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'promo.png', {
      type: 'image/png',
    })
    await blobAssetUploader('org-A')(big, DETAILS, {
      kind: 'image',
      studio: { tab: 'conference' },
    })
    // The whole file goes to Blob; the server gets only a small JSON body.
    expect(h.upload.mock.calls[0][1]).toBe(big)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/marketing-assets')
    expect(typeof init.body).toBe('string')
    expect(init.body.length).toBeLessThan(4096)
  })

  it('uploads a video’s poster FIRST as an image, then the MP4 in parts, and sends both URLs (#1167)', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ _id: 'asset-3', softOnSocial: false }),
    )
    h.upload
      .mockResolvedValueOnce({ url: 'https://s/poster.jpg' })
      .mockResolvedValueOnce({ url: 'https://s/clip.mp4' })
    const video = new File([new Uint8Array(10)], 'Opening Clip.mp4', {
      type: 'video/mp4',
    })
    const progress = vi.fn()
    await blobAssetUploader('org-A')(
      video,
      DETAILS,
      { kind: 'video', poster: new Blob([new Uint8Array(4)]) },
      progress,
    )
    const [[posterPath, poster, posterOptions], [videoPath, , videoOptions]] =
      h.upload.mock.calls
    expect(posterPath).toMatch(
      /^marketing-asset\/org-A\/\d{13}-opening-clip-poster\.jpg$/,
    )
    expect(poster.type).toBe('image/jpeg')
    expect(posterOptions.contentType).toBe('image/jpeg')
    expect(videoPath).toMatch(
      /^marketing-asset\/org-A\/\d{13}-opening-clip\.mp4$/,
    )
    expect(videoOptions.contentType).toBe('video/mp4')
    // Progress is the video's, reported as a fraction.
    videoOptions.onUploadProgress({ loaded: 5, total: 10, percentage: 50 })
    expect(progress).toHaveBeenCalledWith(0.5)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      url: 'https://s/clip.mp4',
      ...DETAILS,
      kind: 'video',
      posterUrl: 'https://s/poster.jpg',
    })
  })

  it('sends an exported video’s studio origin and project with it (#1182)', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ _id: 'asset-5', softOnSocial: false }),
    )
    h.upload
      .mockResolvedValueOnce({ url: 'https://s/poster.jpg' })
      .mockResolvedValueOnce({ url: 'https://s/clip.mp4' })
    const video = new File([new Uint8Array(10)], 'teaser.mp4', {
      type: 'video/mp4',
    })
    await blobAssetUploader('org-A')(video, DETAILS, {
      kind: 'video',
      poster: new Blob([new Uint8Array(4)]),
      studio: { tab: 'meme-generator', projectId: 'vp-1' },
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      url: 'https://s/clip.mp4',
      ...DETAILS,
      kind: 'video',
      posterUrl: 'https://s/poster.jpg',
      studio: { tab: 'meme-generator', projectId: 'vp-1' },
    })
  })

  it('sends a GIF as a GIF, whatever the browser called it', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ _id: 'asset-4', softOnSocial: false }),
    )
    const gif = new File([new Uint8Array(10)], 'wave.gif', { type: '' })
    await blobAssetUploader('org-A')(gif, DETAILS, { kind: 'gif' })
    expect(h.upload.mock.calls[0][2].contentType).toBe('image/gif')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      kind: 'gif',
    })
  })

  it('shows the video’s own failure, not the library’s text', async () => {
    h.upload.mockRejectedValue(new Error('BlobError: token expired'))
    const video = new File([new Uint8Array(10)], 'a.mp4', { type: 'video/mp4' })
    await expect(
      blobAssetUploader('org-A')(video, DETAILS, {
        kind: 'video',
        poster: new Blob([]),
      }),
    ).rejects.toThrow('The video could not be added. Try again.')
  })
})
