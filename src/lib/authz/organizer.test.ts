/**
 * @vitest-environment node
 *
 * Unit tests for the org-scoped organizer authorization helpers (CaaS T1-2,
 * #614). This is THE security boundary the middleware waist and every gate share,
 * so we pin: an org member passes; an organizer of ANOTHER org is denied;
 * fail-closed when the org resolves but the caller is not a member; and the
 * deliberate LEGACY BRIDGE (org unresolvable → deprecated global `isOrganizer`,
 * with a warn) both grants and denies correctly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  resolveOrg: vi.fn<() => Promise<string | null>>(),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: h.resolveOrg,
}))

import {
  isOrganizerForOrg,
  isOrganizerForCurrentOrg,
  resolveCurrentOrgId,
} from './organizer'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const speaker = (over: Record<string, unknown> = {}) => ({
  _id: 'sp-1',
  isOrganizer: false,
  organizerOrgIds: [] as string[],
  ...over,
})

describe('isOrganizerForOrg — pure org-scoped decision', () => {
  it('grants when the request org is in organizerOrgIds', () => {
    expect(
      isOrganizerForOrg(speaker({ organizerOrgIds: ['org-A'] }), 'org-A'),
    ).toBe(true)
  })

  it('DENIES an organizer of ANOTHER org (cross-org 403)', () => {
    expect(
      isOrganizerForOrg(
        speaker({ organizerOrgIds: ['org-B'], isOrganizer: true }),
        'org-A',
      ),
    ).toBe(false)
  })

  it('FAILS CLOSED when the org resolves but the speaker is not a member', () => {
    // A globally-flagged organizer with NO org membership is still denied for a
    // resolvable org — the bridge only applies when the org is unresolvable.
    expect(
      isOrganizerForOrg(
        speaker({ organizerOrgIds: [], isOrganizer: true }),
        'org-A',
      ),
    ).toBe(false)
  })

  it('returns false for a missing/anonymous speaker', () => {
    expect(isOrganizerForOrg(null, 'org-A')).toBe(false)
    expect(isOrganizerForOrg(undefined, null)).toBe(false)
  })

  describe('legacy bridge (orgId === null)', () => {
    it('GRANTS via the deprecated global isOrganizer and WARNS', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(isOrganizerForOrg(speaker({ isOrganizer: true }), null)).toBe(true)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[authz-bridge]'),
      )
    })

    it('DENIES a non-organizer even when the org is unresolvable (no warn)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(isOrganizerForOrg(speaker({ isOrganizer: false }), null)).toBe(
        false,
      )
      expect(warn).not.toHaveBeenCalled()
    })
  })
})

describe('resolveCurrentOrgId', () => {
  it('delegates to the current-conference org resolver', async () => {
    h.resolveOrg.mockResolvedValue('org-A')
    expect(await resolveCurrentOrgId()).toBe('org-A')
  })

  it('passes through a null (unresolvable) org', async () => {
    h.resolveOrg.mockResolvedValue(null)
    expect(await resolveCurrentOrgId()).toBeNull()
  })
})

describe('isOrganizerForCurrentOrg — resolve + decide', () => {
  it('grants an organizer of the resolved current org', async () => {
    h.resolveOrg.mockResolvedValue('org-A')
    expect(
      await isOrganizerForCurrentOrg(speaker({ organizerOrgIds: ['org-A'] })),
    ).toBe(true)
  })

  it('denies an organizer of a different org (cross-org)', async () => {
    h.resolveOrg.mockResolvedValue('org-A')
    expect(
      await isOrganizerForCurrentOrg(
        speaker({ organizerOrgIds: ['org-B'], isOrganizer: true }),
      ),
    ).toBe(false)
  })

  it('bridges to the global flag when the org is unresolvable', async () => {
    h.resolveOrg.mockResolvedValue(null)
    expect(await isOrganizerForCurrentOrg(speaker({ isOrganizer: true }))).toBe(
      true,
    )
  })

  it('short-circuits (no resolve) for an anonymous speaker', async () => {
    expect(await isOrganizerForCurrentOrg(null)).toBe(false)
    expect(h.resolveOrg).not.toHaveBeenCalled()
  })
})
