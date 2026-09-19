/**
 * @vitest-environment node
 *
 * THE SIGNING ROUTER'S GUARDS (P1 of RunKonf/platform#58).
 *
 * `signing` is a PUBLIC router: `publicProcedure`, no session, no org waist.
 * The bearer token in the payload is the ENTIRE authorization decision — see
 * the "tenancy" block at the bottom of this file. So the guards below are not
 * defence in depth; they are the only defence, and every one of them is
 * asserted on its specific refusal (code + message), never on "something
 * threw".
 *
 * The effects fired after a successful signature (closed-won promotion, the
 * sponsor-status event, the activity log) are asserted to happen EXACTLY ONCE
 * on success and NOT AT ALL on any refusal — including the refusal that only
 * exists once the write races (see the `ifRevisionId` block).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

import type { Context } from '@/server/trpc'
import type { SigningContractData } from '@/lib/signing/sanity'

const h = vi.hoisted(() => ({
  getSigningContract: vi.fn(),
  uncachedFetch: vi.fn(),
  embedSignatureInPdf: vi.fn(),
  upload: vi.fn(),
  deleteAsset: vi.fn(),
  ifRevisionId: vi.fn(),
  commit: vi.fn(),
  patch: vi.fn(),
  promoteToClosedWonOnContract: vi.fn(),
  logSignatureStatusChange: vi.fn(),
  logContractStatusChange: vi.fn(),
  publishSponsorStatusChange: vi.fn(),
  notifySponsorContractSigned: vi.fn(),
}))

vi.mock('@/lib/signing/sanity', () => ({
  getSigningContract: h.getSigningContract,
}))
vi.mock('@/lib/pdf', () => ({ embedSignatureInPdf: h.embedSignatureInPdf }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    assets: { upload: h.upload },
    patch: h.patch,
    delete: h.deleteAsset,
  },
  clientRead: { fetch: vi.fn() },
  clientReadUncached: { fetch: h.uncachedFetch },
}))
vi.mock('@/lib/sponsor-crm/activity', () => ({
  promoteToClosedWonOnContract: h.promoteToClosedWonOnContract,
  logSignatureStatusChange: h.logSignatureStatusChange,
  logContractStatusChange: h.logContractStatusChange,
}))
vi.mock('@/lib/sponsor-crm/events', () => ({
  publishSponsorStatusChange: h.publishSponsorStatusChange,
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('@/lib/slack/notify', () => ({
  notifySponsorContractSigned: h.notifySponsorContractSigned,
}))
vi.mock('@/lib/time', () => ({
  getCurrentDateTime: () => '2026-01-02T03:04:05.000Z',
}))

import { signingRouter } from './signing'

const caller = signingRouter.createCaller({} as Context)

const TOKEN = '11111111-2222-4333-8444-555555555555'
const OTHER_TOKEN = '99999999-8888-4777-8666-555555555555'

function contract(
  overrides: Partial<SigningContractData> = {},
): SigningContractData {
  return {
    _id: 'sfc-1',
    _rev: 'rev-1',
    status: 'negotiating',
    signatureStatus: 'pending',
    signatureId: TOKEN,
    signerEmail: 'signer@acme.test',
    contractStatus: 'contract-sent',
    contractDocument: { asset: { url: 'https://cdn.test/contract.pdf' } },
    sponsor: { name: 'Acme' },
    tier: { title: 'Gold' },
    conference: {
      _id: 'conf-1',
      title: 'Test Conf',
      city: 'Bergen',
      organizer: 'Org',
      // No `sponsorEmail`: the confirmation-email branch is a best-effort
      // side quest through four dynamic imports and is not what these tests
      // are about. Left unset so it is skipped.
    },
    ...overrides,
  }
}

const submitInput = {
  token: TOKEN,
  signatureDataUrl: 'data:image/png;base64,AAAA',
  signerName: 'Jane Doe',
}

/** Every downstream effect a successful signature fires. */
function effectCallCounts() {
  return {
    promote: h.promoteToClosedWonOnContract.mock.calls.length,
    event: h.publishSponsorStatusChange.mock.calls.length,
    slack: h.notifySponsorContractSigned.mock.calls.length,
    signatureLog: h.logSignatureStatusChange.mock.calls.length,
    contractLog: h.logContractStatusChange.mock.calls.length,
    upload: h.upload.mock.calls.length,
    commit: h.commit.mock.calls.length,
  }
}

const NO_EFFECTS = {
  promote: 0,
  event: 0,
  slack: 0,
  signatureLog: 0,
  contractLog: 0,
  upload: 0,
  commit: 0,
}

