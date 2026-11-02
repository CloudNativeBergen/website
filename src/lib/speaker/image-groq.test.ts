import { describe, expect, it } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { SPEAKER_IMAGE_URL } from './image-groq'

const URL = 'https://cdn.sanity.io/images/p/d/abc-1000x500.jpg'
const asset = {
  _id: 'image-abc-1000x500-jpg',
  _type: 'sanity.imageAsset',
  url: URL,
  metadata: { dimensions: { width: 1000, height: 500 } },
}

async function project(speaker: Record<string, unknown>) {
  const tree = parse(
    `*[_type == "speaker"][0]{ "image": ${SPEAKER_IMAGE_URL} }`,
  )
  const dataset = [asset, { _id: 's', _type: 'speaker', ...speaker }]
  return (await (await evaluate(tree, { dataset })).get()).image
}

const ref = { _type: 'reference', _ref: asset._id }

describe('SPEAKER_IMAGE_URL', () => {
  it('is the plain asset URL without a crop or hotspot', async () => {
    expect(await project({ image: { asset: ref } })).toBe(URL)
  })

  it('carries the crop as a pixel rect and the hotspot as a focal point', async () => {
    expect(
      await project({
        image: {
          asset: ref,
          crop: { left: 0.1, right: 0.2, top: 0, bottom: 0.5 },
          hotspot: { x: 0.3, y: 0.25, width: 0.2, height: 0.2 },
        },
      }),
    ).toBe(`${URL}?rect=100,0,700,250&fp-x=0.3&fp-y=0.25`)
  })

  it('falls back to the OAuth avatar', async () => {
    expect(await project({ imageURL: 'https://avatars.example/x.png' })).toBe(
      'https://avatars.example/x.png',
    )
  })
})
