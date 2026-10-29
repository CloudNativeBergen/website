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