/** Assert a TRPCError's exact code and message, not merely that it threw. */
async function expectRefusal(
  promise: Promise<unknown>,
  code: TRPCError['code'],
  message: string,
) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'expected a refusal, but the call resolved').toBeInstanceOf(
    TRPCError,
  )
  expect({
    code: (error as TRPCError).code,
    message: (error as TRPCError).message,
  }).toEqual({ code, message })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.commit.mockResolvedValue({})
  h.ifRevisionId.mockReturnValue({ set: () => ({ commit: h.commit }) })
  h.patch.mockReturnValue({
    ifRevisionId: h.ifRevisionId,
    // An UNCONDITIONED `.set()` path is deliberately available on the mock: if
    // the router ever drops `ifRevisionId`, the double-sign test below fails
    // on the effect counts rather than on a missing mock method.
    set: () => ({ commit: h.commit }),
  })
  h.embedSignatureInPdf.mockResolvedValue(Buffer.from('signed-pdf'))
  h.upload.mockResolvedValue({
    _id: 'file-1',
    url: 'https://cdn.test/signed.pdf',
  })
  h.deleteAsset.mockResolvedValue(undefined)
  h.promoteToClosedWonOnContract.mockResolvedValue({ promoted: true })
  h.logSignatureStatusChange.mockResolvedValue(undefined)
  h.logContractStatusChange.mockResolvedValue(undefined)
  h.publishSponsorStatusChange.mockResolvedValue(undefined)
  h.notifySponsorContractSigned.mockResolvedValue(undefined)
})

describe('signing.getContract — token is the whole authorization', () => {
  it('returns the pending contract the token matches', async () => {
    h.getSigningContract.mockResolvedValue(contract())

    const result = await caller.getContract({ token: TOKEN })

    expect(h.getSigningContract).toHaveBeenCalledWith(TOKEN)
    expect(result).toMatchObject({
      status: 'pending',
      sponsorName: 'Acme',
      conferenceName: 'Test Conf',
      signerEmail: 'signer@acme.test',
    })
  })

  it('refuses an unknown token with NOT_FOUND, leaking nothing else', async () => {
    h.getSigningContract.mockResolvedValue(null)

    await expectRefusal(
      caller.getContract({ token: OTHER_TOKEN }),
      'NOT_FOUND',
      'Contract not found or link has expired.',
    )
  })

  it('rejects a malformed token before it reaches Sanity', async () => {
    // The uuid shape is the only cheap syntactic filter in front of a public
    // bearer lookup; a non-uuid must not become a GROQ parameter at all.
    await expect(
      caller.getContract({ token: 'not-a-uuid' } as never),
    ).rejects.toThrow()
    await expect(caller.getContract({} as never)).rejects.toThrow()
    expect(h.getSigningContract).not.toHaveBeenCalled()
  })

  it('reports a signed contract as signed, without the pending payload', async () => {
    h.getSigningContract.mockResolvedValue(
      contract({ signatureStatus: 'signed' }),
    )

    const result = await caller.getContract({ token: TOKEN })

    expect(result).toEqual({
      status: 'signed',
      sponsorName: 'Acme',
      conferenceName: 'Test Conf',
      contractPdfUrl: 'https://cdn.test/contract.pdf',
    })
    // The commercial terms are NOT handed out again after signing.
    expect(result).not.toHaveProperty('contractValue')
    expect(result).not.toHaveProperty('signerEmail')
  })

  it.each(['rejected', 'expired'] as const)(
    'refuses a %s contract with its own message',
    async (signatureStatus) => {
      h.getSigningContract.mockResolvedValue(contract({ signatureStatus }))

      await expectRefusal(
        caller.getContract({ token: TOKEN }),
        'PRECONDITION_FAILED',
        `This contract has been ${signatureStatus}. Please contact the organizer.`,
      )
    },
  )
})

