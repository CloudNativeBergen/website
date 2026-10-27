/**
 * The agreement tally's writes (Content judgement spec §7.3) as a REAL
 * `@sanity/client` transaction serializes them, applied by `@sanity/mutator`
 * (`versionedSanityStore`): `createIfNotExists` + `inc` on a deterministic id.
 */
import { describe, expect, it } from 'vitest'
import { createVersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'
import { addTally, scoreBand, tallyId, tallyable } from './tally'

const MODEL = 'typesafe/jev-1.14-20261014'
const judged = (
  reasons: { question: string; probability: number }[],
  extra: Record<string, unknown> = {},
) => ({ state: 'judged', model: MODEL, questionSet: 'v2', reasons, ...extra })

describe('scoreBand', () => {
  it.each([
    [0.5, '0.5-0.9'],
    [0.8999, '0.5-0.9'],
    [0.9, '0.9-1'],
    [1, '0.9-1'],
  ])('%s is in %s', (p, band) => {
    expect(scoreBand(p)).toBe(band)
  })
})

describe('tallyId', () => {
  it('is deterministic and a valid Sanity id (no slash)', () => {
    const id = tallyId({
      surface: 'feedbackComment',
      model: MODEL,
      questionSet: 'v2',
      question: 'personal_info',
      band: '0.5-0.9',
    })
    expect(id).toBe(
      'judgementTally-feedbackComment-v2-personal_info-0.5-0.9-typesafe-jev-1.14-20261014',
    )
    expect(id).toMatch(/^[A-Za-z0-9._-]+$/)
  })
})

describe('tallyable', () => {
  it('is the flagged questions of a judged, untallied summary', () => {
    expect(
      tallyable(
        judged([
          { question: 'abusive', probability: 0.88 },
          { question: 'spam', probability: 0.5 },
        ]),
      ),
    ).toEqual({
      model: MODEL,
      questionSet: 'v2',
      reasons: [
        { question: 'abusive', probability: 0.88 },
        { question: 'spam', probability: 0.5 },
      ],
    })
  })

  it.each([
    ['absent', undefined],
    ['not judged', { state: 'notJudged', notJudgedWhy: 'failed' }],
    ['nothing flagged', judged([])],
    [
      'already tallied',
      judged([{ question: 'spam', probability: 0.7 }], { talliedAt: 'x' }),
    ],
    [
      'no model',
      { ...judged([{ question: 'spam', probability: 0.7 }]), model: undefined },
    ],
    ['a stray low score', judged([{ question: 'spam', probability: 0.3 }])],
  ])('is null when %s', (_name, summary) => {
    expect(tallyable(summary)).toBeNull()
  })
})

describe('addTally', () => {
  it('creates the document on first use and increments the decision, one per flagged question in its own band', async () => {
    const store = createVersionedSanityStore()
    store.reset([])
    const clientWrite = store.clients.clientWrite as {
      transaction: () => import('@sanity/client').Transaction
    }
    const tx = clientWrite.transaction()
    addTally(
      tx,
      'feedbackComment',
      tallyable(
        judged([
          { question: 'abusive', probability: 0.95 },
          { question: 'personal_info', probability: 0.61 },
        ]),
      )!,
      'agreed',
    )
    await tx.commit()

    const docs = store.all().filter((d) => d._type === 'judgementTally')
    expect(docs).toHaveLength(2)
    expect(
      docs.map((d) => [d.question, d.band, d.agreed, d.disagreed]),
    ).toEqual([
      ['abusive', '0.9-1', 1, 0],
      ['personal_info', '0.5-0.9', 1, 0],
    ])
    // Nothing that points at content, an organization or a conference.
    for (const doc of docs)
      expect(
        Object.keys(doc)
          .filter((key) => !key.startsWith('_'))
          .sort(),
      ).toEqual([
        'agreed',
        'band',
        'disagreed',
        'model',
        'question',
        'questionSet',
        'surface',
      ])

    // A later disagreement on the same question and band counts on the same document.
    const again = clientWrite.transaction()
    addTally(
      again,
      'feedbackComment',
      tallyable(judged([{ question: 'abusive', probability: 0.91 }]))!,
      'disagreed',
    )
    await again.commit()
    const abusive = store
      .all()
      .find((d) => d._type === 'judgementTally' && d.question === 'abusive')!
    expect([abusive.agreed, abusive.disagreed]).toEqual([1, 1])
    expect(
      store.all().filter((d) => d._type === 'judgementTally'),
    ).toHaveLength(2)
  })
})
