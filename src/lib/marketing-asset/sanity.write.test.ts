/**
 * @vitest-environment node
 *
 * The document `createMarketingAsset` writes, as stored (#1178): an audio
 * track holds its FILE, its measured length and the rights confirmation, and
 * never alt text; an image is as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ created: [] as Record<string, unknown>[] }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {},
  clientWrite: {
    create: async (doc: Record<string, unknown>) => {
      h.created.push(doc)
      return { _id: 'new-asset' }
    },
  },
}))

import { createMarketingAsset } from './sanity'

const DETAILS = {
  title: 'Conference theme',
  alt: 'Sent anyway',
  scope: 'organization' as const,
  tags: ['music'],
  credit: undefined,
}

beforeEach(() => {
  h.created = []
})

describe('createMarketingAsset', () => {
  it('stores a track as a file with its length and confirmation, and no alt text', async () => {
    await createMarketingAsset({
      orgId: 'org-a',
      details: DETAILS,
      kind: 'audio',
      fileAssetId: 'file-theme-mp3',
      createdFileAssetId: 'file-theme-mp3',
      durationSeconds: 83.4,
      rights: {
        confirmedBy: 'sp-org',
        confirmedAt: '2026-09-26T08:00:00.000Z',
      },
    })
    const [doc] = h.created
    expect(doc).toMatchObject({
      _type: 'marketingAsset',
      organization: { _type: 'reference', _ref: 'org-a' },
      kind: 'audio',
      source: 'upload',
      title: 'Conference theme',
      audio: {
        _type: 'file',
        asset: { _type: 'reference', _ref: 'file-theme-mp3' },
      },
      createdFileAssetId: 'file-theme-mp3',
      durationSeconds: 83.4,
      rightsConfirmation: {
        confirmedBy: { _type: 'reference', _ref: 'sp-org', _weak: true },
        confirmedAt: '2026-09-26T08:00:00.000Z',
      },
    })
    expect(doc).not.toHaveProperty('alt')
    expect(doc).not.toHaveProperty('image')
  })

  it('stores an image as before', async () => {
    await createMarketingAsset({
      orgId: 'org-a',
      details: { ...DETAILS, alt: 'The logo' },
      imageAssetId: 'image-a-1x1-png',
    })
    expect(h.created[0]).toMatchObject({
      kind: 'image',
      alt: 'The logo',
      image: { asset: { _ref: 'image-a-1x1-png' } },
    })
    expect(h.created[0]).not.toHaveProperty('audio')
    expect(h.created[0]).not.toHaveProperty('rightsConfirmation')
  })

  it('records a studio save’s tab, and no second copy of its subject (#1164)', async () => {
    await createMarketingAsset({
      orgId: 'org-a',
      details: {
        ...DETAILS,
        alt: 'Speaker card',
        subject: { type: 'speaker', id: 'sp-ada' },
      },
      imageAssetId: 'image-a-1x1-png',
      studio: { tab: 'speakers' },
    })
    expect(h.created[0]).toMatchObject({
      source: 'studio',
      subject: { _ref: 'sp-ada', _weak: true },
    })
    // The subject alone names the speaker: an edit or an erasure of it can
    // never leave a stale reference to the person behind.
    expect(h.created[0].studio).toEqual({ tab: 'speakers' })
  })

  it('records a video’s project as a weak reference, with its tab (#1182)', async () => {
    await createMarketingAsset({
      orgId: 'org-a',
      details: { ...DETAILS, alt: 'A teaser' },
      kind: 'video',
      fileAssetId: 'file-clip-mp4',
      createdFileAssetId: 'file-clip-mp4',
      posterAssetId: 'image-poster-1080x1080-jpg',
      studio: { tab: 'meme-generator', projectId: 'vp-1' },
      sources: [
        { fileId: 'image-hall-1080x1080-png', galleryAssetId: 'asset-hall' },
        { fileId: 'image-ada-1080x1080-png', subjectId: 'sp-ada' },
      ],
    })
    expect(h.created[0]).toMatchObject({
      kind: 'video',
      source: 'studio',
      studio: { tab: 'meme-generator' },
      // Weak: the entry outlives its project and never blocks deleting it.
      project: { _type: 'reference', _ref: 'vp-1', _weak: true },
    })
    // The file as a plain id, never a reference, so it keeps no file
    // alive; the gallery asset and the subject weak; every item keyed.
    const sources = h.created[0].sources as Record<string, unknown>[]
    expect(sources).toHaveLength(2)
    expect(sources[0]).toMatchObject({
      _type: 'exportSource',
      fileId: 'image-hall-1080x1080-png',
      galleryAsset: { _type: 'reference', _ref: 'asset-hall', _weak: true },
    })
    expect(sources[0]).not.toHaveProperty('subject')
    expect(sources[1]).toMatchObject({
      fileId: 'image-ada-1080x1080-png',
      subject: { _type: 'reference', _ref: 'sp-ada', _weak: true },
    })
    expect(sources[1]).not.toHaveProperty('galleryAsset')
    expect(new Set(sources.map((s) => s._key)).size).toBe(2)
  })

  it('records no project for a video saved unsaved, but still its lineage, and none for an image (#1182)', async () => {
    await createMarketingAsset({
      orgId: 'org-a',
      details: { ...DETAILS, alt: 'A teaser' },
      kind: 'video',
      fileAssetId: 'file-clip-mp4',
      posterAssetId: 'image-poster-1080x1080-jpg',
      studio: { tab: 'meme-generator' },
      sources: [{ fileId: 'image-venue-1080x1080-png' }],
    })
    expect(h.created[0]).toMatchObject({
      source: 'studio',
      sources: [{ fileId: 'image-venue-1080x1080-png' }],
    })
    expect(h.created[0]).not.toHaveProperty('project')
    await createMarketingAsset({
      orgId: 'org-a',
      details: { ...DETAILS, alt: 'A card' },
      imageAssetId: 'image-a-1x1-png',
      studio: { tab: 'meme-generator', projectId: 'vp-1' },
    })
    expect(h.created[1]).toMatchObject({
      kind: 'image',
      source: 'studio',
      studio: { tab: 'meme-generator' },
    })
    expect(h.created[1]).not.toHaveProperty('project')
  })

  it('keeps an upload an upload, with no studio origin', async () => {
    await createMarketingAsset({
      orgId: 'org-a',
      details: { ...DETAILS, alt: 'The logo' },
      imageAssetId: 'image-a-1x1-png',
      createdImageAssetId: 'image-a-1x1-png',
    })
    expect(h.created[0].source).toBe('upload')
    expect(Object.keys(h.created[0]).sort()).toEqual([
      '_type',
      'alt',
      'createdImageAssetId',
      'image',
      'kind',
      'organization',
      'scope',
      'source',
      'tags',
      'title',
    ])
  })
})
