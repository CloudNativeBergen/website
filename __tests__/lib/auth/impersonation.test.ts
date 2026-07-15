/**
 * @vitest-environment node
 *
 * Security tests for the dev-only impersonation path in `getAuthSession`
 * (src/lib/auth.ts). Impersonation lets a DEV organizer view the site as another
 * (non-organizer) speaker via `?impersonate=<speakerId>`. These tests lock down
 * every guard around that power:
 *   - HARD-DISABLED in production (NODE_ENV==='production').
 *   - dev + organizer-only gating.
 *   - id sanity validation (pattern + length).
 *   - privilege-escalation block: organizer cannot impersonate ANOTHER organizer.
 *   - happy path for a dev organizer impersonating a non-organizer speaker.
 *
 * The boundaries of `getAuthSession` are mocked: the resolved auth session
 * (`_auth`), the environment flags (`AppEnvironment`), and the speaker lookup
 * (`getSpeaker`). NODE_ENV is set per-test where the production bypass matters.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Session } from 'next-auth'

const h = vi.hoisted(() => ({
  // Mutable environment flags read via getters on the mocked AppEnvironment.
  env: { isTestMode: false, isDevelopment: true, isProduction: false },
  mockAuth: vi.fn(),
  mockGetSpeaker: vi.fn(),
}))

// Control what `_auth()` resolves to (the browser cookie session).
vi.mock('next-auth', () => ({
  default: () => ({
    auth: h.mockAuth,
    signIn: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
  }),
  AuthError: class AuthError extends Error {},
}))

// Control the environment gate. Getters so per-test mutation of `h.env` is live.
vi.mock('@/lib/environment/config', () => ({
  AppEnvironment: {
    get isTestMode() {
      return h.env.isTestMode
    },
    get isDevelopment() {
      return h.env.isDevelopment
    },
    get isProduction() {
      return h.env.isProduction
    },
    createMockAuthContext: () => ({ user: { email: 'mock@test' } }),
  },
}))

// `getSpeaker` is dynamically imported inside getAuthSession; mock the module.
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: h.mockGetSpeaker,
  getOrCreateSpeaker: vi.fn(),
}))

import { getAuthSession } from '@/lib/auth'

const ADMIN_ID = 'org-admin-1'
const TARGET_SPEAKER_ID = 'speaker-2'
const OTHER_ORGANIZER_ID = 'org-admin-2'

function organizerSession(): Session {
  return {
    expires: new Date(Date.now() + 3_600_000).toISOString(),
    user: {
      sub: 'sub-admin',
      name: 'Admin',
      email: 'admin@cloudnativedays.no',
      picture: '',
    },
    speaker: {
      _id: ADMIN_ID,
      email: 'admin@cloudnativedays.no',
      isOrganizer: true,
    },
    account: { provider: 'github', providerAccountId: '1', type: 'oauth' },
  } as unknown as Session
}

function nonOrganizerSession(): Session {
  const s = organizerSession()
  ;(s.speaker as { _id: string; isOrganizer: boolean })._id = TARGET_SPEAKER_ID
  ;(s.speaker as { isOrganizer: boolean }).isOrganizer = false
  return s
}

function reqWithImpersonate(id: string) {
  return {
    url: `http://localhost:3000/?impersonate=${id}`,
    headers: new Headers(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: development, non-test mode. Individual tests override as needed.
  h.env.isTestMode = false
  h.env.isDevelopment = true
  h.env.isProduction = false
  // Silence audit/security console output the code emits.
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('getAuthSession impersonation — production hard-disable', () => {
  it('IGNORES impersonation entirely in production, even for a dev organizer', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    // Even if the env flags were somehow both true, the explicit NODE_ENV
    // check must short-circuit BEFORE any impersonation logic runs.
    h.env.isDevelopment = true
    h.mockAuth.mockResolvedValue(organizerSession())

    const result = await getAuthSession(reqWithImpersonate(TARGET_SPEAKER_ID))

    expect(result?.speaker?._id).toBe(ADMIN_ID)
    expect(result?.isImpersonating).toBeUndefined()
    expect(result?.realAdmin).toBeUndefined()
    // The speaker lookup must never even be attempted in production.
    expect(h.mockGetSpeaker).not.toHaveBeenCalled()
  })
})

describe('getAuthSession impersonation — dev/organizer gating', () => {
  it('does not impersonate when NODE_ENV is not development (double-check gate)', async () => {
    h.env.isDevelopment = false
    h.mockAuth.mockResolvedValue(organizerSession())

    const result = await getAuthSession(reqWithImpersonate(TARGET_SPEAKER_ID))

    expect(result?.isImpersonating).toBeUndefined()
    expect(result?.speaker?._id).toBe(ADMIN_ID)
    expect(h.mockGetSpeaker).not.toHaveBeenCalled()
  })

  it('does not allow a NON-organizer session to impersonate', async () => {
    h.mockAuth.mockResolvedValue(nonOrganizerSession())

    const result = await getAuthSession(
      reqWithImpersonate('some-other-speaker'),
    )

    expect(result?.isImpersonating).toBeUndefined()
    expect(result?.speaker?._id).toBe(TARGET_SPEAKER_ID)
    expect(h.mockGetSpeaker).not.toHaveBeenCalled()
  })

  it('returns the session unchanged when no impersonate param is present', async () => {
    h.mockAuth.mockResolvedValue(organizerSession())

    const result = await getAuthSession({
      url: 'http://localhost:3000/dashboard',
      headers: new Headers(),
    })

    expect(result?.isImpersonating).toBeUndefined()
    expect(result?.speaker?._id).toBe(ADMIN_ID)
    expect(h.mockGetSpeaker).not.toHaveBeenCalled()
  })
})

describe('getAuthSession impersonation — id validation', () => {
  it('rejects an impersonation id that fails the SANITY_ID_PATTERN', async () => {
    h.mockAuth.mockResolvedValue(organizerSession())

    // Space + punctuation are not allowed by /^[a-zA-Z0-9_-]+$/.
    const result = await getAuthSession(reqWithImpersonate('bad id!'))

    expect(result?.isImpersonating).toBeUndefined()
    expect(result?.speaker?._id).toBe(ADMIN_ID)
    expect(h.mockGetSpeaker).not.toHaveBeenCalled()
  })

  it('rejects an impersonation id that exceeds the max length', async () => {
    h.mockAuth.mockResolvedValue(organizerSession())

    const longId = 'a'.repeat(101)
    const result = await getAuthSession(reqWithImpersonate(longId))

    expect(result?.isImpersonating).toBeUndefined()
    expect(result?.speaker?._id).toBe(ADMIN_ID)
    expect(h.mockGetSpeaker).not.toHaveBeenCalled()
  })
})

describe('getAuthSession impersonation — privilege escalation block', () => {
  it('BLOCKS an organizer from impersonating ANOTHER organizer', async () => {
    h.mockAuth.mockResolvedValue(organizerSession())
    h.mockGetSpeaker.mockResolvedValue({
      speaker: {
        _id: OTHER_ORGANIZER_ID,
        email: 'other-admin@cloudnativedays.no',
        isOrganizer: true,
      },
      err: null,
    })

    const result = await getAuthSession(reqWithImpersonate(OTHER_ORGANIZER_ID))

    // Must fall through: session stays as the real admin, no impersonation.
    expect(result?.isImpersonating).toBeUndefined()
    expect(result?.realAdmin).toBeUndefined()
    expect(result?.speaker?._id).toBe(ADMIN_ID)
  })

  it('does not impersonate when the target speaker is not found', async () => {
    h.mockAuth.mockResolvedValue(organizerSession())
    h.mockGetSpeaker.mockResolvedValue({ speaker: null, err: null })

    const result = await getAuthSession(reqWithImpersonate('ghost-speaker'))

    expect(result?.isImpersonating).toBeUndefined()
    expect(result?.speaker?._id).toBe(ADMIN_ID)
  })
})

describe('getAuthSession impersonation — happy path', () => {
  it('lets a dev organizer impersonate a NON-organizer speaker with flags set', async () => {
    h.mockAuth.mockResolvedValue(organizerSession())
    const impersonated = {
      _id: TARGET_SPEAKER_ID,
      email: 'speaker@example.com',
      name: 'Regular Speaker',
      isOrganizer: false,
    }
    h.mockGetSpeaker.mockResolvedValue({ speaker: impersonated, err: null })

    const result = await getAuthSession(reqWithImpersonate(TARGET_SPEAKER_ID))

    expect(h.mockGetSpeaker).toHaveBeenCalledWith(TARGET_SPEAKER_ID)
    expect(result?.isImpersonating).toBe(true)
    expect(result?.speaker?._id).toBe(TARGET_SPEAKER_ID)
    expect(result?.speaker?.email).toBe('speaker@example.com')
    // realAdmin preserves the true organizer identity for audit / un-impersonate.
    expect(result?.realAdmin?._id).toBe(ADMIN_ID)
  })
})
