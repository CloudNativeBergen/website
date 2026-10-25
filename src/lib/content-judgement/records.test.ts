/**
 * @vitest-environment node
 *
 * The stored-Judgement read behind the /privacy disclosure (spec §5, §13.1),
 * EXECUTED: the Sanity boundary evaluates the exact query string the module
 * sends, with groq-js, against a two-organization dataset.
 */
import { describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
let dataset: object[] = []
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset, params })).get(),
  },
}))

const { hasStoredJudgements } = await import('./records')

const conference = (id: string, org: string) => ({
  _id: id,
  _type: 'conference',
  organization: ref(org),
})
const judgement = (id: string, conf: string) => ({
  _id: id,
  _type: 'contentJudgement',
  conference: ref(conf),
})

describe('hasStoredJudgements', () => {
  it('sees a Judgement in any of the organization’s conferences', async () => {
    dataset = [
      conference('conf-a1', 'org-a'),
      conference('conf-a2', 'org-a'),
      conference('conf-b', 'org-b'),
      judgement('cj-1', 'conf-a2'),
    ]
    expect(await hasStoredJudgements('org-a')).toBe(true)
  })

  it('never counts another organization’s Judgements', async () => {
    dataset = [
      conference('conf-a', 'org-a'),
      conference('conf-b', 'org-b'),
      judgement('cj-1', 'conf-b'),
      // A document of another type on this organization's conference.
      { _id: 'wp-1', _type: 'wallPost', conference: ref('conf-a') },
    ]
    expect(await hasStoredJudgements('org-a')).toBe(false)
    expect(await hasStoredJudgements('org-b')).toBe(true)
  })

  it('is false for an organization with no conferences', async () => {
    dataset = [conference('conf-b', 'org-b'), judgement('cj-1', 'conf-b')]
    expect(await hasStoredJudgements('org-none')).toBe(false)
  })
})
