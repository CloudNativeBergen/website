/**
 * @vitest-environment node
 *
 * tRPC-level authorization tests for `speaker.updateEmail` (the self-service
 * mutation). The ownership GUARD (`isEmailVerifiedForSession`) is unit-tested in
 * src/lib/profile/server.test.ts; this suite covers the MUTATION wiring:
 *
 *   - owned email      → the write is performed against the CALLER's own id.
 *   - non-owned email  → FORBIDDEN, and NO write happens (display `email` /
 *                        `knownEmails` are left untouched).
 *   - the self path can only ever target `ctx.speaker._id` — the input schema
 *     carries no speaker id, so a caller cannot direct the write at another id.
 *
 * The guard is genuinely exercised (NOT stubbed): we mock only its data-source
 * boundary — `clientReadUncached.fetch`, which backs the persisted verified
 * match-set (`speaker.knownEmails`) — and the `clientWrite` patch chain that the
 * mutation uses to persist. The session used has no GitHub account, so the guard
 * resolves ownership purely from the mocked `knownEmails` set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'

const { mockKnownEmailsFetch, mockPatch, mockSet, mockCommit } = vi.hoisted(
  () => ({
    mockKnownEmailsFetch: vi.fn(),
    mockPatch: vi.fn(),
    mockSet: vi.fn(),
    mockCommit: vi.fn(),
  }),
)

vi.mock('@/lib/sanity/client', () => ({
  // Backs getSpeakerKnownEmails() inside the real isEmailVerifiedForSession guard.
  clientReadUncached: { fetch: mockKnownEmailsFetch },
  // Backs updateProfileEmail(): clientWrite.patch(id).set({ email }).commit().
  clientWrite: { patch: mockPatch },
}))

import { createAuthenticatedCaller, speakers } from '../../helpers/trpc'

const caller = () => createAuthenticatedCaller() // defaults to speakers[0]
const CALLER = speakers[0]
const OTHER_SPEAKER = speakers[1]

describe('speaker.updateEmail — authorization (tRPC integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-establish the patch chain after clearAllMocks reset return values:
    // clientWrite.patch(id).set({ email }).commit().
    mockPatch.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ commit: mockCommit })
    mockCommit.mockResolvedValue({})
  })

  it('ALLOWS setting an email the caller owns, writing to the caller own id', async () => {
    // The caller's persisted verified match-set contains the requested email.
    mockKnownEmailsFetch.mockResolvedValue(['owned@example.com'])

    const result = await caller().speaker.updateEmail({
      email: 'owned@example.com',
    })

    expect(result).toEqual({ success: true, email: 'owned@example.com' })
    // Write targeted the CALLER's own speaker id — never a client-chosen id.
    expect(mockPatch).toHaveBeenCalledWith(CALLER._id)
    expect(mockPatch).not.toHaveBeenCalledWith(OTHER_SPEAKER._id)
    expect(mockSet).toHaveBeenCalledWith({ email: 'owned@example.com' })
  })

  it('allows an owned email case-insensitively (guard normalizes)', async () => {
    mockKnownEmailsFetch.mockResolvedValue(['Owned@Example.com'])

    const result = await caller().speaker.updateEmail({
      email: 'owned@example.com',
    })

    expect(result.success).toBe(true)
    expect(mockPatch).toHaveBeenCalledWith(CALLER._id)
  })

  it('FORBIDS setting an email the caller does NOT own and performs NO write', async () => {
    // Caller owns a different address than the one requested.
    mockKnownEmailsFetch.mockResolvedValue(['owned@example.com'])

    await expect(
      caller().speaker.updateEmail({ email: 'attacker@evil.com' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    // Nothing was persisted: display `email` / `knownEmails` left unchanged.
    expect(mockPatch).not.toHaveBeenCalled()
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('FORBIDS when the caller has no verified emails at all', async () => {
    mockKnownEmailsFetch.mockResolvedValue([])

    await expect(
      caller().speaker.updateEmail({ email: 'anything@example.com' }),
    ).rejects.toBeInstanceOf(TRPCError)
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('cannot be pointed at another speaker id (schema carries no id; write uses ctx.speaker._id)', async () => {
    mockKnownEmailsFetch.mockResolvedValue(['owned@example.com'])

    // Even if a caller smuggles an `id` into the payload, the input schema
    // strips it and the mutation always writes to the session speaker's id.
    await caller().speaker.updateEmail({
      email: 'owned@example.com',
      // @ts-expect-error — EmailUpdateSchema has no `id`; asserting it is ignored.
      id: OTHER_SPEAKER._id,
    })

    expect(mockPatch).toHaveBeenCalledWith(CALLER._id)
    expect(mockPatch).not.toHaveBeenCalledWith(OTHER_SPEAKER._id)
  })
})
