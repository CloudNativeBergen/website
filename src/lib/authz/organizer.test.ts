/**
 * @vitest-environment node
 *
 * Unit tests for the org-scoped organizer authorization helpers (CaaS T1-2,
 * #614). This is THE security boundary the middleware waist and every gate share,
 * so we pin: an org member passes; an organizer of ANOTHER org is denied;
 * fail-closed when the org resolves but the caller is not a member; org
 * UNRESOLVABLE FAILS CLOSED (with a warn on a real organizer's denial); and — the
 * point of the bridge removal — a LEGACY TOKEN (no `organizerOrgIds` field) is
 * denied on EVERY host even with the deprecated global `isOrganizer` flag set,
 * because that flag is global and would otherwise grant cross-tenant.
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
    // A globally-flagged organizer with NO org membership is denied: the global
    // flag no longer participates in the decision at all.
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

  describe('legacy token (organizerOrgIds ABSENT) — bridge REMOVED', () => {
    // The deleted bridge deferred wholesale to the deprecated GLOBAL
    // `isOrganizer` flag, which is true for an organizer of ANY org — so a
    // pre-#635 token granted organizer on EVERY host. These pin that it cannot.
    const HOSTS = ['org-a', 'org-b', 'org-cnb', 'org-platform']

    it.each(HOSTS)(
      'DENIES a pre-#635 token with isOrganizer: true on host org %s',
      (orgId) => {
        expect(
          isOrganizerForOrg({ _id: 'sp-1', isOrganizer: true } as never, orgId),
        ).toBe(false)
      },
    )

    it('DENIES a pre-#635 token with isOrganizer: true when the org is unresolvable', () => {
      expect(
        isOrganizerForOrg({ _id: 'sp-1', isOrganizer: true } as never, null),
      ).toBe(false)
    })

    it('does NOT log the removed legacy-token grant', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      isOrganizerForOrg({ _id: 'sp-1', isOrganizer: true } as never, 'org-a')
      expect(warn).not.toHaveBeenCalled()
    })

    it('DENIES a present-but-EMPTY organizerOrgIds (organizer of no org)', () => {
      expect(
        isOrganizerForOrg(
          { _id: 'sp-1', isOrganizer: true, organizerOrgIds: [] } as never,
          'org-a',
        ),
      ).toBe(false)
    })

    it('DENIES a legacy token whose global flag is false', () => {
      expect(
        isOrganizerForOrg(
          { _id: 'sp-1', isOrganizer: false } as never,
          'org-a',
        ),
      ).toBe(false)
    })
  })

  describe('org unresolvable (orgId === null) — FAILS CLOSED', () => {
    it('DENIES a real organizer (member of some org) and WARNS on the denial', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(
        isOrganizerForOrg(speaker({ organizerOrgIds: ['org-A'] }), null),
      ).toBe(false)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[authz-bridge]'),
      )
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('DENYING (fail-closed'),
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

  it('DENIES (fail-closed) when the org is unresolvable', async () => {
    h.resolveOrg.mockResolvedValue(null)
    expect(await isOrganizerForCurrentOrg(speaker({ isOrganizer: true }))).toBe(
      false,
    )
  })

  it('DENIES a legacy token (no organizerOrgIds) on a resolvable host', async () => {
    h.resolveOrg.mockResolvedValue('org-A')
    expect(
      await isOrganizerForCurrentOrg({
        _id: 'sp-1',
        isOrganizer: true,
      } as never),
    ).toBe(false)
  })

  it('short-circuits (no resolve) for an anonymous speaker', async () => {
    expect(await isOrganizerForCurrentOrg(null)).toBe(false)
    expect(h.resolveOrg).not.toHaveBeenCalled()
  })
})
