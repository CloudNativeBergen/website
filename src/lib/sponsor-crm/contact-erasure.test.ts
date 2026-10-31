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
  unset?: string[]
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
      unset: (keys: string[]) => {
        op.unset = keys
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

const audience = vi.hoisted(() => ({
  conferences: [] as Array<{ _id: string; title: string }>,
  resolve: vi.fn(async (c: { _id: string }) => ({
    audienceId: `aud-${c._id}`,
    client: {},
  })),
  remove: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/email/audience', () => ({
  getOrCreateConferenceAudienceByType: audience.resolve,
  removeContactFromAudience: audience.remove,
}))

const signing = vi.hoisted(() => ({
  cancel: vi.fn<(id: string) => Promise<void>>(async () => {}),
  log: vi.fn<(...args: unknown[]) => Promise<object>>(async () => ({})),
}))
vi.mock('@/lib/contract-signing', () => ({
  getSigningProvider: () => ({ cancelAgreement: signing.cancel }),
}))
vi.mock('@/lib/sponsor-crm/activity', () => ({
  logSignatureStatusChange: signing.log,
}))

import {
  eraseSponsorContactSendRecords,
  sponsorContactMatchSet,
} from './contact-erasure'
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
let signers: Array<{
  _id: string
  _rev: string
  signerEmail: string
  signatureId?: string
  signatureStatus?: string
  orgId?: string
}>

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
  signers = []
  audience.conferences = []
  fetchMock.mockImplementation(
    (query: string, params: Record<string, unknown> = {}) => {
      if (query.startsWith('array::unique')) {
        return Promise.resolve(audience.conferences.map((c) => c._id))
      }
      if (query.startsWith('*[_type == "conference"')) {
        return Promise.resolve(audience.conferences)
      }
      if (query.includes('_type == "sponsorForConference" && lower(')) {
        const emails = (params.emails as string[]) ?? []
        return Promise.resolve(
          signers.filter((d) => emails.includes(d.signerEmail.toLowerCase())),
        )
      }
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

  it('refuses a value that is not an address, such as a flag swallowed by --email', async () => {
    const result = await eraseSponsorContactSendRecords({
      emails: ['--actor'],
      actor: 'op',
    })
    expect(result.err?.message).toBe('Not an email address: "--actor"')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.committed).toBe(false)
  })

  it('matches the plain lowercased form only — never an NFKC-folded neighbour', async () => {
    // A fullwidth "Ａ" folds to "a" under NFKC, but `ａda@` and `ada@` can be
    // two mailboxes. The operator typed one of them; only that one goes.
    expect(sponsorContactMatchSet(['  ＡDA@Example.com '])).toEqual([
      'ａda@example.com',
    ])
    world = [
      record({
        _id: 'fullwidth',
        recipients: [{ _key: 'c-fw', name: 'Ａda', email: 'ａda@example.com' }],
      }),
      record({
        _id: 'plain',
        recipients: [{ _key: 'c-pl', name: 'Ada', email: 'ada@example.com' }],
      }),
    ]
    const result = await eraseSponsorContactSendRecords({
      emails: ['ＡDA@Example.com'],
      actor: 'op',
      dryRun: true,
    })
    expect(result.err).toBeNull()
    expect(result.patches.map((p) => p.id)).toEqual(['fullwidth'])
  })

  it('a verification read that fails after the commit does not hide the commit', async () => {
    world = [record()]
    let reads = 0
    fetchMock.mockImplementation(() => {
      reads += 1
      if (reads === 1) return Promise.resolve(world)
      if (reads === 2) return Promise.resolve([]) // the signer read (#1282)
      return Promise.reject(new Error('read timed out'))
    })
    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'op',
    })
    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(result.committed).toBe(true)
    expect(result.patches).toHaveLength(1)
    expect(result.residual).toBeNull()
    expect(result.err?.message).toBe(
      'Committed, but the verification read failed: read timed out. Re-run to verify.',
    )
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

describe('the address leaves the sponsor audiences on Resend too (#1704)', () => {
  it('removes every address from each conference sponsor audience', async () => {
    audience.conferences = [
      { _id: 'conf-a', title: 'A' },
      { _id: 'conf-b', title: 'B' },
    ]
    const result = await eraseSponsorContactSendRecords({
      emails: ['Kari@Sponsor.no'],
      actor: 'op',
    })
    expect(result.err).toBeNull()
    expect(result.audienceFailures).toEqual([])
    expect(audience.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conf-a' }),
      'sponsors',
    )
    expect(audience.remove.mock.calls).toEqual([
      [{}, 'aud-conf-a', 'kari@sponsor.no'],
      [{}, 'aud-conf-b', 'kari@sponsor.no'],
    ])
  })

  it('a failed removal is reported and logged, and does not fail the erasure', async () => {
    audience.conferences = [{ _id: 'conf-a', title: 'A' }]
    audience.remove.mockResolvedValueOnce({
      success: false,
      error: new Error('resend down'),
    } as never)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'op',
    })
    expect(result.err).toBeNull()
    expect(result.audienceFailures).toEqual(['conf-a: resend down'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('a dry run leaves the audiences alone', async () => {
    audience.conferences = [{ _id: 'conf-a', title: 'A' }]
    await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'op',
      dryRun: true,
    })
    expect(audience.remove).not.toHaveBeenCalled()
  })
})

describe('the stored agreement signer (#1282)', () => {
  it('clears signerEmail and signerName on a sponsor whose signer is erased', async () => {
    signers = [
      { _id: 'sfc-1', _rev: 'sfc-rev', signerEmail: 'Kari@Sponsor.no' },
      { _id: 'sfc-2', _rev: 'sfc-rev-2', signerEmail: 'ola@sponsor.no' },
    ]
    commitMock.mockImplementation(async () => {
      signers = signers.filter((d) => d._id !== 'sfc-1')
    })

    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'ops',
    })

    expect(result.err).toBeNull()
    expect(patchOps).toEqual([
      { id: 'sfc-1', rev: 'sfc-rev', unset: ['signerEmail', 'signerName'] },
    ])
    expect(result.residual).toBe(0)
  })

  it('revokes a pending agreement to the erased signer, never a signed one', async () => {
    signers = [
      {
        _id: 'sfc-1',
        _rev: 'r1',
        signerEmail: 'kari@sponsor.no',
        signatureId: 'tok-1',
        signatureStatus: 'pending',
      },
      {
        _id: 'sfc-2',
        _rev: 'r2',
        signerEmail: 'kari@sponsor.no',
        signatureId: 'tok-2',
        signatureStatus: 'signed',
      },
    ]
    signing.cancel.mockImplementation(async () => {
      signers[0] = { ...signers[0], _rev: 'r1b', signatureStatus: 'rejected' }
    })
    commitMock.mockImplementation(async () => {
      signers = []
    })

    const preview = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'organizer:sp-9',
      dryRun: true,
    })
    expect(preview.revocations.map((r) => r.id)).toEqual(['sfc-1'])
    expect(signing.cancel).not.toHaveBeenCalled()

    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'organizer:sp-9',
    })
    expect(result.err).toBeNull()
    expect(signing.cancel).toHaveBeenCalledTimes(1)
    expect(signing.cancel).toHaveBeenCalledWith('tok-1')
    expect(signing.log).toHaveBeenCalledWith(
      'sfc-1',
      'pending',
      'rejected',
      'sp-9',
    )
    // The guarded redaction uses the revision after the revocation.
    expect(patchOps.find((p) => p.id === 'sfc-1')?.rev).toBe('r1b')
    expect(result.residual).toBe(0)
  })

  it('keeps to one organization from the Privacy page', async () => {
    signers = [
      {
        _id: 'sfc-other',
        _rev: 'r',
        signerEmail: 'kari@sponsor.no',
        signatureId: 'tok-x',
        signatureStatus: 'pending',
        orgId: 'org-B',
      },
    ]
    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'organizer:sp-9',
      organizationId: 'org-A',
    })
    expect(result.revocations).toEqual([])
    expect(signing.cancel).not.toHaveBeenCalled()
  })

  it('redacts nothing when the agreement is still pending after revoking (signed meanwhile)', async () => {
    signers = [
      {
        _id: 'sfc-1',
        _rev: 'r1',
        signerEmail: 'kari@sponsor.no',
        signatureId: 'tok-1',
        signatureStatus: 'pending',
      },
    ]
    signing.cancel.mockImplementationOnce(async () => {})
    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'ops',
    })
    expect(result.err?.message).toBe(
      'Agreement still pending after revocation; nothing redacted',
    )
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('redacts nothing when the revocation fails', async () => {
    signers = [
      {
        _id: 'sfc-1',
        _rev: 'r1',
        signerEmail: 'kari@sponsor.no',
        signatureId: 'tok-1',
        signatureStatus: 'pending',
      },
    ]
    signing.cancel.mockRejectedValueOnce(new Error('provider down'))
    const result = await eraseSponsorContactSendRecords({
      emails: ['kari@sponsor.no'],
      actor: 'ops',
    })
    expect(result.err?.message).toBe('provider down')
    expect(commitMock).not.toHaveBeenCalled()
  })
})
