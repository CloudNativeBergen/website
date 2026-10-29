/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { parse, evaluate } from 'groq-js'
import {
  buildDashboardQuery,
  dashboardQueryParams,
} from '@/lib/dashboard/aggregate'
import { shapeSponsorsWaiting } from '@/lib/dashboard/widget-data'

const sfc = (id: string, conference: string, fields = {}) => ({
  _id: id,
  _type: 'sponsorForConference',
  _updatedAt: '2999-01-01T00:00:00Z',
  conference: { _ref: conference },
  sponsor: { _ref: `s-${id}` },
  status: 'closed-won',
  contractStatus: 'contract-signed',
  invoiceStatus: 'overdue',
  ...fields,
})
const dataset = [
  { _id: 'org-1', _type: 'speaker', name: 'Alice' },
  { _id: 'org-2', _type: 'speaker', name: 'Bob' },
  ...['mine', 'bobs', 'nobody', 'other'].map((id) => ({
    _id: `s-${id}`,
    _type: 'sponsor',
    name: id,
  })),
  sfc('mine', 'a', { assignedTo: { _ref: 'org-1' } }),
  sfc('bobs', 'a', { assignedTo: { _ref: 'org-2' } }),
  sfc('nobody', 'a'),
  sfc('other', 'b'),
]

async function load(organizerId: string | null) {
  const result = await (
    await evaluate(parse(buildDashboardQuery(['sponsorActions'])!), {
      dataset,
      params: dashboardQueryParams('a'),
    })
  ).get()
  return shapeSponsorsWaiting(result.sponsorActions, organizerId)
}

describe('sponsors waiting on you', () => {
  it('reads this conference only, and keeps mine plus unassigned', async () => {
    const { items } = await load('org-1')
    expect(items.map((i) => [i.sponsorName, i.title])).toEqual([
      ['mine', 'Invoice Overdue'],
      ['nobody', 'Invoice Overdue'],
      ['nobody', 'Assign an owner'],
    ])
    expect(items[0].href).toBe('/admin/sponsors/mine?view=pipeline')
  })

  it('caps the card at six items', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      sfc(`x${i}`, 'a', { sponsor: { name: `x${i}` } }),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(shapeSponsorsWaiting(many as any, null).items).toHaveLength(6)
  })
})

describe('renewal reminders in the composed query (R2, #1687)', () => {
  const conf = (id: string, org: string, startDate: string) => ({
    _id: id,
    _type: 'conference',
    title: id,
    organization: { _ref: org },
    startDate,
    domains: [`${id}.test`],
  })
  const data = [
    { _id: 's-acme', _type: 'sponsor', name: 'Acme' },
    { _id: 's-beta', _type: 'sponsor', name: 'Beta' },
    { _id: 's-foreign', _type: 'sponsor', name: 'Foreign' },
    { _id: 'org-1', _type: 'speaker', name: 'Alice' },
    conf('y2025', 'org-a', '2025-10-27'),
    conf('y2026', 'org-a', '2026-10-27'),
    // Another organization's edition is closer in time; it must not count.
    conf('other', 'org-b', '2026-01-01'),
    sfc('old-acme', 'y2025', {
      sponsor: { _ref: 's-acme' },
      assignedTo: { _ref: 'org-1' },
    }),
    sfc('old-beta', 'y2025', { sponsor: { _ref: 's-beta' } }),
    // Beta already has a deal this year (any status).
    sfc('new-beta', 'y2026', {
      sponsor: { _ref: 's-beta' },
      status: 'prospect',
    }),
    sfc('foreign', 'other', { sponsor: { _ref: 's-foreign' } }),
  ]
  const run = async (orgId: string) => {
    const query = buildDashboardQuery(['renewals'])!
    const result = await evaluate(parse(query), {
      dataset: data,
      params: dashboardQueryParams('y2026', new Date(), {
        orgId,
        currentStartDate: '2026-10-27',
      }),
    })
    return (await result.get()).renewals
  }

  it('lists previous-edition sponsors with no deal this year, same org only', async () => {
    const row = await run('org-a')
    expect(row).toMatchObject({
      _id: 'y2025',
      title: 'y2025',
      domains: ['y2025.test'],
    })
    expect(row.candidates.map((c: { _id: string }) => c._id)).toEqual([
      'old-acme',
    ])
  })

  it("never reads another organization's editions, and nothing for none", async () => {
    const other = await run('org-b')
    expect(other._id).toBe('other')
    expect(other.candidates.map((c: { _id: string }) => c._id)).toEqual([
      'foreign',
    ])
    expect(await run('')).toBeNull()
  })

  it('shows mine and unassigned renewals, linking to the old record', () => {
    const renewals = {
      edition: {
        _id: 'y2025',
        title: 'CNB 2025',
        origin: 'https://y2025.test',
      },
      candidates: [
        {
          _id: 'old-acme',
          name: 'Acme',
          assignedTo: { _id: 'org-1', name: 'A' },
        },
        {
          _id: 'old-bob',
          name: 'Bob',
          assignedTo: { _id: 'org-2', name: 'B' },
        },
        { _id: 'old-free', name: 'Free' },
      ],
    }
    const items = shapeSponsorsWaiting([], 'org-1', renewals).items
    expect(items.map((i) => i.href)).toEqual([
      'https://y2025.test/admin/sponsors/old-acme',
      'https://y2025.test/admin/sponsors/old-free',
    ])
  })
})
