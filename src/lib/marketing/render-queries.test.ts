/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({ dataset: [] as Record<string, unknown>[] }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
}))

import { getRenderSiblings, getStudioTask } from './render-sanity'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
function task(id: string, conference: string, campaign = 'campaign') {
  return {
    _id: id,
    _type: 'marketingTask',
    _rev: `${id}-rev`,
    conference: ref(conference),
    campaign: ref(campaign),
    kind: 'publishing',
    prerequisites: [{ _key: 'render', ...ref('render') }],
    variant: ref(`${id}-variant`),
  }
}

beforeEach(() => {
  h.dataset = [
    {
      ...task('render', 'ours'),
      kind: 'studioRender',
      title: 'Save the date',
      alt: 'Conference dates',
      pendingStudioAsset: { _type: 'image', asset: ref('image-upload') },
      asset: { _type: 'image', asset: ref('image-saved') },
      subject: ref('speaker'),
      replacedRenders: ['image-replaced'],
    },
    { ...task('foreign', 'theirs'), title: 'Foreign title' },
    task('dependent', 'ours'),
    task('other-campaign', 'ours', 'different'),
    task('drafts.dependent', 'ours'),
    task('versions.release.dependent', 'ours'),
    { _id: 'speaker', _type: 'speaker', name: 'Ada' },
    {
      _id: 'campaign',
      _type: 'marketingCampaign',
      _rev: 'campaign-rev',
      conference: ref('ours'),
    },
  ]
})

describe('studio queries executed against a fixture dataset', () => {
  it('projects upload binding, saved asset and alt from the current conference', async () => {
    expect(await getStudioTask('render', 'ours')).toEqual({
      _id: 'render',
      _rev: 'render-rev',
      kind: 'studioRender',
      title: 'Save the date',
      alt: 'Conference dates',
      subjectName: 'Ada',
      // What a gallery entry is about (#1165).
      subject: { id: 'speaker', type: 'speaker' },
      pendingAssetId: 'image-upload',
      assetId: 'image-saved',
      campaignId: 'campaign',
      handoffDoneFor: null,
      replacedRenders: ['image-replaced'],
      galleryPending: null,
      galleryAssetId: null,
      galleryAlt: null,
      galleryHotspot: null,
      galleryCrop: null,
    })
  })

  it('reads the gallery origin and the alt it was picked with (#1166)', async () => {
    Object.assign(h.dataset[0], {
      galleryAsset: { ...ref('asset-ours'), _weak: true },
      galleryAlt: 'Our logo',
      galleryHotspot: { x: 0.5, y: 0.4, width: 0.3, height: 0.2 },
      galleryCrop: { top: 0.1, bottom: 0, left: 0, right: 0.25 },
    })
    expect(await getStudioTask('render', 'ours')).toMatchObject({
      galleryAssetId: 'asset-ours',
      galleryAlt: 'Our logo',
      galleryHotspot: { x: 0.5, y: 0.4, width: 0.3, height: 0.2 },
      galleryCrop: { top: 0.1, bottom: 0, left: 0, right: 0.25 },
    })
  })

  it('returns only live same-conference same-campaign siblings with variant and prerequisite ids', async () => {
    expect(await getRenderSiblings('campaign', 'ours')).toEqual([
      {
        _id: 'render',
        kind: 'studioRender',
        prerequisiteIds: ['render'],
        variantId: 'render-variant',
      },
      {
        _id: 'dependent',
        kind: 'publishing',
        prerequisiteIds: ['render'],
        variantId: 'dependent-variant',
      },
    ])
  })

  it('projects a subjectless render without requiring a subject document', async () => {
    h.dataset[0] = { ...h.dataset[0], subject: undefined }
    expect(await getStudioTask('render', 'ours')).toMatchObject({
      _id: 'render',
      title: 'Save the date',
      subjectName: null,
      pendingAssetId: 'image-upload',
    })
  })
})
