/**
 * @vitest-environment node
 *
 * Drives the REAL cron handler against an in-memory stand-in for Sanity: the
 * fetch answers with the current rows and every patch is applied to them, so a
 * second run in the same day sees exactly what the first run left behind. That
 * is the only way the idempotency claim means anything — asserting on fixtures
 * the test itself froze would prove nothing.
 */
import { NextRequest } from 'next/server'
import { renderToStaticMarkup } from 'react-dom/server'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Row {
  _id: string
  _rev: string
  [key: string]: any
}

let rows: Row[] = []
const sends: Array<{ orgId: string | null | undefined; payload: any }> = []
let sendBehaviour: (to: string) => void = () => {}

const mockFetch = vi.fn(async () => rows.map((row) => ({ ...row })))

function patch(id: string) {
  const ops: { set?: Record<string, unknown>; unset?: string[] } = {}
  let expectedRev: string | undefined
  const builder = {
    ifRevisionId(rev: string) {
      expectedRev = rev
      return builder
    },
    set(values: Record<string, unknown>) {
      ops.set = { ...ops.set, ...values }
      return builder
    },
    unset(fields: string[]) {
      ops.unset = [...(ops.unset ?? []), ...fields]
      return builder
    },
    async commit() {
      const row = rows.find((r) => r._id === id)
      if (!row) throw new Error(`no such document: ${id}`)
      if (expectedRev !== undefined && expectedRev !== row._rev) {
        throw new Error('409 revision mismatch')
      }
      Object.assign(row, ops.set ?? {})
      for (const field of ops.unset ?? []) delete row[field]
      row._rev = `${row._rev}+`
      return row
    },
  }
  return builder
}

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (...args: unknown[]) => mockFetch(...(args as [])),
    patch: (id: string) => patch(id),
  },
  clientReadUncached: { fetch: async () => null },
}))

vi.mock('@/lib/email/config', () => ({
  // Keyed by the org the caller asks for, so a cross-tenant send is visible.
  resolveEmailSender: async (orgId: string | null | undefined) => ({
    client: {
      emails: {
        send: async (payload: any) => {
          sendBehaviour(payload.to?.[0] ?? '')
          sends.push({ orgId, payload })
          return { data: { id: `email-${sends.length}` }, error: null }
        },
      },
    },
  }),
  retryWithBackoff: async (fn: () => Promise<unknown>) => fn(),
}))

vi.mock('@/lib/cospeaker/sanity', () => ({
  getProposalAbstract: async () => 'An abstract.',
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => {
    throw new Error(
      'the cron must never resolve a conference from a request Host',
    )
  },
}))

vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))

const CONF_A = {
  _id: 'conf-a',
  title: 'Cloud Native Days Norway 2026',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2126-10-26',
  endDate: '2126-10-27',
  domains: ['cndn.example.com'],
  organizer: 'Cloud Native Norway',
  cfpEmail: 'cfp@cndn.example.com',
  socialLinks: [],
  organization: { _ref: 'org-a' },
}

const CONF_B = {
  _id: 'conf-b',
  title: 'Other Conf 2026',
  city: 'Oslo',
  country: 'Norway',
  startDate: '2126-11-10',
  endDate: '2126-11-11',
  domains: ['other.example.com'],
  organizer: 'Other Org',
  cfpEmail: 'cfp@other.example.com',
  socialLinks: [],
  organization: { _ref: 'org-b' },
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

function invitation(overrides: Partial<Row> & { _id: string }): Row {
  return {
    _rev: 'rev-1',
    invitedEmail: `${overrides._id}@example.com`,
    invitedName: 'Sofia Invitee',
    status: 'pending',
    token: `token-${overrides._id}`,
    expiresAt: daysFromNow(2),
    createdAt: daysFromNow(-12),
    invitedBy: { _id: 'spk-1', name: 'Primary Speaker', email: 'primary@x.no' },
    proposal: {
      _id: `talk-${overrides._id}`,
      title: 'A Talk',
      status: 'submitted',
    },
    sweepConference: CONF_A,
    ...overrides,
  }
}

async function run() {
  const { GET } = await import('@/app/api/cron/cospeaker-invitations/route')
  const response = await GET(
    new NextRequest('http://localhost:3000/api/cron/cospeaker-invitations', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }),
  )
  return { response, data: await response.json() }
}