describe('signing.submitSignature — refusals fire no effects', () => {
  it('signs a pending contract and fires every effect exactly once', async () => {
    h.getSigningContract.mockResolvedValue(contract())

    const result = await caller.submitSignature(submitInput)

    expect(result).toMatchObject({
      success: true,
      signerName: 'Jane Doe',
      signedAt: '2026-01-02T03:04:05.000Z',
      contractPdfUrl: 'https://cdn.test/signed.pdf',
    })
    expect(effectCallCounts()).toEqual({
      promote: 1,
      event: 1,
      slack: 1,
      signatureLog: 1,
      contractLog: 1,
      upload: 1,
      commit: 1,
    })
    expect(h.promoteToClosedWonOnContract).toHaveBeenCalledWith(
      'sfc-1',
      { status: 'negotiating', tier: { title: 'Gold' } },
      'signer',
    )
  })

  it('refuses to re-sign an already-signed contract', async () => {
    h.getSigningContract.mockResolvedValue(
      contract({ signatureStatus: 'signed' }),
    )

    await expectRefusal(
      caller.submitSignature(submitInput),
      'PRECONDITION_FAILED',
      'This contract has already been signed.',
    )
    // No second PDF, no second promotion, no second Slack post.
    expect(effectCallCounts()).toEqual(NO_EFFECTS)
  })

  it.each(['rejected', 'expired'] as const)(
    'refuses to sign a %s contract and fires nothing',
    async (signatureStatus) => {
      h.getSigningContract.mockResolvedValue(contract({ signatureStatus }))

      await expectRefusal(
        caller.submitSignature(submitInput),
        'PRECONDITION_FAILED',
        `This contract has been ${signatureStatus}. Please contact the organizer.`,
      )
      expect(effectCallCounts()).toEqual(NO_EFFECTS)
    },
  )

  it('refuses an unknown token and fires nothing', async () => {
    h.getSigningContract.mockResolvedValue(null)

    await expectRefusal(
      caller.submitSignature({ ...submitInput, token: OTHER_TOKEN }),
      'NOT_FOUND',
      'Contract not found or link has expired.',
    )
    expect(effectCallCounts()).toEqual(NO_EFFECTS)
  })

  it('rejects a non-PNG signature payload before any lookup', async () => {
    await expect(
      caller.submitSignature({
        ...submitInput,
        signatureDataUrl: 'https://evil.test/sig.png',
      }),
    ).rejects.toThrow()
    expect(h.getSigningContract).not.toHaveBeenCalled()
    expect(effectCallCounts()).toEqual(NO_EFFECTS)
  })

  it('refuses when the contract has no PDF, before touching the record', async () => {
    h.getSigningContract.mockResolvedValue(contract({ contractDocument: {} }))

    await expectRefusal(
      caller.submitSignature(submitInput),
      'NOT_FOUND',
      'Contract PDF not found. Please contact the organizer.',
    )
    expect(effectCallCounts()).toEqual(NO_EFFECTS)
  })

  it('does not promote when the record write fails', async () => {
    h.getSigningContract.mockResolvedValue(contract())
    h.commit.mockRejectedValue(new Error('sanity down'))
    // The re-read the conflict path takes still shows pending: this is a real
    // write failure, not a lost race.
    h.getSigningContract.mockResolvedValue(contract())

    await expectRefusal(
      caller.submitSignature(submitInput),
      'INTERNAL_SERVER_ERROR',
      'Signature was captured but failed to update the record. Please contact the organizer.',
    )
    expect(h.promoteToClosedWonOnContract).not.toHaveBeenCalled()
    expect(h.publishSponsorStatusChange).not.toHaveBeenCalled()
  })
})

