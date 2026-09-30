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

const galleryRow = (
  id: string,
  fileId: string,
  kind = 'image',
  subjectId: string | null = null,
) => ({
  _id: id,
  kind,
  title: id,
  fileId,
  createdByUpload: true,
  subjectId,
  rights: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.requireDocument.mockResolvedValue('org-a')
  h.readFiles.mockResolvedValue({
    images: [
      { fileId: 'image-hall', galleryAssetId: 'asset-hall', subjectId: null },
      { fileId: 'image-ada', galleryAssetId: null, subjectId: 'sp-ada' },
      // The same deduplicated file under the same entry twice is one.
      { fileId: 'image-hall', galleryAssetId: 'asset-hall', subjectId: null },
    ],
    track: { fileId: 'file-theme' },
  })
  h.readGallery.mockImplementation(async (_org: string, ids: string[]) =>
    ids.flatMap((id) =>
      id === 'asset-venue'
        ? [galleryRow(id, 'image-venue', 'image', 'talk-1')]
        : id === 'asset-theme'
          ? [galleryRow(id, 'file-theme', 'audio')]
          : [],
    ),
  )
})

describe('resolveVideoLineage', () => {
  it('proves the project ours, then names its backgrounds once each with their subjects, and never the track', async () => {
    await expect(
      resolveVideoLineage('org-a', { projectId: 'vp-1' }),
    ).resolves.toEqual({
      sources: [
        { fileId: 'image-hall', galleryAssetId: 'asset-hall' },
        { fileId: 'image-ada', subjectId: 'sp-ada' },
      ],
    })
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
      sources: [
        { fileId: 'image-hall', galleryAssetId: 'asset-hall' },
        { fileId: 'image-ada', subjectId: 'sp-ada' },
        {
          fileId: 'image-venue',
          galleryAssetId: 'asset-venue',
          subjectId: 'talk-1',
        },
      ],
    })
    expect(h.readGallery).toHaveBeenCalledWith('org-a', [
      'asset-venue',
      'asset-foreign',
      'asset-theme',
    ])
  })

  it('keeps the file the export showed when the entry’s image was replaced since — bare, unless the project held it under that entry', async () => {
    // Unsaved: nothing proves the old file was ever the entry's. Bare.
    await expect(
      resolveVideoLineage('org-a', {
        sources: [{ fileId: 'image-venue-old', galleryAssetId: 'asset-venue' }],
      }),
    ).resolves.toEqual({ sources: [{ fileId: 'image-venue-old' }] })
    // The project holds it under that entry: proven when it was saved.
    await expect(
      resolveVideoLineage('org-a', {
        projectId: 'vp-1',
        sources: [{ fileId: 'image-hall', galleryAssetId: 'asset-hall' }],
      }),
    ).resolves.toEqual({
      sources: [
        { fileId: 'image-hall', galleryAssetId: 'asset-hall' },
        { fileId: 'image-ada', subjectId: 'sp-ada' },
      ],
    })
  })

  it('never copies a subject onto a file an organizer merely paired with their entry', async () => {
    // Their own entry, someone else's file: the subject would link that
    // file to a person, and the next erasure would delete it everywhere.
    await expect(
      resolveVideoLineage('org-a', {
        projectId: 'vp-1',
        sources: [
          {
            fileId: 'image-someone-elses-1080x1080-png',
            galleryAssetId: 'asset-venue',
          },
        ],
      }),
    ).resolves.toEqual({
      sources: [
        { fileId: 'image-hall', galleryAssetId: 'asset-hall' },
        { fileId: 'image-ada', subjectId: 'sp-ada' },
        { fileId: 'image-someone-elses-1080x1080-png' },
      ],
    })
  })

  it('takes a bare file id as given: a photo the project has since dropped, its entry gone too', async () => {
    await expect(
      resolveVideoLineage('org-a', {
        projectId: 'vp-1',
        sources: [
          // The entry is gone: absent from the gallery read. Bare: nothing
          // proves the file was its, so no subject is copied.
          { fileId: 'image-dropped', galleryAssetId: 'asset-gone' },
          { fileId: 'image-ada' },
        ],
      }),
    ).resolves.toEqual({
      sources: [
        { fileId: 'image-hall', galleryAssetId: 'asset-hall' },
        { fileId: 'image-ada', subjectId: 'sp-ada' },
        { fileId: 'image-dropped' },
      ],
    })
  })

  it('names the backgrounds of an unsaved video without a project', async () => {
    await expect(
      resolveVideoLineage('org-a', {
        sources: [{ galleryAssetId: 'asset-venue' }, { fileId: 'image-ada' }],
      }),
    ).resolves.toEqual({
      sources: [
        {
          fileId: 'image-venue',
          galleryAssetId: 'asset-venue',
          subjectId: 'talk-1',
        },
        { fileId: 'image-ada' },
      ],
    })
    expect(h.requireDocument).not.toHaveBeenCalled()
    expect(h.readFiles).not.toHaveBeenCalled()
  })

  it('names no files for a project of colours with no sources', async () => {
    h.readFiles.mockResolvedValue({ images: [], track: null })
    await expect(
      resolveVideoLineage('org-a', { projectId: 'vp-1', sources: [] }),
    ).resolves.toEqual({ sources: [] })
  })
})