describe('api/cron/cospeaker-invitations', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterAll(() => vi.restoreAllMocks())

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'
    rows = []
    sends.length = 0
    sendBehaviour = () => {}
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  describe('authorization', () => {
    it('refuses without a bearer token', async () => {
      const { GET } = await import('@/app/api/cron/cospeaker-invitations/route')
      const response = await GET(
        new NextRequest('http://localhost:3000/api/cron/cospeaker-invitations'),
      )
      expect(response.status).toBe(401)
      expect(sends).toHaveLength(0)
    })

    it('refuses with the wrong token', async () => {
      const { GET } = await import('@/app/api/cron/cospeaker-invitations/route')
      const response = await GET(
        new NextRequest(
          'http://localhost:3000/api/cron/cospeaker-invitations',
          { headers: { authorization: 'Bearer nope' } },
        ),
      )
      expect(response.status).toBe(401)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('refuses when CRON_SECRET is unset', async () => {
      delete process.env.CRON_SECRET
      const { response } = await run()
      expect(response.status).toBe(500)
    })
  })

  it('nudges an open invitation that has never been reminded, once', async () => {
    rows = [invitation({ _id: 'inv-open' })]

    const first = await run()
    expect(first.data.nudged).toBe(1)
    expect(sends).toHaveLength(1)
    expect(sends[0].payload.to).toEqual(['inv-open@example.com'])
    expect(sends[0].payload.subject).toContain('Reminder')
    expect(rows[0].lastRemindedAt).toBeTruthy()

    // A second run the same day must not mail again.
    // Nothing to do, not "tried and refused": the run must be clean.
    const second = await run()
    expect(second.data.nudged).toBe(0)
    expect(second.data.failed).toBe(0)
    expect(sends).toHaveLength(1)
  })

  it('alerts organizers about a lapsed invitation on a CONFIRMED proposal, once', async () => {
    rows = [
      invitation({
        _id: 'inv-lapsed',
        expiresAt: daysFromNow(-4),
        proposal: {
          _id: 'talk-confirmed',
          title: 'Running Kubernetes on a Boat',
          status: 'confirmed',
        },
      }),
    ]

    const first = await run()
    expect(first.data.alerted).toBe(1)
    expect(sends).toHaveLength(1)
    expect(sends[0].payload.to).toEqual(['cfp@cndn.example.com'])
    expect(sends[0].payload.subject).toContain('expired on a confirmed talk')
    // The element Resend is handed must actually RENDER: a template that throws
    // here would be swallowed as a failed send and the organizers would hear
    // nothing at all.
    const html = renderToStaticMarkup(sends[0].payload.react)
    expect(html).toContain('Running Kubernetes on a Boat')
    expect(html).toContain('not included in speaker tickets or badges')
    expect(rows[0].organizerAlertedAt).toBeTruthy()

    const second = await run()
    expect(second.data.alerted).toBe(0)
    expect(sends).toHaveLength(1)
  })

  it('does not alert organizers when the proposal is not confirmed', async () => {
    rows = [
      invitation({
        _id: 'inv-lapsed-submitted',
        expiresAt: daysFromNow(-4),
        proposal: {
          _id: 'talk-sub',
          title: 'Still Submitted',
          status: 'submitted',
        },
      }),
    ]

    const { data } = await run()
    expect(data.alerted).toBe(0)
    expect(data.nudged).toBe(0)
    expect(sends).toHaveLength(0)
    expect(rows[0].organizerAlertedAt).toBeUndefined()
  })

  it('sends each invitation through its OWN tenant sender and from address', async () => {
    rows = [
      invitation({ _id: 'inv-a', sweepConference: CONF_A }),
      invitation({ _id: 'inv-b', sweepConference: CONF_B }),
    ]

    const { data } = await run()
    expect(data.nudged).toBe(2)

    const byRecipient = new Map(
      sends.map((s) => [s.payload.to[0] as string, s]),
    )
    const a = byRecipient.get('inv-a@example.com')!
    const b = byRecipient.get('inv-b@example.com')!

    expect(a.orgId).toBe('org-a')
    expect(a.payload.from).toBe('Cloud Native Norway <cfp@cndn.example.com>')
    expect(b.orgId).toBe('org-b')
    expect(b.payload.from).toBe('Other Org <cfp@other.example.com>')
  })

  it('keeps going when one send fails, and leaves that invitation eligible', async () => {
    rows = [
      invitation({ _id: 'inv-bad' }),
      invitation({ _id: 'inv-good', _rev: 'rev-2' }),
    ]
    sendBehaviour = (to) => {
      if (to === 'inv-bad@example.com') throw new Error('Resend is down')
    }

    const { response, data } = await run()
    expect(response.status).toBe(200)
    expect(data.nudged).toBe(1)
    expect(data.failed).toBe(1)
    expect(sends.map((s) => s.payload.to[0])).toEqual(['inv-good@example.com'])
    // The failed one released its claim, so tomorrow's run retries it.
    expect(
      rows.find((r) => r._id === 'inv-bad')!.lastRemindedAt,
    ).toBeUndefined()
    expect(rows.find((r) => r._id === 'inv-good')!.lastRemindedAt).toBeTruthy()
  })

  it('caps the number of messages per run and leaves the rest for tomorrow', async () => {
    rows = Array.from({ length: 60 }, (_, i) => invitation({ _id: `inv-${i}` }))

    const { data } = await run()
    expect(data.emails).toBe(50)
    expect(data.nudged).toBe(50)
    expect(data.capped).toBe(true)
    expect(sends).toHaveLength(50)
    // The skipped ones were never claimed.
    expect(rows.filter((r) => !r.lastRemindedAt)).toHaveLength(10)
  })

  it('does not nudge an invitation an organizer already reminded today', async () => {
    rows = [
      invitation({
        _id: 'inv-reminded',
        lastRemindedAt: new Date().toISOString(),
      }),
    ]

    const { data } = await run()
    expect(data.nudged).toBe(0)
    expect(sends).toHaveLength(0)
  })

  it('asks Sanity only for chaseable proposals on events that have not happened', async () => {
    await run()
    const [query, params] = mockFetch.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ]
    expect(query).toContain('proposal->status in $chaseable')
    expect(query).toContain('conference->endDate >= $today')
    expect(params.chaseable).not.toContain('rejected')
    expect(params.chaseable).not.toContain('withdrawn')
    expect(params.chaseable).not.toContain('deleted')
  })
})
