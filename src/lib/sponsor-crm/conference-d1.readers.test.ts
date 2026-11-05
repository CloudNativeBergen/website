import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  rolloutFlags: vi.fn(),
  mergeKonfApiConference: vi.fn(),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientRead: { fetch: h.fetch },
  clientReadUncached: { fetch: h.fetch },
  clientReadCached: { fetch: h.fetch },
  clientWrite: {},
}))
vi.mock('@/lib/conference/konf-api', () => ({
  rolloutFlags: h.rolloutFlags,
  mergeKonfApiConference: h.mergeKonfApiConference,
}))

import { getRenewalContext, getRenewalContextIntoCurrent } from './renewal'
import { importAllHistoricSponsors } from './sanity'
import {
  getTermsForConference,
  listContractTemplates,
} from './contract-templates'

const org = { _ref: 'org-a' }
const conf = (id: string, startDate: string, endDate = startDate) => ({
  _id: id,
  title: `Sanity ${id}`,
  domains: [`${id}.example.test`],
  organization: org,
  startDate,
  endDate,
})
/** D1 values by conference id. */
let d1: Record<string, Record<string, string>> = {}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  d1 = {}
  h.rolloutFlags.mockResolvedValue({ apiRead: false })
  h.mergeKonfApiConference.mockImplementation(
    async (_host: string, c: { _id: string }) => ({ ...c, ...d1[c._id] }),
  )
})

const source = { _id: 'sfc-1', sponsor: { _ref: 's-1' }, tierTitle: 'Gold' }
const after = new Date('2027-06-01')

describe('renewal reads merged dates (#1997)', () => {
  // Sanity: 2025 → 2026 → 2027. D1 moves `c2026` before `c2025`.
  const editions = () => [
    conf('c2027', '2027-10-01'),
    conf('c2026', '2026-10-01'),
    conf('c2025', '2025-10-01'),
  ]
  const moved = { c2026: { startDate: '2024-10-01', endDate: '2024-10-02' } }

  it('unflagged: next edition by Sanity start date, gateway never called', async () => {
    h.fetch
      .mockResolvedValueOnce(conf('c2025', '2025-10-01'))
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(editions())
    const ctx = await getRenewalContext('org-a', 'c2025', 'sfc-1', after)
    expect(ctx.next?._id).toBe('c2026')
    expect(ctx.source?.conference.title).toBe('Sanity c2025')
    expect(h.mergeKonfApiConference).not.toHaveBeenCalled()
  })

  it('apiRead: next edition by D1 start date, title from D1', async () => {
    h.rolloutFlags.mockResolvedValue({ apiRead: true })
    d1 = { ...moved, c2025: { title: 'D1 2025' } }
    h.fetch
      .mockResolvedValueOnce(conf('c2025', '2025-10-01'))
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(editions())
    const ctx = await getRenewalContext('org-a', 'c2025', 'sfc-1', after)
    expect(ctx.next?._id).toBe('c2027')
    expect(ctx.source?.conference.title).toBe('D1 2025')
    // The read is the superset: no Sanity date filter in GROQ.
    expect(h.fetch.mock.calls[2][0]).not.toContain('startDate >')
  })

  it('apiRead: a later D1 end date means not ended, so next is not read', async () => {
    h.rolloutFlags.mockResolvedValue({ apiRead: true })
    d1 = { c2025: { endDate: '2027-12-01' } }
    h.fetch
      .mockResolvedValueOnce(conf('c2025', '2025-10-01'))
      .mockResolvedValueOnce(source)
    const ctx = await getRenewalContext('org-a', 'c2025', 'sfc-1', after)
    expect(ctx.source?._id).toBe('sfc-1')
    expect(ctx.next).toBeNull()
    expect(h.fetch).toHaveBeenCalledTimes(2)
  })

  it('gateway failure falls back to Sanity', async () => {
    h.rolloutFlags.mockResolvedValue({ apiRead: true })
    h.mergeKonfApiConference.mockRejectedValue(new Error('down'))
    h.fetch
      .mockResolvedValueOnce(conf('c2025', '2025-10-01'))
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(editions())
    const ctx = await getRenewalContext('org-a', 'c2025', 'sfc-1', after)
    expect(ctx.next?._id).toBe('c2026')
  })

  it('apiRead: previous edition by D1 start date', async () => {
    h.rolloutFlags.mockResolvedValue({ apiRead: true })
    d1 = moved
    // Sanity's previous of 2027 is 2026; D1 moved 2026 to 2024, so it is 2025.
    h.fetch
      .mockResolvedValueOnce(editions())
      .mockResolvedValueOnce(conf('c2025', '2025-10-01'))
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(editions())
    const ctx = await getRenewalContextIntoCurrent(
      'org-a',
      { _id: 'c2027', startDate: '2027-10-01' },
      'sfc-1',
      after,
    )
    expect(h.fetch.mock.calls[1][1]).toMatchObject({ conferenceId: 'c2025' })
    expect(ctx.next?._id).toBe('c2027')
  })
})

describe('historic sponsor import reads merged dates (#1997)', () => {
  const run = async () => {
    h.fetch
      .mockResolvedValueOnce(conf('c2027', '2027-10-01'))
      .mockResolvedValueOnce([
        conf('c2027', '2027-10-01'),
        conf('c2026', '2026-10-01'),
        conf('c2028', '2028-10-01'),
      ])
      .mockResolvedValue([])
    await importAllHistoricSponsors({
      targetConferenceId: 'c2027',
      organizationId: 'org-a',
    } as Parameters<typeof importAllHistoricSponsors>[0])
    return h.fetch.mock.calls[2]?.[1]?.conferenceIds
  }

  it('unflagged: Sanity start dates pick the previous conferences', async () => {
    expect(await run()).toEqual(['c2026'])
    expect(h.mergeKonfApiConference).not.toHaveBeenCalled()
  })

  it('apiRead: D1 start dates pick the previous conferences', async () => {
    h.rolloutFlags.mockResolvedValue({ apiRead: true })
    d1 = {
      c2028: { startDate: '2020-01-01' },
      c2026: { startDate: '2029-01-01' },
    }
    expect(await run()).toEqual(['c2028'])
  })
})

describe('contract templates label the conference with the merged title (#1997)', () => {
  const tpl = () => ({
    _id: 't1',
    title: 'T',
    conference: conf('c1', '2026-10-01'),
  })

  it('unflagged: Sanity title, only _id and title exposed', async () => {
    h.fetch.mockResolvedValueOnce([tpl()])
    const { templates } = await listContractTemplates('c1')
    expect(templates?.[0].conference).toEqual({ _id: 'c1', title: 'Sanity c1' })
    expect(h.mergeKonfApiConference).not.toHaveBeenCalled()
  })

  it('apiRead: D1 title in templates and terms', async () => {
    h.rolloutFlags.mockResolvedValue({ apiRead: true })
    d1 = { c1: { title: 'D1 c1' } }
    h.fetch.mockResolvedValueOnce([tpl()])
    const { templates } = await listContractTemplates('c1')
    expect(templates?.[0].conference).toEqual({ _id: 'c1', title: 'D1 c1' })
    h.fetch.mockResolvedValueOnce({ terms: [], conference: tpl().conference })
    expect((await getTermsForConference('c1')).conferenceName).toBe('D1 c1')
  })
})
