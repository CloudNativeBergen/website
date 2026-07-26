/**
 * @vitest-environment node
 *
 * B2 (#642) — canAccessConversation's ORGANIZER branch must be ORG-SCOPED. Before
 * the fix it short-circuited on the DEPRECATED GLOBAL `speaker.isOrganizer`, so an
 * organizer of ANY org could read/write another tenant's thread by id. It now
 * keys on the conversation's OWN org (`conferenceOrgId`) via `isOrganizerForOrg`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canAccessConversation } from './sanity'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// A proposal thread owned by org-A, with speaker sp-owner on the proposal.
const orgAThread = () => ({
  conversationType: 'proposal' as const,
  conferenceOrgId: 'org-A',
  proposalSpeakerIds: ['sp-owner'],
  createdById: 'sp-owner',
  subjectSpeakerId: undefined,
  participants: [{ partyType: 'speaker' as const, speakerId: 'sp-owner' }],
})

describe('canAccessConversation — org-scoped organizer (B2)', () => {
  it('GRANTS a same-org organizer', () => {
    expect(
      canAccessConversation(orgAThread(), {
        _id: 'org-a-admin',
        organizerOrgIds: ['org-A'],
      }),
    ).toBe(true)
  })

  it('DENIES a cross-tenant organizer (org-B) reaching an org-A thread', () => {
    expect(
      canAccessConversation(orgAThread(), {
        _id: 'org-b-admin',
        isOrganizer: true,
        organizerOrgIds: ['org-B'],
      }),
    ).toBe(false)
  })

  it('still GRANTS the speaker who is a party on the thread (unaffected)', () => {
    expect(
      canAccessConversation(orgAThread(), {
        _id: 'sp-owner',
        organizerOrgIds: [],
      }),
    ).toBe(true)
  })

  it('DENIES an unrelated speaker (not a party, not an organizer)', () => {
    expect(
      canAccessConversation(orgAThread(), {
        _id: 'sp-other',
        organizerOrgIds: [],
      }),
    ).toBe(false)
  })

  it('legacy-token bridge: an org-less global-flag organizer still passes (parity, sunset)', () => {
    // No organizerOrgIds field → pre-#635 token → isOrganizerForOrg bridges via
    // the global flag regardless of the thread org (matches #639 semantics).
    expect(
      canAccessConversation(orgAThread(), {
        _id: 'legacy-admin',
        isOrganizer: true,
      }),
    ).toBe(true)
  })

  it('a null thread org denies an org organizer (fail closed)', () => {
    expect(
      canAccessConversation(
        { ...orgAThread(), conferenceOrgId: null },
        { _id: 'org-a-admin', isOrganizer: true, organizerOrgIds: ['org-A'] },
      ),
    ).toBe(false)
  })
})
