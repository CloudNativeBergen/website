/**
 * @vitest-environment node
 *
 * `dinnerChoice-sanity.ts` (#1592, phase 5): the written document, and the
 * real GROQ run by groq-js against an in-memory dataset.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  createOrReplace: vi.fn(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
  clientWrite: { createOrReplace: h.createOrReplace },
}))

import {
  getDinnerChoice,
  getDinnerChoiceContext,
  getDinnerChoiceSummaryInputs,
  setDinnerChoice,
} from './dinnerChoice-sanity'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const talk = (id: string, speakers: string[], status = 'confirmed') => ({
  _id: id,
  _type: 'talk',
  conference: ref('conf-A'),
  status,
  speakers: speakers.map(ref),
})

beforeEach(() => {
  h.createOrReplace.mockReset()
  h.dataset = [
    {
      _id: 'conf-A',
      _type: 'conference',
      speakerInfo: { dinner: { routes: [{ _key: 'taxi', label: 'Taxi' }] } },
    },
    { _id: 'ada', _type: 'speaker', name: 'Ada', email: 'ada@example.test' },
    { _id: 'bo', _type: 'speaker', name: 'Bo' },
    talk('t1', ['ada']),
    // `gone` was deleted: its reference dereferences to null.
    talk('t2', ['gone']),
    talk('t3', ['bo'], 'canceled'),
    { ...talk('drafts.t4', ['bo']) },
    {
      _id: 'dinnerChoice.conf-A.ada',
      _type: 'speakerDinnerChoice',
      conference: ref('conf-A'),
      speaker: ref('ada'),
      choice: 'taxi',
    },
    {
      _id: 'dinnerChoice.conf-B.bo',
      _type: 'speakerDinnerChoice',
      conference: ref('conf-B'),
      speaker: ref('bo'),
      choice: 'own',
    },
  ]
})

describe('dinnerChoice-sanity', () => {
  it('writes the deterministic id and shape', async () => {
    await setDinnerChoice('conf-A', 'ada', 'taxi')
    const doc = h.createOrReplace.mock.calls[0][0]
    expect(doc).toEqual({
      _id: 'dinnerChoice.conf-A.ada',
      _type: 'speakerDinnerChoice',
      conference: ref('conf-A'),
      speaker: ref('ada'),
      choice: 'taxi',
      updatedAt: expect.any(String),
    })
    expect(Number.isNaN(Date.parse(doc.updatedAt))).toBe(false)
  })

  it('reads the stored choice by id', async () => {
    expect(await getDinnerChoice('conf-A', 'ada')).toBe('taxi')
    expect(await getDinnerChoice('conf-A', 'bo')).toBeNull()
  })

  it('counts only a confirmed, published talk in this conference', async () => {
    expect(await getDinnerChoiceContext('conf-A', 'ada')).toEqual({
      routes: [{ _key: 'taxi', label: 'Taxi' }],
      hasConfirmedTalk: true,
    })
    // Bo has a canceled talk and a draft only.
    expect(
      (await getDinnerChoiceContext('conf-A', 'bo')).hasConfirmedTalk,
    ).toBe(false)
    expect(
      (await getDinnerChoiceContext('conf-B', 'ada')).hasConfirmedTalk,
    ).toBe(false)
  })

  it('summary inputs: confirmed speakers, a deleted one as null, this conference only', async () => {
    const { routes, speakers, choices } =
      await getDinnerChoiceSummaryInputs('conf-A')
    expect(routes).toEqual([{ _key: 'taxi', label: 'Taxi' }])
    expect(speakers).toEqual([
      { _id: 'ada', name: 'Ada', email: 'ada@example.test' },
      null,
    ])
    expect(choices).toEqual([{ speakerId: 'ada', choice: 'taxi' }])
  })
})
