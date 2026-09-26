/**
 * @vitest-environment jsdom
 *
 * The studio's gallery (#1180). `list` has no kind filter yet, so this hook's
 * is the only thing keeping audio (#1178) and video (#1167) out of the
 * background picker: nothing but an image can be drawn.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const h = vi.hoisted(() => ({
  list: vi.fn(),
  background: vi.fn(),
  invalidate: vi.fn(),
  upload: vi.fn(),
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      marketingAsset: {
        list: { fetch: h.list, invalidate: h.invalidate },
        filters: { invalidate: h.invalidate },
        background: { fetch: h.background },
      },
    }),
  },
}))
vi.mock('@/components/admin/marketing/assets/upload', () => ({
  blobAssetUploader: (orgId: string) => (file: File, details: unknown) =>
    h.upload(orgId, file, details),
}))

import { useStudioGallery } from './useStudioGallery'

const row = (over: Record<string, unknown>) => ({
  _id: 'asset',
  title: 'T',
  alt: 'A',
  kind: 'image',
  imageUrl: 'https://cdn.sanity.io/images/p/d/a.jpg',
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('useStudioGallery', () => {
  it('offers only images that have one to draw', async () => {
    h.list.mockResolvedValue([
      row({ _id: 'photo' }),
      row({ _id: 'track', kind: 'audio', imageUrl: null }),
      // A video with a poster frame still is not a still background.
      row({ _id: 'clip', kind: 'video' }),
      row({ _id: 'broken', imageUrl: null }),
    ])
    const { result } = renderHook(() => useStudioGallery('org-A'))
    expect(await result.current.images()).toEqual([
      {
        _id: 'photo',
        title: 'T',
        alt: 'A',
        thumbnailUrl:
          'https://cdn.sanity.io/images/p/d/a.jpg?w=320&h=320&fit=crop',
      },
    ])
  })

  it('keeps an upload organization-wide, with nothing else said about it', async () => {
    h.upload.mockResolvedValue({ _id: 'kept', softOnSocial: false })
    const { result } = renderHook(() => useStudioGallery('org-A'))
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    expect(
      await result.current.keep(file, { title: 'Stage', alt: 'A stage' }),
    ).toEqual({ _id: 'kept' })
    expect(h.upload).toHaveBeenCalledWith('org-A', file, {
      title: 'Stage',
      alt: 'A stage',
      edition: 'none',
      subject: null,
      tags: [],
    })
  })

  it('resolves a pick through the server, by id alone', async () => {
    h.background.mockResolvedValue({ _id: 'photo', title: 'T', url: '/x' })
    const { result } = renderHook(() => useStudioGallery('org-A'))
    await result.current.resolve('photo')
    expect(h.background).toHaveBeenCalledWith({ id: 'photo' })
  })
})
