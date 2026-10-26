import { describe, expect, it } from 'vitest'
import {
  matchesTriage,
  needsALook,
  reasonText,
  triageCounts,
  type TriagedComment,
} from './triage'

const judged = (
  ...reasons: [string, number][]
): TriagedComment['judgement'] => ({
  state: 'judged',
  reasons: reasons.map(([question, probability]) => ({
    question,
    probability,
  })),
})
const c = (fields: Partial<TriagedComment>): TriagedComment => ({
  hidden: false,
  flagged: false,
  judgement: null,
  kept: null,
  ...fields,
})

describe('reasonText', () => {
  it('names every reason with its percentage, strongest first, in organizer words', () => {
    expect(reasonText(judged(['sexual', 0.82], ['abusive', 0.714]))).toBe(
      'may be sexual (82%), may be abusive (71%)',
    )
  })
  it('says "personal details", never what kind (§8.2)', () => {
    expect(reasonText(judged(['personal_info', 0.61]))).toBe(
      'may contain personal details (61%)',
    )
  })
  it('is empty for nothing flagged or not judged', () => {
    expect(reasonText(judged())).toBe('')
    expect(reasonText({ state: 'notJudged', why: 'failed' })).toBe('')
    expect(reasonText(null)).toBe('')
  })
})

describe('the three tiles', () => {
  const harsh = c({ judgement: judged() })
  const speakerOnly = c({ flagged: true, judgement: judged() })
  const both = c({ flagged: true, judgement: judged(['abusive', 0.88]) })
  const unsafeOnly = c({ judgement: judged(['personal_info', 0.93]) })
  const notJudged = c({ judgement: null })
  const failed = c({ judgement: { state: 'notJudged', why: 'spendCap' } })
  const kept = c({
    judgement: judged(['personal_info', 0.61]),
    kept: { by: 'Kari', at: '2026-10-27T10:14:00.000Z' },
  })
  const hiddenUnsafe = c({ hidden: true, judgement: judged(['abusive', 0.91]) })
  const hiddenUnchecked = c({ hidden: true })
  const all = [
    harsh,
    speakerOnly,
    both,
    unsafeOnly,
    notJudged,
    failed,
    kept,
    hiddenUnsafe,
    hiddenUnchecked,
  ]

  it('counts speaker flags and Jev’s advice apart; a Keep ends the advice; hidden counts under nothing', () => {
    expect(triageCounts(all)).toEqual({
      all: 9,
      speaker: 2,
      unsafe: 2,
      unchecked: 2,
    })
  })

  it('filters by the same rule it counts by', () => {
    expect(all.filter((x) => matchesTriage(x, 'speaker'))).toEqual([
      speakerOnly,
      both,
    ])
    expect(all.filter((x) => matchesTriage(x, 'unsafe'))).toEqual([
      both,
      unsafeOnly,
    ])
    expect(all.filter((x) => matchesTriage(x, 'unchecked'))).toEqual([
      notJudged,
      failed,
    ])
  })

  it('collapses only what needs a look: harsh-but-fair, kept and hidden comments stay open', () => {
    expect(all.filter(needsALook)).toEqual([speakerOnly, both, unsafeOnly])
  })
})
