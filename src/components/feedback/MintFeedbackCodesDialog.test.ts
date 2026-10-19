/**
 * The bulk mint's confirmation text (#1459): true for every count, and
 * right in the singular.
 */
import { describe, expect, it } from 'vitest'
import { previewText } from './MintFeedbackCodesDialog'

describe('previewText', () => {
  it.each([
    [
      { confirmed: 0, withoutCode: 0, mintable: 0 },
      'No talk is confirmed yet.',
    ],
    [
      { confirmed: 1, withoutCode: 0, mintable: 0 },
      'The confirmed talk has a Feedback Code.',
    ],
    [
      { confirmed: 43, withoutCode: 0, mintable: 0 },
      'All 43 confirmed talks have a Feedback Code.',
    ],
    [
      { confirmed: 1, withoutCode: 1, mintable: 1 },
      '1 of 1 confirmed talk has no Feedback Code yet. Mint it, so its room’s sheet can be printed. Talks with a code keep it.',
    ],
    [
      { confirmed: 43, withoutCode: 41, mintable: 41 },
      '41 of 43 confirmed talks have no Feedback Code yet. Mint one for each, so every room’s sheet can be printed. Talks with a code keep it.',
    ],
    [
      { confirmed: 43, withoutCode: 41, mintable: 39 },
      '41 of 43 confirmed talks have no Feedback Code yet. 39 of them can still get one; for the rest the feedback window has closed or no speaker is left. Talks with a code keep it.',
    ],
    [
      { confirmed: 43, withoutCode: 1, mintable: 0 },
      '1 of 43 confirmed talks has no Feedback Code yet. It can’t get one now: its feedback window has closed or no speaker is left.',
    ],
    [
      { confirmed: 43, withoutCode: 2, mintable: 0 },
      '2 of 43 confirmed talks have no Feedback Code yet. None of them can get one now: their feedback windows have closed or no speaker is left.',
    ],
  ])('%o', (counts, text) => {
    expect(previewText(counts)).toBe(text)
  })
})
