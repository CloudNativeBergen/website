/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import { extractPdfText } from '../../../__tests__/lib/pdf/extract-text'
import type { Context } from '@/server/trpc'
import type { ReportSnapshot } from '@/lib/marketing/report/types'
import { marketingRouter } from './marketing'

const h = vi.hoisted(() => ({
  conference: vi.fn(),
  fetch: vi.fn(),
  plan: vi.fn(),
  sources: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.conference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientWrite: {},
}))
vi.mock('@/lib/marketing/sanity', () => ({ getPlanView: h.plan }))
vi.mock('@/lib/marketing/copy-sanity', () => ({ getCopySources: h.sources }))
vi.mock('@/lib/marketing/snapshots', () => ({
  conferenceOrgId: vi.fn(async () => 'org-A'),
}))
vi.mock('@/lib/marketing/ceiling-check', () => ({}))
vi.mock('@/lib/speaker/sanity', () => ({}))

const conference = {
  _id: 'conf-A',
  title: 'Report edition',
  organization: { _ref: 'org-A' },
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
}
const campaign = {
  _id: 'campaign-A',
  key: 'cfp',
  title: 'Call for papers',
  startDate: '2027-01-10',
  endDate: '2027-03-01',
  startMilestone: 'CFP_OPEN',
  endMilestone: 'CFP_CLOSE',
  primaryOutcome: 'cfpSubmissions',
  target: 80,
  provisional: false,
  optional: false,
}
function snapshot(): ReportSnapshot {
  return {
    _id: 'snapshot-A',
    _type: 'marketingSnapshot',
    conference: { _type: 'reference', _ref: 'conf-A' },
    campaign: { _type: 'reference', _ref: 'campaign-A' },
    date: '2027-02-28',
    takenAt: '2027-03-01T04:00:00Z',
    primaryOutcomeValue: 68,
    primaryOutcomeAttributed: false,
    primaryOutcomeAttributedValue: 41,
    secondary: {
      attributedSessions: 1204,
      checkoutClickThrough: 96,
      blueskyInteractions: 214,
    },
    source: { posthog: 'ok', bluesky: 'ok' },
    perTask: [
      {
        _key: 'deleted',
        _type: 'marketingSnapshotTask',
        task: { _type: 'reference', _ref: 'deleted-task', _weak: true },
        sessions: 612,
        clicks: 58,
        blueskyLikes: 100,
        blueskyReposts: 30,
        blueskyReplies: 8,
        blueskyQuotes: 3,
      },
    ],
  }
}
const input = { from: '2027-01-10', to: '2027-03-09', grain: 'daily' as const }
const t = initTRPC.context<Context>().create()
function caller(org = 'org-A') {
  const speaker = { _id: 'admin', organizerOrgIds: [org] }
  const user = { email: 'admin@example.com', name: 'Admin', picture: '' }
  const context = {
    req: { headers: new Headers(), url: 'http://localhost' },
    session: { expires: '2099-01-01', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
  return t.createCallerFactory(marketingRouter)(context).report
}

beforeEach(() => {
  vi.clearAllMocks()
  h.conference.mockResolvedValue({ conference, error: null })
  h.plan.mockResolvedValue({
    plan: {
      _id: 'plan-A',
      ownerId: null,
      ownerName: null,
      templateVersion: '2026.1',
      copiedFromTitle: null,
      createdAt: '2027-01-01T00:00:00Z',
    },
    campaigns: [campaign],
    tasks: [],
  })
  h.sources.mockResolvedValue([])
  h.fetch.mockImplementation(
    async (query: string, params: Record<string, string>) => {
      // Persistence boundary holds a foreign row with a conspicuous value. The
      // actual scoped helper must constrain the query before it reaches here.
      const foreign = {
        ...snapshot(),
        _id: 'snapshot-B',
        conference: { _type: 'reference', _ref: 'conf-B' },
        primaryOutcomeValue: 999999,
      }
      const rows =
        query.includes('conference._ref == $conferenceId') &&
        params.conferenceId === 'conf-A'
          ? [snapshot()]
          : [snapshot(), foreign]
      return rows.filter(
        (row) => row.date >= params.from && row.date < params.to,
      )
    },
  )
})

describe('marketing.report stored-observation reads and exports', () => {
  it('reads nonempty numbers through the real scoped loader and returns null previous edition', async () => {
    const report = await caller().get(input)
    expect(report.summary[0].value).toBe(68)
    expect(report.summary[0].attributedValue).toBe(41)
    expect(report.snapshots.map((s) => s.primaryOutcomeValue)).toEqual([68])
    expect(report.previousEdition).toBeNull()
    expect(h.plan).toHaveBeenCalledWith('conf-A')
    expect(h.fetch.mock.calls[0][1]).toMatchObject({
      conferenceId: 'conf-A',
      // Read history before narrowing so Reset includes retired Campaign dates.
      from: '0001-01-01',
      to: '9999-12-31',
    })
  })
  it('exports original Campaign and unresolved weak Task rows with their numbers', async () => {
    const { csv } = await caller().exportCsv(input)
    expect(csv).toContain('68')
    expect(csv).toContain('1204')
    expect(csv).toContain('deleted-task')
    expect(csv).toContain('612')
    expect(csv).toContain('58')
  })
  it('renders nonempty PDF numbers using the real renderer and the shared report', async () => {
    const { pdf } = await caller().exportPdf(input)
    expect(Buffer.from(pdf, 'base64').subarray(0, 4).toString()).toBe('%PDF')
    const text = await extractPdfText(Buffer.from(pdf, 'base64'))
    expect(text).toContain('68')
    expect(text).toContain('80')
    expect(text).toContain('58')
    expect(text).toContain('Call for papers')
  })
  it('uses the inclusive grace day by making the upper boundary end + 8', async () => {
    const report = await caller().get({})
    expect(report.range.from).toBe('2027-01-10')
    expect(report.range.to).toBe('2027-03-09')
  })

  it.each([
    { from: '2027-02-30', to: '2027-03-09' },
    { from: '2027-03-09', to: '2027-03-09' },
    { from: '2027-03-10', to: '2027-03-09' },
    { from: '2027-01-10' },
    { to: '2027-03-09' },
  ])('refuses an invalid range before reads: %j', async (bad) => {
    await expect(caller().get(bad)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(h.plan).not.toHaveBeenCalled()
    expect(h.fetch).not.toHaveBeenCalled()
  })
  it.each(['get', 'exportCsv', 'exportPdf'] as const)(
    'refuses client tenant substitution on %s before data reads',
    async (method) => {
      await expect(
        caller()[method]({ ...input, conferenceId: 'conf-B' } as typeof input),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(h.plan).not.toHaveBeenCalled()
      expect(h.fetch).not.toHaveBeenCalled()
    },
  )
  it.each(['get', 'exportCsv', 'exportPdf'] as const)(
    'refuses a foreign organizer on %s before Snapshot reads',
    async (method) => {
      await expect(caller('org-B')[method](input)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
      expect(h.plan).not.toHaveBeenCalled()
      expect(h.fetch).not.toHaveBeenCalled()
    },
  )
})
