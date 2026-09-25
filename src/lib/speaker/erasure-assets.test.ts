/**
 * The erasure plan's marketing-image branch (#1162, spec §6), pure half.
 *
 * What the stored documents look like AFTER the plan is committed is pinned by
 * `erasure.assets.sanity.test.ts`, on a real dataset. This file pins the
 * planner's decisions: what is linked, what each holder loses, and what is
 * refused before anything is written.
 */
import { describe, expect, it } from 'vitest'
import {
  linkedFileIds,
  planSpeakerAssetErasure,
  speakerSubjectIds,
  type SpeakerAssetInputs,
} from './erasure-assets'

const SPEAKER = 'spk-ada'
const TALK = 'talk-ada'
const IMG = 'image-card-1200x630-png'
const VID = 'file-clip-mp4'
const RENDER = 'image-render-1080x1080-png'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const image = (id: string) => ({ _type: 'image', asset: ref(id) })

function inputs(overrides: Partial<SpeakerAssetInputs> = {}) {
  return {
    subjectDocs: [],
    fileHolders: [],
    variants: [],
    ...overrides,
  } satisfies SpeakerAssetInputs
}

describe('speakerSubjectIds', () => {
  it('is the speaker and every talk listing them as a speaker, published ids', () => {
    const ids = speakerSubjectIds(SPEAKER, [
      { _id: TALK, _type: 'talk', speakers: [ref(SPEAKER)] },
      { _id: `drafts.${TALK}`, _type: 'talk', speakers: [ref(SPEAKER)] },
      // A talk that references the speaker some other way is not "a talk they give".
      { _id: 'talk-other', _type: 'talk', speakers: [ref('spk-bob')] },
      { _id: 'review-1', _type: 'review', reviewer: ref(SPEAKER) },
    ])
    expect(ids).toEqual([SPEAKER, TALK])
  })
})

describe('linkedFileIds', () => {
  it('collects every file a subject asset holds and every Task render', () => {
    const ids = linkedFileIds([
      {
        _id: 'asset-1',
        _type: 'marketingAsset',
        image: image(IMG),
        video: { _type: 'file', asset: ref(VID) },
      },
      {
        _id: 'task-1',
        _type: 'marketingTask',
        asset: image(RENDER),
        pendingStudioAsset: image(RENDER),
      },
      // A Task with no render yet links nothing.
      { _id: 'task-2', _type: 'marketingTask' },
    ])
    expect(ids.sort()).toEqual([VID, IMG, RENDER].sort())
  })

  it('does not treat the subject reference itself as a file', () => {
    expect(
      linkedFileIds([
        { _id: 'a', _type: 'marketingAsset', subject: ref(SPEAKER) },
      ]),
    ).toEqual([])
  })
})

