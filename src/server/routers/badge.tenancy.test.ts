/**
 * @vitest-environment node
 *
 * CROSS-TENANT DELIVERY for badges (#863, HIGH).
 *
 * `badge.admin.resendEmail` looked a badge up with `getBadgeById` — a by-PUBLIC-id
 * read with no conference predicate — and then MAILED whichever speaker came
 * back. It is the only procedure in the #863 census that ACTS rather than reads:
 * an organizer of tenant A could put tenant B's badge id on the wire and cause
 * delivery to B's speaker, from our infrastructure, without B doing anything.
 * Its siblings `rebake` and `delete` were both guarded.
 *
 * WHAT THE MOCKS DO AND DO NOT DECIDE. `getBadgeForConference` is mocked with the
 * PREDICATE IT ACTUALLY CARRIES (`conference._ref == $conferenceId`) rather than
 * a canned answer, and `getBadgeById` with the global read it actually is — so
 * swapping the router back to the unscoped lookup really does surface the
 * foreign badge, and these tests fail on the ADDRESS THAT GETS MAILED, not on an
 * error message that moved. The predicate itself is pinned separately, at the
 * query, in `src/lib/badge/sanity.scoped.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  getBadgeById: vi.fn(),
  getBadgeForConference: vi.fn(),
  sendBadgeEmailWithRetry: vi.fn(),
  getSpeaker: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/badge/sanity', () => ({
  getBadgeById: h.getBadgeById,
  getBadgeForConference: h.getBadgeForConference,
  listBadgesForConference: vi.fn(),
  listBadgesForSpeaker: vi.fn(),
  deleteBadge: vi.fn(),
}))
vi.mock('@/lib/email/badge', () => ({
  sendBadgeEmailWithRetry: h.sendBadgeEmailWithRetry,
}))
vi.mock('@/lib/speaker/sanity', () => ({ getSpeaker: h.getSpeaker }))
vi.mock('@/lib/badge/issuance', () => ({ issueBadgeForSpeaker: vi.fn() }))
vi.mock('@/lib/badge/rebake', () => ({ rebakeBadge: vi.fn() }))
// The procedure refuses outright on localhost. That gate is real and has its own
// reason to exist; these cases are about TENANCY, so put us on a deployed host —
// otherwise every one of them would stop at FORBIDDEN and assert nothing.
vi.mock('@/lib/environment/localhost', () => ({
  isLocalhostEnvironment: () => false,
}))

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { badgeRouter } from './badge'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'
const CONF_B = 'conf-B'
const FOREIGN_EMAIL = 'their-speaker@other.test'
const OUR_EMAIL = 'our-speaker@example.test'

function ctx(): Context {
  const speaker = {
    _id: 'sp-admin-A',
    name: 'Admin A',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
  }
  const user = { email: 'a@example.com', name: 'Admin A', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const badge = () => t.createCallerFactory(badgeRouter)(ctx())

function badgeRecord(badgeId: string, conferenceId: string, email: string) {
  return {
    _id: `doc-${badgeId}`,
    badgeId,
    speaker: { _id: `sp-${badgeId}`, name: 'Speaker', email },
    conference: {
      _id: conferenceId,
      title: 'Their Conference',
      startDate: '2026-03-01',
    },
    badgeType: 'speaker',
  }
}

/** The whole dataset, keyed by the public badge id the caller supplies. */
const dataset: Record<string, ReturnType<typeof badgeRecord>> = {
  'badge-ours': badgeRecord('badge-ours', CONF_A, OUR_EMAIL),
  'badge-theirs': badgeRecord('badge-theirs', CONF_B, FOREIGN_EMAIL),
}

/** Every address `sendBadgeEmailWithRetry` was asked to deliver to. */
const recipients = () =>
  h.sendBadgeEmailWithRetry.mock.calls.map(
    (call) => (call[0] as { speakerEmail: string }).speakerEmail,
  )

