import { describe, it, expect, vi, beforeEach } from 'vitest'
import { expectedTxtValue } from './challenge'
import { isAllowlistEligible } from './policy'
import type { DomainVerificationPatch, DomainVerificationRecord } from './types'

/**
 * End-to-end delisting behaviour, driven through the REAL dns classifier and
 * the REAL policy — only the two boundaries (the resolver socket and Sanity)
 * are faked. That is what makes these tests bite: they exercise the exact
 * sequence a lapsed conference domain goes through.
 */

/** Mutable fake zone: name → TXT RRset, or an error code to throw. */
const zone = new Map<string, string[][] | { code: string }>()

vi.mock('./dns', async () => {
  const actual = await vi.importActual<typeof import('./dns')>('./dns')
  return {
    checkDomainChallenge: (entry: string, token: string) =>
      actual.checkDomainChallenge(entry, token, async (name) => {
        const answer = zone.get(name)
        if (!answer)
          throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
        if (!Array.isArray(answer)) {
          throw Object.assign(new Error(answer.code), { code: answer.code })
        }
        return answer
      }),
  }
})

const store = new Map<string, DomainVerificationRecord>()

vi.mock('./sanity', () => ({
  listAllDomainVerifications: async () =>
    [...store.values()].map((r) => ({ ...r })),
  patchDomainVerification: async (
    id: string,
    patch: DomainVerificationPatch,
  ) => {
    const current = store.get(id)
    if (current) store.set(id, { ...current, ...patch })
  },
  getConferenceAlertTargets: async () => ['speaker-1'],
}))

const createNotifications = vi.fn(async () => 1)
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: (...args: unknown[]) =>
    createNotifications(...(args as [])),
}))

const { runDomainVerificationSweep } = await import('./sweep')

const NOW = new Date('2026-07-01T12:00:00.000Z')
const TOKEN = 'tok-live'
const HOST = 'lapsed-conf.no'
const ID = `domainVerification.${HOST}`
const CHALLENGE = `_konf-challenge.${HOST}`

function seedVerified(overrides: Partial<DomainVerificationRecord> = {}) {
  store.set(ID, {
    _id: ID,
    hostname: HOST,
    conferenceId: 'conference-1',
    token: TOKEN,
    status: 'verified',
    method: 'dns-txt',
    graceUntil: null,
    verifiedAt: '2026-01-01T00:00:00.000Z',
    lastSuccessAt: '2026-06-30T00:00:00.000Z',
    lastCheckedAt: '2026-06-30T00:00:00.000Z',
    firstFailureAt: null,
    consecutiveFailures: 0,
    consecutiveSoftFailures: 0,
    lastError: null,
    ...overrides,
  })
}

beforeEach(() => {
  zone.clear()
  store.clear()
  createNotifications.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runDomainVerificationSweep', () => {
  it('keeps a domain verified while its TXT record is published', async () => {
    seedVerified()
    zone.set(CHALLENGE, [[expectedTxtValue(TOKEN)]])

    const summary = await runDomainVerificationSweep(NOW)

    expect(summary).toMatchObject({ checked: 1, verified: 1, delisted: [] })
    const after = store.get(ID)!
    expect(after.status).toBe('verified')
    expect(isAllowlistEligible(after, NOW)).toBe(true)
  })

  it('DELISTS a domain whose TXT record has been removed, and alerts', async () => {
    // The dangling-DNS scenario: the conference ended, the zone changed hands,
    // the proof is gone — but the claim (and the redirect grant) is still ours.
    seedVerified()
    // No entry in the zone → NXDOMAIN → hard failure.

    const summary = await runDomainVerificationSweep(NOW)

    expect(summary.hardFailures).toBe(1)
    expect(summary.delisted).toEqual([HOST])
    const after = store.get(ID)!
    expect(after.status).toBe('failing')
    expect(isAllowlistEligible(after, NOW)).toBe(false)
    // The failure is otherwise SILENT, so it must be reported.
    expect(createNotifications).toHaveBeenCalledTimes(1)
    const [items] = createNotifications.mock.calls[0] as unknown as [
      { recipientId: string; title: string; link: string }[],
    ]
    expect(items[0].recipientId).toBe('speaker-1')
    expect(items[0].title).toContain(HOST)
  })

  it('DELISTS when the record exists but now carries someone else’s token', async () => {
    seedVerified()
    zone.set(CHALLENGE, [[expectedTxtValue('a-token-we-never-issued')]])

    const summary = await runDomainVerificationSweep(NOW)

    expect(summary.delisted).toEqual([HOST])
    expect(isAllowlistEligible(store.get(ID)!, NOW)).toBe(false)
  })

  it('does NOT delist on a transient resolver failure', async () => {
    seedVerified()
    zone.set(CHALLENGE, { code: 'ETIMEOUT' })

    const summary = await runDomainVerificationSweep(NOW)

    expect(summary.softFailures).toBe(1)
    expect(summary.delisted).toEqual([])
    const after = store.get(ID)!
    expect(after.status).toBe('verified')
    expect(after.consecutiveSoftFailures).toBe(1)
    expect(isAllowlistEligible(after, NOW)).toBe(true)
    expect(createNotifications).not.toHaveBeenCalled()
  })

  it('restores a failing domain once the record is republished', async () => {
    seedVerified({
      status: 'failing',
      firstFailureAt: '2026-06-29T00:00:00.000Z',
      consecutiveFailures: 2,
      lastError: 'No TXT record',
    })
    zone.set(CHALLENGE, [[expectedTxtValue(TOKEN)]])

    await runDomainVerificationSweep(NOW)

    const after = store.get(ID)!
    expect(after.status).toBe('verified')
    expect(after.consecutiveFailures).toBe(0)
    expect(after.firstFailureAt).toBeNull()
    expect(isAllowlistEligible(after, NOW)).toBe(true)
  })

  it('reports a per-domain failure without aborting the rest of the sweep', async () => {
    seedVerified()
    store.set('domainVerification.other-conf.no', {
      ...store.get(ID)!,
      _id: 'domainVerification.other-conf.no',
      hostname: 'other-conf.no',
    })
    zone.set(CHALLENGE, [[expectedTxtValue(TOKEN)]])
    zone.set('_konf-challenge.other-conf.no', [[expectedTxtValue(TOKEN)]])

    const summary = await runDomainVerificationSweep(NOW)
    expect(summary.checked).toBe(2)
    expect(summary.errored).toEqual([])
  })
})