describe('planSpeakerAssetErasure', () => {
  const FILES = [IMG, RENDER]

  it('deletes every gallery entry holding a linked file, drafts and release versions included', () => {
    const plan = planSpeakerAssetErasure(
      SPEAKER,
      FILES,
      inputs({
        fileHolders: [
          { _id: 'asset-1', _type: 'marketingAsset', image: image(IMG) },
          { _id: 'drafts.asset-1', _type: 'marketingAsset', image: image(IMG) },
          {
            _id: 'versions.r1.asset-1',
            _type: 'marketingAsset',
            image: image(IMG),
          },
        ],
      }),
    )
    expect(plan.refusals).toEqual([])
    expect(plan.deletes.map((d) => d.id)).toEqual([
      'asset-1',
      'drafts.asset-1',
      'versions.r1.asset-1',
    ])
  })

  it('deletes a gallery entry about the subject even when it holds no file', () => {
    const plan = planSpeakerAssetErasure(
      SPEAKER,
      [],
      inputs({
        subjectDocs: [
          {
            _id: 'drafts.asset-2',
            _type: 'marketingAsset',
            subject: ref(SPEAKER),
          },
          // A Task about the subject is plan structure: it stays.
          { _id: 'task-1', _type: 'marketingTask', subject: ref(SPEAKER) },
        ],
      }),
    )
    expect(plan.deletes.map((d) => d.id)).toEqual(['drafts.asset-2'])
    expect(plan.patches).toEqual([])
  })

  it('deletes a gallery entry once when it is both about the subject and holds the file', () => {
    const asset = { _id: 'asset-1', _type: 'marketingAsset', image: image(IMG) }
    const plan = planSpeakerAssetErasure(
      SPEAKER,
      FILES,
      inputs({ subjectDocs: [asset], fileHolders: [asset] }),
    )
    expect(plan.deletes.map((d) => d.id)).toEqual(['asset-1'])
  })

  it('removes the attachment from a post and from every variant that picks it; the text stays', () => {
    const plan = planSpeakerAssetErasure(
      SPEAKER,
      FILES,
      inputs({
        fileHolders: [
          {
            _id: 'post-1',
            _type: 'socialPost',
            _rev: 'rev-post',
            body: 'Meet Ada',
            attachments: [
              { _key: 'att-ada', image: image(IMG), alt: 'Ada' },
              { _key: 'att-logo', image: image('image-logo-png'), alt: 'Logo' },
            ],
          },
        ],
        variants: [
          {
            _id: 'var-1',
            _type: 'socialPostVariant',
            _rev: 'rev-var',
            post: ref('post-1'),
            attachments: [
              { _key: 'va-1', source: 'att-ada' },
              { _key: 'va-2', source: 'att-logo' },
            ],
          },
          // Another post's variant with a colliding source key is untouched.
          {
            _id: 'var-other',
            _type: 'socialPostVariant',
            post: ref('post-2'),
            attachments: [{ _key: 'vo-1', source: 'att-ada' }],
          },
        ],
      }),
    )
    expect(plan.refusals).toEqual([])
    expect(plan.deletes).toEqual([])
    expect(plan.patches).toEqual([
      expect.objectContaining({
        id: 'post-1',
        rev: 'rev-post',
        unset: ['attachments[_key=="att-ada"]'],
      }),
      expect.objectContaining({
        id: 'var-1',
        rev: 'rev-var',
        unset: ['attachments[_key=="va-1"]'],
      }),
    ])
  })

  it('a draft of a post strips its variants too (variants point at the published id)', () => {
    const plan = planSpeakerAssetErasure(
      SPEAKER,
      FILES,
      inputs({
        fileHolders: [
          {
            _id: 'drafts.post-1',
            _type: 'socialPost',
            attachments: [{ _key: 'att-ada', image: image(IMG) }],
          },
        ],
        variants: [
          {
            _id: 'var-1',
            _type: 'socialPostVariant',
            post: ref('post-1'),
            attachments: [{ _key: 'va-1', source: 'att-ada' }],
          },
        ],
      }),
    )
    expect(plan.patches.map((p) => p.id)).toEqual(['drafts.post-1', 'var-1'])
  })

  it('unsets a Task render and its pending upload, and nothing else on the Task', () => {
    const plan = planSpeakerAssetErasure(
      SPEAKER,
      FILES,
      inputs({
        fileHolders: [
          {
            _id: 'task-1',
            _type: 'marketingTask',
            _rev: 'rev-task',
            title: 'Speaker card',
            asset: image(RENDER),
            pendingStudioAsset: image(RENDER),
          },
          {
            _id: 'task-2',
            _type: 'marketingTask',
            asset: image('image-unrelated-png'),
            pendingStudioAsset: image(IMG),
          },
        ],
      }),
    )
    expect(plan.patches).toEqual([
      expect.objectContaining({
        id: 'task-1',
        rev: 'rev-task',
        unset: ['asset', 'pendingStudioAsset'],
      }),
      expect.objectContaining({ id: 'task-2', unset: ['pendingStudioAsset'] }),
    ])
  })

  it('the subject speaker holding the file needs nothing here — its image is unset with the rest', () => {
    const plan = planSpeakerAssetErasure(
      SPEAKER,
      FILES,
      inputs({
        fileHolders: [{ _id: SPEAKER, _type: 'speaker', image: image(IMG) }],
      }),
    )
    expect(plan).toMatchObject({ patches: [], deletes: [], refusals: [] })
  })

  it('REFUSES a holder it does not know how to strip, before anything is written', () => {
    // A photo-gallery frame with the same bytes: deleting the file would
    // break it, and it is group photography erasure only untags.
    const plan = planSpeakerAssetErasure(
      SPEAKER,
      FILES,
      inputs({
        fileHolders: [
          { _id: 'gallery-1', _type: 'imageGallery', image: image(IMG) },
          { _id: 'spk-bob', _type: 'speaker', image: image(IMG) },
        ],
      }),
    )
    expect(plan.refusals).toHaveLength(2)
    expect(plan.refusals[0]).toContain('imageGallery gallery-1')
    expect(plan.refusals[1]).toContain('speaker spk-bob')
  })

  it('REFUSES an attachment whose key cannot be safely selected', () => {
    const plan = planSpeakerAssetErasure(
      SPEAKER,
      FILES,
      inputs({
        fileHolders: [
          {
            _id: 'post-1',
            _type: 'socialPost',
            attachments: [{ _key: 'bad"]key', image: image(IMG) }],
          },
        ],
      }),
    )
    expect(plan.refusals).toEqual([expect.stringContaining('post-1')])
    expect(plan.patches).toEqual([])
  })

  it('plans nothing when nothing is linked — the fixed point', () => {
    expect(planSpeakerAssetErasure(SPEAKER, [], inputs())).toEqual({
      fileIds: [],
      patches: [],
      deletes: [],
      refusals: [],
    })
  })
})
