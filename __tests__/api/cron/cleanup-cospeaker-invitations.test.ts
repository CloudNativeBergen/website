/**
 * @vitest-environment node
 *
 * Drives the REAL retention handler against an in-memory Sanity whose writes
 * PERSIST: the fetch is evaluated by the REAL GROQ engine (`groq-js`) over the
 * current dataset, and `delete` removes the document from it. So a second run
 * genuinely sees what the first run left behind, and narrowing or widening the
 * purge query in `src/lib/cospeaker/sanity.ts` changes what these tests see.
 * Asserting against a fixture the test itself froze would prove nothing about a
 * job whose entire job is to destroy rows.
 */
import { NextRequest } from 'next/server'
import { evaluate, parse } from 'groq-js'

/* eslint-disable @typescript-eslint/no-explicit-any */

const DAY = 24 * 60 * 60 * 1000

let dataset: any[] = []
let deleteBehaviour: (id: string) => void = () => {}

const mockFetch = vi.fn(async (query: string, params?: any) => {
  const tree = parse(query)
  const value = await evaluate(tree, { dataset, params })
  return value.get()
})

const mockDelete = vi.fn(async (id: string) => {
  deleteBehaviour(id)
  const index = dataset.findIndex((doc) => doc._id === id)
  if (index === -1) throw new Error(`no such document: ${id}`)
  dataset.splice(index, 1)
  return { results: [{ id }] }
})

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (query: string, params: any) => mockFetch(query, params),
    delete: (id: string) => mockDelete(id),
  },
  clientReadUncached: { fetch: async () => null },
}))

vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

/**
 * A `coSpeakerInvitation` carrying only the fields the sweep can see. The
 * personal data is present precisely because the point of the job is that it
 * stops existing.
 */
function invitation(overrides: Record<string, any>) {
  return {
    _type: 'coSpeakerInvitation',
    _id: `inv-${dataset.length + 1}`,
    invitedEmail: 'stranger@example.com',
    invitedName: 'A Stranger',
    token: 'tok',
    status: 'pending',
    expiresAt: iso(-200 * DAY),
    conference: { _ref: 'conf-a' },
    proposal: { _ref: 'talk-a' },
    ...overrides,
  }
}

