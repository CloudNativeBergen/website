import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildRequest, moderationQuestions } from './questions'
import { loadData, moderationKeys, wallPhotoSchema } from './schema'
import { parseResponse, requestDecision } from './transport'

const labels = {
  abusive: false,
  sexual: false,
  spam: false,
  personal_info: false,
}
const photo = {
  id: 'wp-001',
  image: { kind: 'generated', generator: 'badge-1' },
  labels: { photo: labels },
  tags: ['benign', 'no_caption'],
}

describe('wall-photo schema', () => {
  it('accepts either all or none of caption, language, and caption labels', () => {
    for (let mask = 0; mask < 8; mask++) {
      const result = wallPhotoSchema.safeParse({
        ...photo,
        ...(mask & 1 ? { caption: 'synthetic fixture' } : {}),
        ...(mask & 2 ? { lang: 'en' } : {}),
        labels: { ...photo.labels, ...(mask & 4 ? { caption: labels } : {}) },
        tags: mask & 1 ? ['benign'] : ['benign', 'no_caption'],
      })
      expect(result.success, `presence mask ${mask}`).toBe(
        mask === 0 || mask === 7,
      )
    }
  })
  it('bounds caption length, provenance, ids, tags, and cache template names', () => {
    expect(wallPhotoSchema.safeParse(photo).success).toBe(true)
    const fetched = {
      kind: 'fetched',
      url: 'https://example.com/photo.jpg',
      page: 'https://example.com/page',
      author: 'Synthetic author',
      licence: 'CC0-1.0',
      sha256: 'a'.repeat(64),
    }
    expect(
      wallPhotoSchema.safeParse({ ...photo, image: fetched }).success,
    ).toBe(true)
    expect(
      wallPhotoSchema.safeParse({
        ...photo,
        caption: 'x'.repeat(80),
        lang: 'en',
        labels: { photo: labels, caption: labels },
        tags: ['benign'],
      }).success,
    ).toBe(true)
    for (const patch of [
      { id: 'wp-1' },
      {
        caption: '',
        lang: 'en',
        labels: { photo: labels, caption: labels },
        tags: ['benign'],
      },
      {
        caption: 'x'.repeat(81),
        lang: 'en',
        labels: { photo: labels, caption: labels },
        tags: ['benign'],
      },
      { tags: ['benign', 'no_caption', 'unsupported'] },
      { tags: ['benign', 'benign', 'no_caption'] },
      { image: { kind: 'generated', generator: '../escape' } },
      { image: { ...fetched, licence: 'CC-BY-4.0' } },
      { image: { ...fetched, sha256: 'invalid' } },
      { image: { ...fetched, url: 'file:///tmp/photo' } },
      { image: { ...fetched, unknown: true } },
    ])
      expect(wallPhotoSchema.safeParse({ ...photo, ...patch }).success).toBe(
        false,
      )
  })
})

describe('wall-photo tags agree with labels', () => {
  it.each([
    [
      'benign with a positive photo label',
      {
        tags: ['benign', 'no_caption'],
        labels: { photo: { ...labels, spam: true } },
      },
    ],
    [
      'a spam label without the spam tag',
      {
        tags: ['personal_info', 'no_caption'],
        labels: { photo: { ...labels, spam: true, personal_info: true } },
      },
    ],
    [
      'a caption without its no_caption tag removed',
      {
        tags: ['benign', 'no_caption'],
        caption: 'synthetic fixture',
        lang: 'en',
        labels: { photo: labels, caption: labels },
      },
    ],
    [
      'a caption_flag tag on a clean caption',
      {
        tags: ['benign', 'caption_flag'],
        caption: 'synthetic fixture',
        lang: 'en',
        labels: { photo: labels, caption: labels },
      },
    ],
  ])('rejects %s', (_name, override) => {
    expect(wallPhotoSchema.safeParse({ ...photo, ...override }).success).toBe(
      false,
    )
  })
  it('accepts a spam photo tagged spam', () => {
    expect(
      wallPhotoSchema.safeParse({
        ...photo,
        tags: ['spam', 'no_caption'],
        labels: { photo: { ...labels, spam: true } },
      }).success,
    ).toBe(true)
  })
})

describe('wall-photo request and response', () => {
  it('puts the JPEG inside the state array and asks only photo questions without caption', () => {
    const item = wallPhotoSchema.parse(photo)
    const request = buildRequest('wall-photo', item, 'test', 'test-image')
    expect(request.state).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,test-image' },
      },
    ])
    expect(Object.keys(request.questions)).toEqual(
      moderationKeys.map((key) => `photo_${key}`),
    )
    expect('assets' in request).toBe(false)
    expect(
      Object.keys(buildRequest('wall-photo', item).questions),
    ).toHaveLength(4)
  })
  it('asks all eight questions with caption and uses the existing caption state as text', () => {
    const item = wallPhotoSchema.parse({
      ...photo,
      caption: 'synthetic fixture',
      lang: 'en',
      labels: { photo: labels, caption: labels },
      tags: ['benign'],
    })
    const request = buildRequest('wall-photo', item, 'test', 'test-image')
    expect(request.state.map((part) => part.type)).toEqual([
      'text',
      'image_url',
    ])
    const text = request.state[0]
    expect(text.type === 'text' && JSON.parse(text.text)).toEqual({
      caption: item.caption,
    })
    expect(Object.keys(request.questions)).toHaveLength(8)
    for (const key of moderationKeys)
      expect(request.questions[`caption_${key}`]).toEqual(
        moderationQuestions['wall-caption'][key],
      )
    const calibration = buildRequest('wall-photo', item, 'test')
    expect(calibration.questions).toEqual(request.questions)
    expect(calibration.state.map((part) => part.type)).toEqual(['text'])
  })
  it.each([
    [
      'wall-caption',
      '761e817e151c82fbf74ad4f195fb4554440a8ce59f1d3e2b370e844647dab291',
    ],
    [
      'feedback-comment',
      '3662641f39af5e2f84f39536d8bb9662e19fb5d63823126b6d6fbe2f84c374f3',
    ],
    [
      'conversation-opening',
      '8007e44060160da1fd548a8f9397b3961acc67c94a1ac731bf75b8405d0f6503',
    ],
  ] as const)(
    'preserves %s request bytes captured before v3',
    (surface, hash) => {
      expect(
        createHash('sha256')
          .update(JSON.stringify(buildRequest(surface, loadData(surface)[0])))
          .digest('hex'),
      ).toBe(hash)
    },
  )
  it('requires every photo answer, rejects partial captions and unasked captions', async () => {
    const answers = Object.fromEntries(
      moderationKeys.map((key) => [`photo_${key}`, { type: 'noul', noul: 0 }]),
    )
    const response = { model: 'test', usage: { input_tokens: 3000 }, answers }
    expect(
      Object.keys(parseResponse('wall-photo', response).answers),
    ).toHaveLength(4)
    expect(() =>
      parseResponse('wall-photo', {
        ...response,
        answers: { ...answers, caption_abusive: { type: 'noul', noul: 0 } },
      }),
    ).toThrow()
    const all = {
      ...answers,
      ...Object.fromEntries(
        moderationKeys.map((key) => [
          `caption_${key}`,
          { type: 'noul', noul: 0 },
        ]),
      ),
    }
    const fetcher: typeof fetch = async () =>
      Response.json({ ...response, answers: all })
    await expect(
      requestDecision(
        'wall-photo',
        buildRequest('wall-photo', wallPhotoSchema.parse(photo)),
        'test',
        fetcher,
      ),
    ).rejects.toThrow('invalid_response')
  })
})
