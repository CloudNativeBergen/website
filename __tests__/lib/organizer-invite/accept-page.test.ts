/**
 * @vitest-environment node
 *
 * THE ACCEPT PAGE'S CHECK ORDER.
 *
 * The page mirrors `organizerInvite.accept`, and an earlier draft got the order
 * wrong in exactly the way the rework exists to prevent: it rendered `expired`
 * and `inactive` BEFORE evaluating ownership, handing anyone holding a forwarded
 * token the invitation's lifecycle state. That mistake was recorded in a comment
 * and defended by nothing — inserting an expiry check above the ownership check
 * passed the entire suite.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/seo/brand', () => ({ resolveMetadataBrand: vi.fn() }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))
vi.mock('@/lib/organizer-invite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/organizer-invite')>()
  return { ...actual, getOrganizerInvitationById: vi.fn() }
})

import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  getOrganizerInvitationById,
  mintOrganizerInviteToken,
} from '@/lib/organizer-invite'
import { resolveState } from '@/app/(main)/organizer-invitation/accept/page'

const CONF = 'conf-a'
const INVITED = 'ada@example.com'

function invitation(overrides: Record<string, unknown> = {}) {
  const base = {
    _id: 'inv-1',
    _rev: 'rev-1',
    invitedEmail: INVITED,
    status: 'pending',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    invitedByName: 'Hanna',
    ...overrides,
  }
  return {
    ...base,
    token: mintOrganizerInviteToken({
      docId: base._id as string,
      invitedEmail: base.invitedEmail as string,
      expiresAt: new Date(base.expiresAt as string).getTime(),
    }),
  }
}

const args = (token: string, provedAddress: string | null) => ({
  token,
  signInHref: '/signin',
  currentEmail: 'someone@example.com',
  provedAddress,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
    conference: { _id: CONF, title: 'Test Conf' },
    domain: 'test.example',
  } as never)
})

describe('resolveState — ownership is decided first', () => {
  it.each([
    [
      'an EXPIRED invitation',
      { expiresAt: new Date(Date.now() - 1000).toISOString() },
    ],
    ['a REVOKED invitation', { status: 'revoked' }],
    ['an ACCEPTED invitation', { status: 'accepted' }],
    ['a live pending invitation', {}],
  ])(
    'shows a non-owner the SAME state for %s (no lifecycle leak)',
    async (_label, overrides) => {
      const inv = invitation(overrides)
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(inv as never)

      const state = await resolveState(args(inv.token, 'stranger@example.com'))
      expect(state.kind).toBe('wrong-identity')
    },
  )

  it('masks the invited address for a non-owner', async () => {
    const inv = invitation()
    vi.mocked(getOrganizerInvitationById).mockResolvedValue(inv as never)
    const state = await resolveState(args(inv.token, 'stranger@example.com'))
    if (state.kind !== 'wrong-identity') throw new Error('wrong state')
    expect(state.maskedEmail).not.toContain('ada@')
    expect(state.maskedEmail).toContain('@example.com')
  })

  it.each([
    [
      'expired',
      { expiresAt: new Date(Date.now() - 1000).toISOString() },
      'expired',
    ],
    ['revoked', { status: 'revoked' }, 'inactive'],
    ['accepted', { status: 'accepted' }, 'inactive'],
  ])(
    'shows the OWNER the precise %s state (so the test above is not vacuous)',
    async (_label, overrides, expected) => {
      const inv = invitation(overrides)
      vi.mocked(getOrganizerInvitationById).mockResolvedValue(inv as never)
      const state = await resolveState(args(inv.token, INVITED))
      expect(state.kind).toBe(expected)
    },
  )

  it('shows the owner of a live invitation the accept button', async () => {
    const inv = invitation()
    vi.mocked(getOrganizerInvitationById).mockResolvedValue(inv as never)
    const state = await resolveState(args(inv.token, '  ADA@Example.COM '))
    expect(state).toMatchObject({ kind: 'ready', invitedEmail: INVITED })
  })

  it('treats a session with no proved address as a non-owner', async () => {
    const inv = invitation()
    vi.mocked(getOrganizerInvitationById).mockResolvedValue(inv as never)
    expect((await resolveState(args(inv.token, null))).kind).toBe(
      'wrong-identity',
    )
  })

  it('collapses a forged token and a foreign-tenant token to `invalid`', async () => {
    expect((await resolveState(args('nope.nope', INVITED))).kind).toBe(
      'invalid',
    )
    vi.mocked(getOrganizerInvitationById).mockResolvedValue(null)
    const inv = invitation()
    expect((await resolveState(args(inv.token, INVITED))).kind).toBe('invalid')
  })
})
