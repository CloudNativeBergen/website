/**
 * @vitest-environment node
 *
 * What an exported video is found by at erasure (#1182): the tenancy proof
 * of its project comes FIRST and nothing of a foreign project is read; the
 * backgrounds the editor named are resolved within THIS organization only,
 * a foreign or deleted gallery id simply absent; a bare file id is believed
 * only where the project holds that file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  requireDocument: vi.fn(),
  readFiles: vi.fn(),
  readGallery: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/server/tenancy', () => ({
  requireCurrentOrgId: vi.fn(),
  requireDocumentInCurrentOrg: h.requireDocument,
  requireSpeakerInCurrentOrg: vi.fn(),
}))
vi.mock('@/server/trpc', () => ({ resolveConferenceId: vi.fn() }))
vi.mock('./sanity', () => ({ readMarketingAssetMark: vi.fn() }))
vi.mock('@/lib/video-project/sanity', () => ({
  readVideoProjectFiles: h.readFiles,
  readGalleryFiles: h.readGallery,
}))

import { resolveVideoLineage } from './guard'

const galleryRow = (id: string, fileId: string, kind = 'image') => ({
  _id: id,
  kind,
  title: id,
  fileId,
  createdByUpload: true,
  subjectId: null,
  rights: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.requireDocument.mockResolvedValue('org-a')
  h.readFiles.mockResolvedValue({
    images: [
      { fileId: 'image-hall', galleryAssetId: 'asset-hall' },
      { fileId: 'image-ada', galleryAssetId: null },
      // The same deduplicated file in two scenes is one id.
      { fileId: 'image-hall', galleryAssetId: null },
    ],
    track: { fileId: 'file-theme' },
  })
  h.readGallery.mockImplementation(async (_org: string, ids: string[]) =>
    ids.flatMap((id) =>
      id === 'asset-venue'
        ? [galleryRow(id, 'image-venue')]
        : id === 'asset-theme'
          ? [galleryRow(id, 'file-theme', 'audio')]
          : [],
    ),
  )
})

describe('resolveVideoLineage', () => {
  it('proves the project ours, then names its backgrounds once each, and never the track', async () => {
    await expect(
      resolveVideoLineage('org-a', { projectId: 'vp-1' }),
    ).resolves.toEqual({ sourceFileIds: ['image-hall', 'image-ada'] })
    expect(h.requireDocument).toHaveBeenCalledWith('vp-1', 'videoProject')
    expect(h.readFiles).toHaveBeenCalledWith('org-a', 'vp-1')
    expect(h.requireDocument.mock.invocationCallOrder[0]).toBeLessThan(
      h.readFiles.mock.invocationCallOrder[0],
    )
  })

  it('reads nothing of a project that is not ours, and resolves no source first', async () => {
    h.requireDocument.mockRejectedValue(new Error('NOT_FOUND'))
    await expect(
      resolveVideoLineage('org-a', {
        projectId: 'vp-foreign',
        sources: [{ galleryAssetId: 'asset-venue' }],
      }),
    ).rejects.toThrow('NOT_FOUND')
    expect(h.readFiles).not.toHaveBeenCalled()
    expect(h.readGallery).not.toHaveBeenCalled()
  })

  it('adds a background picked since the project was saved, by its gallery asset, within this organization', async () => {
    await expect(
      resolveVideoLineage('org-a', {
        projectId: 'vp-1',
        sources: [
          { galleryAssetId: 'asset-venue' },
          // Not ours, or gone: absent from the answer, never refused.
          { galleryAssetId: 'asset-foreign' },
          // A track is not shown.
          { galleryAssetId: 'asset-theme' },
        ],
      }),
    ).resolves.toEqual({
      sourceFileIds: ['image-hall', 'image-ada', 'image-venue'],
    })
    expect(h.readGallery).toHaveBeenCalledWith('org-a', [
      'asset-venue',
      'asset-foreign',
      'asset-theme',
    ])
  })

  it('believes a bare file id only where the project holds that file', async () => {
    await expect(
      resolveVideoLineage('org-a', {
        projectId: 'vp-1',
        sources: [{ fileId: 'image-ada' }, { fileId: 'image-someone-elses' }],
      }),
    ).resolves.toEqual({ sourceFileIds: ['image-hall', 'image-ada'] })
  })

  it('names the backgrounds of an unsaved video from the gallery alone', async () => {
    await expect(
      resolveVideoLineage('org-a', {
        sources: [
          { galleryAssetId: 'asset-venue' },
          // No project to hold it: not believed.
          { fileId: 'image-ada' },
        ],
      }),
    ).resolves.toEqual({ sourceFileIds: ['image-venue'] })
    expect(h.requireDocument).not.toHaveBeenCalled()
    expect(h.readFiles).not.toHaveBeenCalled()
  })

  it('names no files for a project of colours with no sources', async () => {
    h.readFiles.mockResolvedValue({ images: [], track: null })
    await expect(
      resolveVideoLineage('org-a', { projectId: 'vp-1', sources: [] }),
    ).resolves.toEqual({ sourceFileIds: [] })
  })
})