function cronRequest(query = ''): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/cron/cleanup-cospeaker-invitations${query}`,
    { headers: { authorization: 'Bearer test-cron-secret' } },
  )
}

async function run(query = '') {
  const { GET } =
    await import('@/app/api/cron/cleanup-cospeaker-invitations/route')
  const response = await GET(cronRequest(query))
  return { response, body: await response.json() }
}

function ids(): string[] {
  return dataset.map((doc) => doc._id).sort()
}

describe('api/cron/cleanup-cospeaker-invitations', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterAll(() => vi.restoreAllMocks())

  beforeEach(() => {
    vi.clearAllMocks()
    dataset = []
    deleteBehaviour = () => {}
    process.env.CRON_SECRET = 'test-cron-secret'
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  describe('authentication', () => {
    it('refuses without the cron secret and deletes nothing', async () => {
      dataset = [invitation({ _id: 'inv-declined', status: 'declined' })]
      const { GET } =
        await import('@/app/api/cron/cleanup-cospeaker-invitations/route')
      const response = await GET(
        new NextRequest(
          'http://localhost:3000/api/cron/cleanup-cospeaker-invitations',
        ),
      )
      expect(response.status).toBe(401)
      expect(mockDelete).not.toHaveBeenCalled()
      expect(ids()).toEqual(['inv-declined'])
    })

    it('refuses a wrong bearer token', async () => {
      const { GET } =
        await import('@/app/api/cron/cleanup-cospeaker-invitations/route')
      const response = await GET(
        new NextRequest(
          'http://localhost:3000/api/cron/cleanup-cospeaker-invitations',
          { headers: { authorization: 'Bearer wrong' } },
        ),
      )
      expect(response.status).toBe(401)
    })
  })

  describe('what it deletes', () => {
    it('purges declined, canceled and lapsed-pending invitations past the window', async () => {
      dataset = [
        invitation({
          _id: 'inv-declined',
          status: 'declined',
          respondedAt: iso(-120 * DAY),
          declineReason: 'Not available that week.',
        }),
        invitation({ _id: 'inv-canceled', status: 'canceled' }),
        invitation({ _id: 'inv-lapsed', status: 'pending' }),
        invitation({ _id: 'inv-expired', status: 'expired' }),
      ]

      const { body } = await run()

      expect(body.deleted).toBe(4)
      expect(body.failed).toBe(0)
      expect(body.skipped).toBe(0)
      expect(ids()).toEqual([])
      expect(body.retentionDays).toBe(90)
    })

    it('keeps accepted invitations — the provenance of a speaker who is on the talk', async () => {
      dataset = [
        invitation({
          _id: 'inv-accepted',
          status: 'accepted',
          respondedAt: iso(-400 * DAY),
        }),
      ]

      const { body } = await run()

      expect(body.deleted).toBe(0)
      expect(ids()).toEqual(['inv-accepted'])
    })

    it('keeps a resolved invitation that is still INSIDE the retention window', async () => {
      dataset = [
        invitation({
          _id: 'inv-recent-decline',
          status: 'declined',
          expiresAt: iso(-80 * DAY),
          respondedAt: iso(-89 * DAY),
        }),
        invitation({
          _id: 'inv-recent-lapse',
          status: 'pending',
          expiresAt: iso(-1 * DAY),
        }),
      ]

      const { body } = await run()

      expect(body.deleted).toBe(0)
      expect(ids()).toEqual(['inv-recent-decline', 'inv-recent-lapse'])
    })

    it('never touches a draft document', async () => {
      dataset = [invitation({ _id: 'drafts.inv-declined', status: 'declined' })]

      const { body } = await run()

      expect(body.scanned).toBe(0)
      expect(ids()).toEqual(['drafts.inv-declined'])
    })

    it('never touches documents of another type', async () => {
      dataset = [
        {
          _type: 'organizerInvitation',
          _id: 'org-inv',
          status: 'declined',
          expiresAt: iso(-400 * DAY),
        },
      ]

      const { body } = await run()

      expect(body.scanned).toBe(0)
      expect(ids()).toEqual(['org-inv'])
    })
  })

  /**
   * THE GUARD WHOSE FAILURE DESTROYS LIVE DATA. A pending invitation that is
   * still OPEN — someone is waiting on an answer right now — must survive every
   * run. The row below is a data bug on purpose: a stale `respondedAt` drags it
   * into the query's candidate set, so the ONLY thing standing between it and
   * deletion is the `effectiveInvitationStatus` guard in the handler. Sabotage
   * that guard (drop the `PURGEABLE_STATUSES` check, or swap
   * `effectiveInvitationStatus` for the raw `status` string) and this test goes
   * red on a VALUE — a document that is gone from the dataset — not on an
   * absence.
   */
  describe('a still-open pending invitation is never deleted', () => {
    it('survives even when its timestamps put it in the candidate set', async () => {
      dataset = [
        invitation({
          _id: 'inv-open',
          status: 'pending',
          expiresAt: iso(+7 * DAY),
          respondedAt: iso(-400 * DAY),
        }),
      ]

      const { body } = await run()

      // It WAS selected by the query — so the query is not what saved it.
      expect(body.scanned).toBe(1)
      expect(body.skipped).toBe(1)
      expect(body.deleted).toBe(0)
      expect(mockDelete).not.toHaveBeenCalled()
      expect(ids()).toEqual(['inv-open'])
    })

    it('still survives a second run', async () => {
      dataset = [
        invitation({
          _id: 'inv-open',
          status: 'pending',
          expiresAt: iso(+7 * DAY),
          respondedAt: iso(-400 * DAY),
        }),
        invitation({ _id: 'inv-declined', status: 'declined' }),
      ]

      const first = await run()
      expect(first.body.deleted).toBe(1)
      expect(ids()).toEqual(['inv-open'])

      // The second run sees what the first one left: the open invitation, and
      // nothing else to do.
      const second = await run()
      expect(second.body.scanned).toBe(1)
      expect(second.body.deleted).toBe(0)
      expect(ids()).toEqual(['inv-open'])
    })
  })

  describe('dry run', () => {
    it('reports what it would delete and writes nothing', async () => {
      dataset = [
        invitation({ _id: 'inv-a', status: 'declined' }),
        invitation({ _id: 'inv-b', status: 'canceled' }),
      ]

      const { body } = await run('?dryRun=1')

      expect(body.dryRun).toBe(true)
      expect(body.deleted).toBe(0)
      expect(body.ids.sort()).toEqual(['inv-a', 'inv-b'])
      expect(mockDelete).not.toHaveBeenCalled()
      expect(ids()).toEqual(['inv-a', 'inv-b'])
    })

    it('a real run after a dry run deletes exactly what the dry run listed', async () => {
      dataset = [
        invitation({ _id: 'inv-a', status: 'declined' }),
        invitation({ _id: 'inv-b', status: 'canceled' }),
      ]

      const dry = await run('?dryRun=1')
      const real = await run()

      expect(real.body.ids.sort()).toEqual(dry.body.ids.sort())
      expect(real.body.deleted).toBe(2)
      expect(ids()).toEqual([])
    })
  })

  describe('bounds and fail-soft', () => {
    it('deletes at most 200 per run and reports capped, leaving the rest for the next run', async () => {
      dataset = Array.from({ length: 205 }, (_, i) =>
        invitation({ _id: `inv-${i}`, status: 'declined' }),
      )

      const first = await run()
      expect(first.body.deleted).toBe(200)
      expect(first.body.capped).toBe(true)
      expect(dataset).toHaveLength(5)

      const second = await run()
      expect(second.body.deleted).toBe(5)
      expect(second.body.capped).toBe(false)
      expect(dataset).toHaveLength(0)
    })

    it('one failing delete does not stop the others', async () => {
      dataset = [
        invitation({ _id: 'inv-a', status: 'declined' }),
        invitation({ _id: 'inv-bad', status: 'declined' }),
        invitation({ _id: 'inv-c', status: 'declined' }),
      ]
      deleteBehaviour = (id) => {
        if (id === 'inv-bad') throw new Error('sanity is unhappy')
      }

      const { response, body } = await run()

      expect(response.status).toBe(200)
      expect(body.deleted).toBe(2)
      expect(body.failed).toBe(1)
      expect(ids()).toEqual(['inv-bad'])
    })

    it('a failing read zeroes the run instead of throwing', async () => {
      dataset = [invitation({ _id: 'inv-a', status: 'declined' })]
      mockFetch.mockRejectedValueOnce(new Error('sanity is down'))

      const { response, body } = await run()

      expect(response.status).toBe(200)
      expect(body.scanned).toBe(0)
      expect(body.deleted).toBe(0)
      expect(ids()).toEqual(['inv-a'])
    })
  })

  describe('the audit log', () => {
    it('logs ids and never the personal data being purged', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      dataset = [
        invitation({
          _id: 'inv-declined',
          status: 'declined',
          invitedEmail: 'stranger@example.com',
          invitedName: 'A Stranger',
          declineReason: 'A private reason.',
        }),
      ]

      await run()

      const logged = log.mock.calls.flat().join('\n')
      expect(logged).toContain('inv-declined')
      expect(logged).not.toContain('stranger@example.com')
      expect(logged).not.toContain('A Stranger')
      expect(logged).not.toContain('A private reason.')
    })
  })
})
