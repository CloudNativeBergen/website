/**
 * @vitest-environment node
 *
 * The client's gate query (spec §5), EXECUTED: the Sanity boundary evaluates
 * the exact query string with groq-js against two organizations, so one
 * organization being on can never switch another on.
 */
import { describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

let dataset: object[] = []
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset, params })).get(),
  },
}))

const { isContentJudgementEnabled } = await import('./settings')

const org = (id: string, contentJudgement?: object) => ({
  _id: id,
  _type: 'organization',
  ...(contentJudgement && { contentJudgement }),
})

describe('isContentJudgementEnabled', () => {
  it('answers for this organization only', async () => {
    dataset = [org('org-on', { enabled: true }), org('org-off')]
    expect(await isContentJudgementEnabled('org-on')).toBe(true)
    expect(await isContentJudgementEnabled('org-off')).toBe(false)
  })

  it('is off when another organization is on, whatever the order', async () => {
    dataset = [
      org('org-off', { enabled: false }),
      org('org-on', { enabled: true }),
    ]
    expect(await isContentJudgementEnabled('org-off')).toBe(false)
    dataset = [
      org('org-on', { enabled: true }),
      org('org-off', { enabled: false }),
    ]
    expect(await isContentJudgementEnabled('org-off')).toBe(false)
  })

  it('a document of another type with the same field never counts', async () => {
    dataset = [
      {
        _id: 'org-x',
        _type: 'conference',
        contentJudgement: { enabled: true },
      },
    ]
    expect(await isContentJudgementEnabled('org-x')).toBe(false)
  })

  it('only `true` is on', async () => {
    dataset = [org('org-a', { enabled: 'yes' })]
    expect(await isContentJudgementEnabled('org-a')).toBe(false)
  })
})
