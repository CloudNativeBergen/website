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

  it('gives every person a unique name and email', () => {
    const names: string[] = []
    const emails: string[] = []
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk)
      if (!v || typeof v !== 'object') return
      const o = v as Record<string, unknown>
      if (typeof o.email === 'string') {
        if (typeof o.name === 'string') names.push(o.name)
        emails.push(o.email)
      }
      if (typeof o.invitedEmail === 'string') {
        names.push(o.invitedName as string)
        emails.push(o.invitedEmail)
      }
      if (typeof o.buyerEmail === 'string') emails.push(o.buyerEmail)
      Object.values(o).forEach(walk)
    }
    walk(generateDemoFixtures({ seed: 7, now }))
    expect(emails.length).toBeGreaterThan(20)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(emails).size).toBe(emails.length)
  })

  it('resolves every *Key reference to an existing key', () => {
    const keys = new Set<string>()
    const refs: [string, string][] = []
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk)
      if (!v || typeof v !== 'object') return
      for (const [k, x] of Object.entries(v)) {
        if (k === 'key' && typeof x === 'string') keys.add(x)
        else if (/Keys?$/.test(k) && k !== 'photoKey')
          for (const ref of [x].flat()) refs.push([k, ref as string])
        walk(x)
      }
    }
    walk(generateDemoFixtures({ seed: 7, now }))
    expect(refs.length).toBeGreaterThan(20)
    expect(refs.filter(([, ref]) => !keys.has(ref))).toEqual([])
  })
})
