import { describe, expect, it } from 'vitest'
import { generateDemoFixtures } from './generate'

const now = new Date('2026-11-08T12:00:00Z')

describe('generateDemoFixtures', () => {
  it('is deterministic for the same seed and now', () => {
    expect(generateDemoFixtures({ seed: 42, now })).toEqual(
      generateDemoFixtures({ seed: 42, now }),
    )
  })

  it('shifts dates with now', () => {
    const a = generateDemoFixtures({ seed: 42, now })
    const b = generateDemoFixtures({
      seed: 42,
      now: new Date('2027-01-07T12:00:00Z'),
    })
    expect(a.d1.editions.map((e) => e.startDate)).toEqual([
      '2025-12-03',
      '2026-11-29',
      '2027-11-28',
    ])
    expect(b.d1.editions[1].startDate).toBe('2027-01-28')
  })

  it('uses only example.com or .test emails', () => {
    const json = JSON.stringify(generateDemoFixtures({ seed: 7, now }))
    const emails = json.match(/[\w.+-]+@[\w.-]+/g) ?? []
    expect(emails.length).toBeGreaterThan(20)
    for (const e of emails) expect(e).toMatch(/@example\.com$|\.test$/)
  })
})
