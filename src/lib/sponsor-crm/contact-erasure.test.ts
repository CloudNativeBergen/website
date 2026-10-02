/**
 * @vitest-environment node
 *
 * Transaction-boundary tests for the sponsor-contact erasure (#1265): what it
 * stages, that a dry run and a refusal write nothing, and that the residual
 * is counted from a re-read after the commit. Shape follows
 * `erasure.sanity.test.ts`: a chainable fake transaction, a fetch router that
 * honours `$emails` (a mock that ignored the parameter would hide a
 * verification that finds nothing).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
const commitMock = vi.fn()

interface RecordedPatch {
  id: string
  set?: Record<string, unknown>
  rev?: string
}
const patchOps: RecordedPatch[] = []

const transactionApi = {
  patch: (id: string, fn: (p: unknown) => unknown) => {
    const op: RecordedPatch = { id }
    const builder = {
      set: (o: Record<string, unknown>) => {
        op.set = o
        return builder
      },
      ifRevisionId: (rev: string) => {
        op.rev = rev
        return builder
      },
    }
    fn(builder)
    patchOps.push(op)
    return transactionApi
  },
  commit: (...args: unknown[]) => commitMock(...args),
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: (...args: unknown[]) => fetchMock(...args),
    // The recipient read is release-aware (`withConfig` at a newer version).
    withConfig: () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }),
  },
  clientWrite: {
    withConfig: () => ({ transaction: () => transactionApi }),
  },
}))

import { eraseSponsorContactSendRecords } from './contact-erasure'
import {
  REDACTED_RECIPIENT_EMAIL,
  REDACTED_RECIPIENT_NAME,
} from '@/lib/speaker/erasure-recipients'

type Doc = {
  _id: string
  _rev: string
  description?: string
  error?: string
  recipients: Array<{ _key: string; name: string; email: string }>
}

let world: Doc[]

function record(overrides: Partial<Doc> = {}): Doc {
  return {
    _id: 'activity-1',
    _rev: 'rev-1',
    description: 'Information sent to Kari Nordmann (+1)',
    recipients: [
      { _key: 'c-kari', name: 'Kari Nordmann', email: 'kari@sponsor.no' },
      { _key: 'c-ola', name: 'Ola Nordmann', email: 'ola@sponsor.no' },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  patchOps.length = 0
  world = []
  fetchMock.mockImplementation(
    (query: string, params: Record<string, unknown> = {}) => {
      if (!query.includes('_type == "sponsorActivity"')) {
        return Promise.resolve(null)
      }
      const emails = (params.emails as string[]) ?? []
      return Promise.resolve(
        world.filter((doc) =>
          doc.recipients.some((r) => emails.includes(r.email.toLowerCase())),
        ),
      )
    },
  )
  commitMock.mockResolvedValue({ transactionId: 'tx-1' })
})

describe('a sponsor contact with no speaker document is erased from send records', () => {
  it('stages one revision-guarded redaction per record and commits once', async () => {
    world = [record(), record({ _id: 'activity-2', _rev: 'rev-2' })]
    // The commit applies the patch to the world, as production does, so the
    // re-read that counts the residual sees the redacted state.
    commitMock.mockImplementation(async () => {
      for (const doc of world) {
        doc.recipients[0] = {
          ...doc.recipients[0],
          name: REDACTED_RECIPIENT_NAME,
          email: REDACTED_RECIPIENT_EMAIL,
        }
      }
      return { transactionId: 'tx-1' }
    })

    const result = await eraseSponsorContactSendRecords({
      emails: ['  Kari@Sponsor.NO '],
      actor: 'op',
    })

    expect(result.err).toBeNull()
    expect(result.emails).toEqual(['kari@sponsor.no'])
    expect(result.matched).toBe(2)
    expect(result.committed).toBe(true)
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(patchOps.map((p) => [p.id, p.rev])).toEqual([
      ['activity-1', 'rev-1'],
      ['activity-2', 'rev-2'],
    ])
    expect(patchOps[0].set).toEqual({
      'recipients[_key=="c-kari"].name': REDACTED_RECIPIENT_NAME,
      'recipients[_key=="c-kari"].email': REDACTED_RECIPIENT_EMAIL,
      description: `Information sent to ${REDACTED_RECIPIENT_NAME} (+1)`,
    })
    expect(result.residual).toBe(0)
  })

  it('counts a record the commit did not actually change as residual', async () => {
    world = [record()]
    // A commit that "succeeds" but leaves the world untouched: the re-read
    // still plans a patch, and that IS the residual. Fails on the value 1.
    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'op',
    })
    expect(result.committed).toBe(true)
    expect(result.residual).toBe(1)
  })

  it('a dry run plans and writes nothing', async () => {
    world = [record()]
    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'op',
      dryRun: true,
    })
    expect(result.err).toBeNull()
    expect(result.patches).toHaveLength(1)
    expect(result.committed).toBe(false)
    expect(result.residual).toBeNull()
    expect(commitMock).not.toHaveBeenCalled()
    expect(patchOps).toEqual([])
  })

  it('a refusal writes nothing and is reported as the error', async () => {
    world = [
      record({
        recipients: [
          { _key: 'bad key"', name: 'Kari', email: 'kari@sponsor.no' },
        ],
      }),
    ]
    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'op',
    })
    expect(result.err?.message).toContain('cannot be safely selected')
    expect(result.refusals).toHaveLength(1)
    expect(result.committed).toBe(false)
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('nothing matching is not a failure: no patch, no commit, clean', async () => {
    world = [record()]
    const result = await eraseSponsorContactSendRecords({
      emails: ['nobody@elsewhere.example'],
      actor: 'op',
    })
    expect(result.err).toBeNull()
    expect(result.matched).toBe(0)
    expect(result.committed).toBe(true)
    expect(result.residual).toBe(0)
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('refuses an empty address list rather than matching everything', async () => {
    const result = await eraseSponsorContactSendRecords({
      emails: ['  '],
      actor: 'op',
    })
    expect(result.err?.message).toBe('No email address given')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a failed commit is returned, not thrown, and nothing is claimed committed', async () => {
    world = [record()]
    commitMock.mockRejectedValue(new Error('409 revision mismatch'))
    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'op',
    })
    expect(result.err?.message).toBe('409 revision mismatch')
    expect(result.committed).toBe(false)
  })
})