async function settle<T>(
  promise: Promise<T>,
): Promise<{ value?: T; error?: unknown }> {
  try {
    return { value: await promise }
  } catch (error) {
    return { error }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF_A,
      title: 'Our Conference',
      startDate: '2026-06-01',
      organization: { _ref: ORG_A },
    },
    domain: 'ours.example',
    error: null,
  })

  // The GLOBAL read, as written: any tenant's badge, by public id.
  h.getBadgeById.mockImplementation(async (badgeId: string) =>
    dataset[badgeId]
      ? { badge: dataset[badgeId] }
      : { error: new Error('Badge not found'), reason: 'not-found' },
  )
  // The SCOPED read, carrying the predicate the query carries.
  h.getBadgeForConference.mockImplementation(
    async (badgeId: string, conferenceId: string) => {
      const found = dataset[badgeId]
      if (!found || found.conference._id !== conferenceId) {
        return { error: new Error('Badge not found'), reason: 'not-found' }
      }
      return { badge: found }
    },
  )
  h.sendBadgeEmailWithRetry.mockResolvedValue({ success: true, emailId: 'e-1' })
  h.getSpeaker.mockResolvedValue({ speaker: null, err: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('badge.admin.resendEmail is conference-scoped (#863)', () => {
  it('refuses another tenant’s badge and mails nobody', async () => {
    const outcome = await settle(
      badge().admin.resendEmail({ badgeId: 'badge-theirs' }),
    )

    // Unguarded this resolves `{ success: true }`, and `recipients()` holds the
    // other tenant's speaker — so both lines fail on what actually happened,
    // not on a differently-worded refusal.
    expect(recipients()).toEqual([])
    expect(outcome.value).toBeUndefined()
    expect(outcome.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Badge not found',
    })
  })

  it('asks for the badge WITHIN the request’s conference, never globally', async () => {
    await settle(badge().admin.resendEmail({ badgeId: 'badge-theirs' }))

    expect(h.getBadgeForConference).toHaveBeenCalledWith('badge-theirs', CONF_A)
    expect(h.getBadgeById).not.toHaveBeenCalled()
  })

  it('answers a foreign badge exactly as it answers a nonexistent one', async () => {
    // No existence oracle: the two refusals are the same code AND the same
    // message, so a caller cannot enumerate other tenants' badge ids by
    // comparing them. `volunteer.update`/`delete` (#863, LOW) still can.
    const foreign = await settle(
      badge().admin.resendEmail({ badgeId: 'badge-theirs' }),
    )
    const missing = await settle(
      badge().admin.resendEmail({ badgeId: 'no-such-badge' }),
    )

    expect(foreign.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Badge not found',
    })
    expect(missing.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Badge not found',
    })
    expect(recipients()).toEqual([])
  })

  it('refuses BEFORE any lookup when the conference cannot be resolved', async () => {
    // GUARD BEFORE FETCH (#863). The foreign document must not enter the
    // request at all — not be fetched and then declined. With an unresolvable
    // tenant there is nothing to scope to, so nothing is read.
    h.getConference.mockResolvedValue({
      conference: null,
      domain: 'unknown.example',
      error: new Error('domain lookup failed'),
    })

    const outcome = await settle(
      badge().admin.resendEmail({ badgeId: 'badge-ours' }),
    )

    expect(outcome.value).toBeUndefined()
    expect(h.getBadgeForConference).not.toHaveBeenCalled()
    expect(h.getBadgeById).not.toHaveBeenCalled()
    expect(recipients()).toEqual([])
  })

  it('still mails OUR OWN badge — the guard is not a blanket deny', async () => {
    const outcome = await settle(
      badge().admin.resendEmail({ badgeId: 'badge-ours' }),
    )

    expect(outcome.error).toBeUndefined()
    expect(outcome.value).toMatchObject({ success: true })
    expect(recipients()).toEqual([OUR_EMAIL])
  })

  it('brands the mail with the conference the badge belongs to', async () => {
    // The `conferenceData` fallback takes the DOMAIN conference when the badge's
    // own is not dereferenced. That is only coherent because the badge is now
    // guaranteed to be this conference's — the same reasoning as #858's
    // `currentConf` branch. Pin it so the fallback cannot silently start
    // branding one tenant's badge with another's identity.
    await badge().admin.resendEmail({ badgeId: 'badge-ours' })

    expect(h.sendBadgeEmailWithRetry.mock.calls[0][0]).toMatchObject({
      speakerEmail: OUR_EMAIL,
      conferenceName: 'Their Conference',
    })
  })
})
