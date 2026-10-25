import { describe, expect, it } from 'vitest'
import { HELD_OUT_GATES, parseGateFile } from './gates'

const row = {
  question: 'abusive',
  surface: 'feedbackComment',
  build: 'typesafe/jev-1.14-20261014',
  questionSet: 'v2',
  falsePositiveRate: 0.0033,
  recall: 0.86,
  negatives: 300,
  date: '2026-11-02',
}

describe('the held-out gate file', () => {
  it('is committed empty: no held-out set exists yet', () => {
    expect(HELD_OUT_GATES).toEqual([])
  })

  it('accepts a complete row', () => {
    expect(parseGateFile([row])).toEqual([row])
    const photo = { ...row, surface: 'wallPost', question: 'photo_spam' }
    expect(parseGateFile([photo])).toEqual([photo])
  })

  it.each([
    ['a rate above 1', { falsePositiveRate: 1.2 }],
    ['an unknown question', { question: 'rude' }],
    ['a surface that is never enforced', { surface: 'conversation' }],
    [
      'a requested model instead of the returned build',
      { build: 'typesafe/jev-1.14' },
    ],
    ['a question set that is not a version', { questionSet: '2' }],
    ['a date that is not a day', { date: 'soon' }],
    ['an extra field', { note: 'item fc-301 was wrong' }],
    ['a photo question on comments', { question: 'photo_spam' }],
    [
      'a bare question on Wall Posts',
      { surface: 'wallPost', questionSet: 'v4' },
    ],
  ])('refuses %s', (_name, change) => {
    expect(() => parseGateFile([{ ...row, ...change }])).toThrow()
  })
})
