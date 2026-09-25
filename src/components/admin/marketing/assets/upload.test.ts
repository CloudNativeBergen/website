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

describe('blobAssetUploader', () => {
  it('uploads under this organization’s folder, then asks the server to move it', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ _id: 'asset-1', softOnSocial: false }),
    )
    await blobAssetUploader('org-A')(file, { title: 'Logo', alt: 'The logo' })
    expect(h.upload.mock.calls[0][0]).toMatch(
      /^marketing-asset\/org-A\/\d{13}-logo\.png$/,
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      url: 'https://s.public.blob.vercel-storage.com/marketing-asset/org-A/1-logo-x.png',
      title: 'Logo',
      alt: 'The logo',
    })
  })

  it('shows the server’s own refusal as it is', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: 'Only PNG, JPEG and WebP images can be added.' },
        { status: 400 },
      ),
    )
    await expect(
      blobAssetUploader('org-A')(file, { title: 'x', alt: 'y' }),
    ).rejects.toThrow('Only PNG, JPEG and WebP images can be added.')
  })

  it('never shows a library’s raw error text', async () => {
    h.upload.mockRejectedValue(
      new Error('Vercel Blob: Failed to retrieve the client token'),
    )
    await expect(
      blobAssetUploader('org-A')(file, { title: 'x', alt: 'y' }),
    ).rejects.toThrow('The image could not be added. Try again.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never shows a network error from the move request either', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      blobAssetUploader('org-A')(file, { title: 'x', alt: 'y' }),
    ).rejects.toThrow('The image could not be added. Try again.')
  })

  it('names the file by its real type when it has no extension', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ _id: 'a', softOnSocial: false }),
    )
    const bare = new File([new Uint8Array(10)], 'logo', { type: 'image/webp' })
    await blobAssetUploader('kkdemo.org')(bare, { title: 'x', alt: 'y' })
    expect(h.upload.mock.calls[0][0]).toMatch(
      /^marketing-asset\/kkdemo\.org\/\d{13}-logo\.webp$/,
    )
  })
})
