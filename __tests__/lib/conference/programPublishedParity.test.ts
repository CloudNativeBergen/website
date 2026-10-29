import { describe, expect, it } from 'vitest'
import { isProgramPublished } from '@/lib/conference/state'
import { isProgramPublished as homepageCopy } from '@/lib/homepage/contentStatus'
import type { Conference } from '@/lib/conference/types'

// contentStatus.ts must stay import-free, so it restates the rule. This keeps
// the copy in step with the shared function.
describe('contentStatus programme rule matches isProgramPublished', () => {
  const cases: [string, string][] = [
    ['2026-05-01', '2026-04-30T21:59:59Z'],
    ['2026-05-01', '2026-04-30T22:00:00Z'],
    ['2026-01-15', '2026-01-14T22:59:59Z'],
    ['2026-01-15', '2026-01-14T23:00:00Z'],
    ['', '2026-05-01T12:00:00Z'],
  ]

  it.each(cases)('programDate %s at %s', (programDate, iso) => {
    const now = new Date(iso)
    expect(homepageCopy({ programDate } as Conference, now.getTime())).toBe(
      isProgramPublished({ programDate }, now),
    )
  })
})
