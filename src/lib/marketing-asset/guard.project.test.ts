/**
 * @vitest-environment node
 *
 * The project guard for an exported video (#1182): the tenancy proof comes
 * FIRST, and the project's backgrounds are read only once it has passed —
 * a foreign id is refused with nothing of it read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  requireDocument: vi.fn(),
  readFiles: vi.fn(),
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
}))

import { requireProjectInCurrentOrg } from './guard'

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
})

describe('requireProjectInCurrentOrg', () => {
  it('proves the project ours, then names its backgrounds once each, and never the track', async () => {
    await expect(requireProjectInCurrentOrg('vp-1')).resolves.toEqual({
      sourceFileIds: ['image-hall', 'image-ada'],
    })
    expect(h.requireDocument).toHaveBeenCalledWith('vp-1', 'videoProject')
    expect(h.readFiles).toHaveBeenCalledWith('org-a', 'vp-1')
    expect(h.requireDocument.mock.invocationCallOrder[0]).toBeLessThan(
      h.readFiles.mock.invocationCallOrder[0],
    )
  })

  it('reads nothing of a project that is not ours', async () => {
    h.requireDocument.mockRejectedValue(new Error('NOT_FOUND'))
    await expect(requireProjectInCurrentOrg('vp-foreign')).rejects.toThrow(
      'NOT_FOUND',
    )
    expect(h.readFiles).not.toHaveBeenCalled()
  })

  it('names no files for a project with only colours', async () => {
    h.readFiles.mockResolvedValue({ images: [], track: null })
    await expect(requireProjectInCurrentOrg('vp-1')).resolves.toEqual({
      sourceFileIds: [],
    })
  })
})
