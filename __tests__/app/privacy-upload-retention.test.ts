/**
 * /privacy promises how long an abandoned marketing-asset upload is kept. The
 * sweeper deletes blobs older than its retention, on the cron schedule in
 * `vercel.json`, so the true upper bound is retention + one schedule interval.
 * This pins the promise to that arithmetic, from the real sources.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('the abandoned-upload retention promise on /privacy', () => {
  it('is at least the sweep retention plus one daily run', () => {
    const cron = read('src/app/api/cron/cleanup-orphaned-blobs/route.ts')
    const retentionHours = Number(
      cron.match(/const BLOB_RETENTION_HOURS = (\d+)/)?.[1],
    )
    const schedule = (
      JSON.parse(read('vercel.json')) as {
        crons: { path: string; schedule: string }[]
      }
    ).crons.find((c) => c.path === '/api/cron/cleanup-orphaned-blobs')?.schedule
    // Once a day at a fixed hour: `m h * * *`.
    expect(schedule).toMatch(/^\d+ \d+ \* \* \*$/)
    const worstCaseHours = retentionHours + 24

    const privacy = read('src/app/(main)/privacy/page.tsx').replace(/\s+/g, ' ')
    const promise = privacy.match(
      /An upload that is never finished is deleted within about (\w+) (day|days)/,
    )
    expect(promise, 'the promise is stated').not.toBeNull()
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3 }
    const promisedHours = (words[promise![1]] ?? Number(promise![1])) * 24
    expect(promisedHours).toBeGreaterThanOrEqual(worstCaseHours)
  })
})
