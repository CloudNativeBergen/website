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

/**
 * Delete-by-query, like the real client: the predicate is re-evaluated by
 * `groq-js` against the dataset AS IT IS NOW, not as the sweep read it. That is
 * what makes the mid-run-change tests meaningful — `deleteBehaviour` can mutate
 * a row first, and the delete then legitimately matches nothing.
 */
const mockDelete = vi.fn(async ({ query, params }: any) => {
  deleteBehaviour(params.id)
  const matched = (await (
    await evaluate(parse(query), { dataset, params })
  ).get()) as any[]
  const ids = new Set(matched.map((doc) => doc._id))
  dataset = dataset.filter((doc) => !ids.has(doc._id))
  return { results: [...ids].map((id) => ({ id })) }
})

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (query: string, params: any) => mockFetch(query, params),
    delete: (selection: any) => mockDelete(selection),
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
   * run, and the query must not be the only thing that saves it.
   *
   * So these two tests hand the handler an open invitation as a CANDIDATE, by
   * answering the candidate fetch directly. That is the failure being defended
   * against: the query is a superset filter and someone widens it — loosens the
   * cutoff, drops the `status` test, times a `pending` row off a stale
   * `respondedAt` (a bug this job actually had). In every one of those futures
   * an open invitation reaches the loop, and `effectiveInvitationStatus` is the
   * last thing standing between it and deletion.
   *
   * The assertions fail on a VALUE — a delete that happened, a document gone
   * from the dataset — not on an absence.
   */
  describe('a still-open pending invitation is never deleted', () => {
    /** An open invitation: pending, seven days left to answer. */
    const openRow = {
      _id: 'inv-open',
      status: 'pending',
      expiresAt: iso(+7 * DAY),
      respondedAt: iso(-400 * DAY),
    }

    it('survives being handed to the handler as a candidate', async () => {
      dataset = [invitation(openRow)]
      mockFetch.mockResolvedValueOnce([openRow])

      const { body } = await run()

      // It WAS a candidate — so the query is not what saved it.
      expect(body.scanned).toBe(1)
      expect(body.skipped).toBe(1)
      expect(body.deleted).toBe(0)
      expect(mockDelete).not.toHaveBeenCalled()
      expect(ids()).toEqual(['inv-open'])
    })

    it('still survives a second run, alongside a row that is genuinely purged', async () => {
      dataset = [
        invitation(openRow),
        invitation({ _id: 'inv-declined', status: 'declined' }),
      ]

      const first = await run()
      expect(first.body.deleted).toBe(1)
      expect(ids()).toEqual(['inv-open'])

      // The second run sees what the first one left. Hand it the open row as a
      // candidate again: it is still refused, and still there afterwards.
      mockFetch.mockResolvedValueOnce([openRow])
      const second = await run()
      expect(second.body.scanned).toBe(1)
      expect(second.body.skipped).toBe(1)
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

    /**
     * A sweep that cannot READ is broken, not empty. If it answered 200 with
     * `success: true, deleted: 0`, HTTP cron monitoring could not tell a Sanity
     * outage from a clean run, and the job could stay dead for months while the
     * personal data it exists to delete piled up.
     */
    it('a failing read answers 500 rather than reporting an empty sweep', async () => {
      dataset = [invitation({ _id: 'inv-a', status: 'declined' })]
      mockFetch.mockRejectedValueOnce(new Error('sanity is down'))

      const { response, body } = await run()

      expect(response.status).toBe(500)
      expect(body.success).toBeUndefined()
      expect(body.error).toBe('Internal server error')
      expect(ids()).toEqual(['inv-a'])
    })
  })

  /**
   * An invitation that was ever ACCEPTED keeps its provenance. `status` alone
   * cannot express that: removing an accepted co-speaker from a proposal
   * (`reconcileRemovedCoSpeakers`) flips the row to `canceled` while leaving
   * `acceptedSpeaker` and `respondedAt` behind, so a status-only rule would
   * delete the record of an acceptance that really happened — and that record
   * matters most precisely after someone has been removed.
   */
  describe('an invitation that was ever accepted is never deleted', () => {
    it('keeps a canceled row that still carries acceptedSpeaker', async () => {
      dataset = [
        invitation({
          _id: 'inv-was-accepted',
          status: 'canceled',
          respondedAt: iso(-400 * DAY),
          acceptedSpeaker: { _ref: 'speaker-1' },
        }),
      ]

      const { body } = await run()

      expect(body.scanned).toBe(0)
      expect(body.deleted).toBe(0)
      expect(ids()).toEqual(['inv-was-accepted'])
    })

    it('still deletes an ordinary canceled row that was never accepted', async () => {
      dataset = [
        invitation({
          _id: 'inv-was-accepted',
          status: 'canceled',
          respondedAt: iso(-400 * DAY),
          acceptedSpeaker: { _ref: 's1' },
        }),
        invitation({ _id: 'inv-plain-cancel', status: 'canceled' }),
      ]

      const { body } = await run()

      expect(body.deleted).toBe(1)
      expect(ids()).toEqual(['inv-was-accepted'])
    })
  })

  /**
   * A row still reading `pending` is timed by its `expiresAt`, never by a stale
   * `respondedAt`. That is reachable, not hypothetical: `invitation.resend`
   * renews a DECLINED invitation in place — `status` back to `pending`, fresh
   * `expiresAt` — and never clears `respondedAt`. Timing off the old decline
   * would purge the renewed invitation the day after its new window lapsed
   * instead of ninety days later, silently under-retaining it.
   */
  describe('a renewed invitation is timed by its new window', () => {
    it('keeps a resent invitation that lapsed yesterday but was declined long ago', async () => {
      dataset = [
        invitation({
          _id: 'inv-resent',
          status: 'pending',
          expiresAt: iso(-1 * DAY),
          respondedAt: iso(-400 * DAY),
        }),
      ]

      const { body } = await run()

      expect(body.scanned).toBe(0)
      expect(body.deleted).toBe(0)
      expect(ids()).toEqual(['inv-resent'])
    })

    it('purges it once the NEW window is itself 90 days old', async () => {
      dataset = [
        invitation({
          _id: 'inv-resent',
          status: 'pending',
          expiresAt: iso(-91 * DAY),
          respondedAt: iso(-400 * DAY),
        }),
      ]

      const { body } = await run()

      expect(body.deleted).toBe(1)
      expect(ids()).toEqual([])
    })
  })

  /**
   * The delete is a delete-by-QUERY, so Sanity re-evaluates the predicate at
   * mutation time. `invitation.resend` renews a lapsed invitation in place and
   * `invitation.respond` can accept one; either landing between the sweep's read
   * and its delete would otherwise destroy a live invitation or a fresh
   * acceptance. Here `deleteBehaviour` performs exactly that write first.
   */
  describe('a document that changes mid-run is not deleted', () => {
    it('does not delete an invitation renewed between the read and the delete', async () => {
      dataset = [
        invitation({ _id: 'inv-renewed', status: 'pending' }),
        invitation({ _id: 'inv-declined', status: 'declined' }),
      ]
      deleteBehaviour = (id) => {
        if (id !== 'inv-renewed') return
        // What `invitation.resend` writes: a fresh window, status back to pending.
        const row = dataset.find((doc) => doc._id === 'inv-renewed')
        if (row) {
          row.status = 'pending'
          row.expiresAt = iso(+14 * DAY)
        }
      }

      const { body } = await run()

      expect(body.deleted).toBe(1)
      expect(body.skipped).toBe(1)
      expect(body.ids).toEqual(['inv-declined'])
      expect(ids()).toEqual(['inv-renewed'])
    })

    it('does not delete an invitation accepted between the read and the delete', async () => {
      dataset = [invitation({ _id: 'inv-late-accept', status: 'pending' })]
      deleteBehaviour = () => {
        const row = dataset.find((doc) => doc._id === 'inv-late-accept')
        if (row) {
          row.status = 'accepted'
          row.respondedAt = iso(0)
          row.acceptedSpeaker = { _ref: 'speaker-9' }
        }
      }

      const { body } = await run()

      expect(body.deleted).toBe(0)
      expect(body.skipped).toBe(1)
      expect(ids()).toEqual(['inv-late-accept'])
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