describe('signing.submitSignature — the double-sign race', () => {
  it('conditions the write on the revision it read', async () => {
    h.getSigningContract.mockResolvedValue(contract({ _rev: 'rev-7' }))

    await caller.submitSignature(submitInput)

    expect(h.patch).toHaveBeenCalledWith('sfc-1')
    expect(h.ifRevisionId).toHaveBeenCalledWith('rev-7')
  })

  it('refuses the second of two concurrent signatures instead of succeeding twice', async () => {
    // The shape of the real race: both callers read `pending` and pass
    // `ensurePendingContract`; the first commits, the second's conditional
    // patch is rejected by Sanity, and the re-read now shows `signed`.
    let reads = 0
    h.getSigningContract.mockImplementation(async () => {
      reads += 1
      // Reads 1 and 2 are the two concurrent submissions' own lookups; the
      // third is the loser's post-conflict re-read.
      return reads <= 2 ? contract() : contract({ signatureStatus: 'signed' })
    })
    let commits = 0
    h.commit.mockImplementation(async () => {
      commits += 1
      if (commits > 1) {
        throw Object.assign(new Error('Revision mismatch'), {
          statusCode: 409,
        })
      }
      return {}
    })

    const [first, second] = await Promise.allSettled([
      caller.submitSignature(submitInput),
      caller.submitSignature(submitInput),
    ])

    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('rejected')
    const error = (second as PromiseRejectedResult).reason as TRPCError
    expect({ code: error.code, message: error.message }).toEqual({
      code: 'PRECONDITION_FAILED',
      message: 'This contract has already been signed.',
    })

    // ONE signature, ONE promotion, ONE notification — the race's whole point.
    expect(h.promoteToClosedWonOnContract).toHaveBeenCalledTimes(1)
    expect(h.publishSponsorStatusChange).toHaveBeenCalledTimes(1)
    expect(h.notifySponsorContractSigned).toHaveBeenCalledTimes(1)
    expect(h.logSignatureStatusChange).toHaveBeenCalledTimes(1)

    // The loser embedded and uploaded a PDF before its patch was rejected, and
    // nothing references it — the winner wrote its own. Conditioning the patch
    // made that leak MORE likely, so the cleanup belongs with the guard.
    expect(h.deleteAsset).toHaveBeenCalledTimes(1)
    expect(h.deleteAsset).toHaveBeenCalledWith('file-1')
  })

  it('still refuses when the orphan cleanup itself fails', async () => {
    // Storage debt must not become a confusing error on top of a correct
    // refusal: the signer is told the contract is signed either way.
    h.deleteAsset.mockRejectedValue(new Error('storage unavailable'))
    let reads = 0
    h.getSigningContract.mockImplementation(async () => {
      reads += 1
      return reads === 1 ? contract() : contract({ signatureStatus: 'signed' })
    })
    h.commit.mockRejectedValue(
      Object.assign(new Error('Revision mismatch'), { statusCode: 409 }),
    )

    await expectRefusal(
      caller.submitSignature(submitInput),
      'PRECONDITION_FAILED',
      'This contract has already been signed.',
    )
  })

  it('refuses rather than writing blind when the read carried no revision', async () => {
    h.getSigningContract.mockResolvedValue(contract({ _rev: undefined }))

    await expectRefusal(
      caller.submitSignature(submitInput),
      'CONFLICT',
      'This contract could not be read cleanly. Reload the page and try again.',
    )
    expect(h.commit).not.toHaveBeenCalled()
    expect(h.promoteToClosedWonOnContract).not.toHaveBeenCalled()
  })
})

describe('the signing GROQ projection', () => {
  it('projects _rev, which the conditional write depends on', async () => {
    // Every other test here mocks `getSigningContract`, so dropping `_rev`
    // from the projection is invisible to them while breaking EVERY real
    // signature (no revision -> the CONFLICT refusal above). This reaches the
    // real module and reads the query it sends.
    const { getSigningContract } = await vi.importActual<
      typeof import('@/lib/signing/sanity')
    >('@/lib/signing/sanity')
    h.uncachedFetch.mockResolvedValue(null)

    await getSigningContract(TOKEN)

    const [query, params] = h.uncachedFetch.mock.calls[0] as [string, object]
    expect(query).toMatch(/^\s*_rev,$/m)
    expect(params).toEqual({ signingToken: TOKEN })
  })
})

describe('signing tenancy — the token is the only boundary', () => {
  /**
   * STATED PLAINLY, because it is a property of the design and not a defect
   * these tests can assert away: `signing` has NO tenant scoping. Both
   * procedures are `publicProcedure`, no session, no `orgId`, no conference
   * resolved from the request host. `getSigningContract` is a repo-wide GROQ
   * lookup on `signatureId == $token` across every `sponsorForConference` in
   * the dataset — it is baselined as unscoped in
   * `eslint-rules/no-unscoped-groq.baseline.json`.
   *
   * So anyone holding a token reaches that contract from any host, including
   * another tenant's. The token (a server-minted `randomUUID`, 122 bits) is
   * the only thing standing between a caller and another tenant's contract.
   * These two tests pin that reality rather than pretending otherwise: the
   * lookup is by token alone, and no host or org is consulted.
   */
  it('resolves a contract by token alone, with no host or org input', async () => {
    const foreign = contract({
      _id: 'sfc-other-tenant',
      conference: { _id: 'conf-other', title: 'Other Tenant Conf' },
    })
    h.getSigningContract.mockResolvedValue(foreign)

    const result = await caller.getContract({ token: TOKEN })

    expect(result).toMatchObject({ conferenceName: 'Other Tenant Conf' })
    expect(h.getSigningContract).toHaveBeenCalledTimes(1)
    expect(h.getSigningContract).toHaveBeenCalledWith(TOKEN)
  })

  it('writes to the document the token matched, never a caller-supplied id', async () => {
    h.getSigningContract.mockResolvedValue(contract({ _id: 'sfc-42' }))

    await caller.submitSignature(submitInput)

    // The id patched is the MATCHED document's own `_id`. A caller can name a
    // token, never a document.
    expect(h.patch).toHaveBeenCalledWith('sfc-42')
    expect(h.promoteToClosedWonOnContract).toHaveBeenCalledWith(
      'sfc-42',
      expect.anything(),
      'signer',
    )
  })
})
