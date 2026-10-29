/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { parse, evaluate } from 'groq-js'
import {
  ACTIVITY_LOG_PAGE_SIZE,
  activityLogParams,
  buildActivityLogQuery,
  toActivityLogPage,
  type ActivityLogFilters,
} from '@/lib/sponsor-crm/activities'
import { activityLogHref } from '@/components/admin/sponsor/SponsorActivityLog'
import type { SponsorActivityExpanded } from '@/lib/sponsor-crm/types'

const sfc = (id: string, conference: string, owner?: string) => ({
  _id: id,
  _type: 'sponsorForConference',
  conference: { _ref: conference },
  sponsor: { _ref: `s-${id}` },
  ...(owner && { assignedTo: { _ref: owner } }),
})
const act = (
  id: string,
  sfcId: string,
  activityType: string,
  createdAt: string,
) => ({
  _id: id,
  _type: 'sponsorActivity',
  sponsorForConference: { _ref: sfcId },
  activityType,
  description: id,
  createdAt,
})

const dataset = [
  { _id: 's-acme', _type: 'sponsor', name: 'Acme' },
  { _id: 's-beta', _type: 'sponsor', name: 'Beta' },
  { _id: 's-foreign', _type: 'sponsor', name: 'Foreign' },
  sfc('acme', 'conf-a', 'org-1'),
  sfc('beta', 'conf-a', 'org-2'),
  sfc('foreign', 'conf-b', 'org-1'),
  act('a1', 'acme', 'note', '2026-01-01T00:00:00Z'),
  act('a2', 'acme', 'stage_change', '2026-01-03T00:00:00Z'),
  act('b1', 'beta', 'call', '2026-01-02T00:00:00Z'),
  act('f1', 'foreign', 'note', '2026-01-04T00:00:00Z'),
]

async function run(
  filters: ActivityLogFilters,
  offset = 0,
  data: unknown[] = dataset,
) {
  // Slice bounds are params, so groq-js needs them at parse time too.
  const params = activityLogParams('conf-a', filters, offset)
  const tree = parse(buildActivityLogQuery(filters), { params })
  const rows = (await (
    await evaluate(tree, { dataset: data, params })
  ).get()) as SponsorActivityExpanded[]
  return toActivityLogPage(rows, offset)
}

const ids = (page: { items: SponsorActivityExpanded[] }) =>
  page.items.map((i) => i._id)

describe('activity log query', () => {
  it("lists this conference's activity newest first, never a foreign one", async () => {
    const page = await run({})
    expect(ids(page)).toEqual(['a2', 'b1', 'a1'])
    expect(page.items[0].sponsorForConference.sponsor.name).toBe('Acme')
    expect(page.nextCursor).toBeNull()
  })

  it('filters by sponsor', async () => {
    expect(ids(await run({ sponsor: 'beta' }))).toEqual(['b1'])
    // A foreign sponsor id still reads nothing.
    expect(ids(await run({ sponsor: 'foreign' }))).toEqual([])
  })

  it('filters by owner', async () => {
    expect(ids(await run({ owner: 'org-1' }))).toEqual(['a2', 'a1'])
  })

  it('filters by type', async () => {
    expect(ids(await run({ type: 'note' }))).toEqual(['a1'])
  })

  it('pages 50 at a time', async () => {
    const many = [
      sfc('acme', 'conf-a'),
      ...Array.from({ length: 120 }, (_, i) =>
        act(
          `x${String(i).padStart(3, '0')}`,
          'acme',
          'note',
          new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
        ),
      ),
    ]
    const first = await run({}, 0, many)
    expect(first.items).toHaveLength(ACTIVITY_LOG_PAGE_SIZE)
    expect(first.items[0]._id).toBe('x119')
    expect(first.nextCursor).toBe(50)
    const third = await run({}, 100, many)
    expect(third.items).toHaveLength(20)
    expect(third.items.at(-1)!._id).toBe('x000')
    expect(third.nextCursor).toBeNull()
  })
})

describe('activity log link', () => {
  it("opens the sponsor's history in the board panel", () => {
    expect(activityLogHref('sfc-1')).toBe(
      '/admin/sponsors/crm?sponsor=sfc-1&view=history',
    )
  })
})
