vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/events/registry', () => ({}))
// OWNERSHIP PROBE (#730): the volunteer endpoints now resolve the target's
// conference before reading or writing it. Report it as belonging to the
// request's conference; the cross-tenant REFUSALS live in
// `src/server/routers/tenancy.writes.test.ts`.
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  clientRead: { fetch: vi.fn() },
  clientReadUncached: {
    fetch: vi.fn(async (query: string) =>
      query.includes('"memberOrgIds"')
        ? {
            _type: 'volunteer',
            orgId: null,
            conferenceId: 'conf-1',
            conferenceOrgId: null,
            memberOrgIds: [],
          }
        : null,
    ),
  },
}))

vi.mock('@/lib/volunteer/sanity', () => ({
  createVolunteer: vi.fn(),
  getVolunteersByConference: vi.fn(),
  getVolunteerById: vi.fn(),
  updateVolunteerStatus: vi.fn(),
  deleteVolunteer: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))

vi.mock('@/lib/slack/notify', () => ({
  notifyNewVolunteer: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn().mockResolvedValue(undefined),
  getOrganizerSpeakerIds: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/email/volunteer', () => ({
  sendVolunteerApprovalEmail: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/time', () => ({
  getCurrentDateTime: vi.fn().mockReturnValue('2026-03-30T12:00:00Z'),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import {
  createAnonymousCaller,
  createAuthenticatedCaller,
  createAdminCaller,
  speakers,
  TEST_ORG_ID,
} from '../../helpers/trpc'
import { createVolunteer, getVolunteerById } from '@/lib/volunteer/sanity'
import { sendVolunteerApprovalEmail } from '@/lib/email/volunteer'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  createNotifications,
  getOrganizerSpeakerIds,
} from '@/lib/notification/sanity'
import { Occupation, TShirtSize, VolunteerStatus } from '@/lib/volunteer/types'

const mockConference = {
  _id: 'conf-1',
  title: 'Cloud Native Day 2026',
  domains: ['localhost'],
  contactEmail: 'info@test.com',
  // Org-scoped authz derives the REQUEST's org from this conference and grants
  // only when the caller's `organizerOrgIds` contains it, so the domain
  // conference must belong to the fixture organizer's org.
  organization: { _type: 'reference', _ref: TEST_ORG_ID },
}

const validVolunteerInput = {
  name: 'Test Volunteer',
  email: 'volunteer@test.com',
  phone: '+4712345678',
  occupation: Occupation.WORKING,
  conferenceId: 'conf-1',
  availability: 'Full day',
  tshirtSize: TShirtSize.M,
  consent: { dataProcessing: true },
}

describe('volunteer router', () => {
  beforeEach(() => {
    // clearAllMocks (not restoreAllMocks): since Vitest 3, restoreAllMocks
    // only touches vi.spyOn spies — it no longer clears vi.fn() factory
    // mocks, so call history would accumulate across tests. clearAllMocks
    // resets history while keeping the factory implementations.
    vi.clearAllMocks()
    vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
      conference: mockConference as any,
      domain: 'localhost',
      error: null,
    })
    // Re-pin the default: per-test mockResolvedValue/mockRejectedValue
    // overrides survive clearAllMocks and would otherwise leak forward.
    vi.mocked(getOrganizerSpeakerIds).mockResolvedValue([])
  })

  describe('create', () => {
    it('should accept public requests (no auth required)', async () => {
      vi.mocked(createVolunteer).mockResolvedValue({
        volunteer: { _id: 'vol-1' } as any,
        error: null,
      })

      const caller = createAnonymousCaller()
      const result = await caller.volunteer.create(validVolunteerInput)
      expect(result).toEqual({ success: true, volunteerId: 'vol-1' })
    })

    it('should record consent with IP address', async () => {
      vi.mocked(createVolunteer).mockResolvedValue({
        volunteer: { _id: 'vol-1' } as any,
        error: null,
      })

      const caller = createAuthenticatedCaller()
      await caller.volunteer.create(validVolunteerInput)

      expect(createVolunteer).toHaveBeenCalledWith(
        expect.objectContaining({
          consent: expect.objectContaining({
            dataProcessing: expect.objectContaining({
              granted: true,
              grantedAt: '2026-03-30T12:00:00Z',
              ipAddress: '127.0.0.1',
            }),
          }),
        }),
      )
    })

    it('should mirror the signup to organizers as an in-app notification', async () => {
      vi.mocked(createVolunteer).mockResolvedValue({
        volunteer: { _id: 'vol-1', name: 'Test Volunteer' } as any,
        error: null,
      })
      vi.mocked(getOrganizerSpeakerIds).mockResolvedValue(['org-1', 'org-2'])

      const caller = createAnonymousCaller()
      await caller.volunteer.create(validVolunteerInput)

      expect(createNotifications).toHaveBeenCalledTimes(1)
      const items = vi.mocked(createNotifications).mock.calls[0][0]
      expect(items.map((i) => i.recipientId).sort()).toEqual(['org-1', 'org-2'])
      for (const item of items) {
        expect(item.notificationType).toBe('system')
        expect(item.title).toBe('New volunteer signup: Test Volunteer')
        expect(item.link).toBe('/admin/volunteers')
        expect(item.conferenceId).toBe('conf-1')
        // Public endpoint: no actor to attribute.
        expect(item.actorId).toBeUndefined()
      }
    })

    it('does not fail the signup when the organizer-id fetch throws', async () => {
      vi.mocked(createVolunteer).mockResolvedValue({
        volunteer: { _id: 'vol-1', name: 'Test Volunteer' } as any,
        error: null,
      })
      vi.mocked(getOrganizerSpeakerIds).mockRejectedValue(new Error('boom'))

      const caller = createAnonymousCaller()
      const result = await caller.volunteer.create(validVolunteerInput)

      expect(result).toEqual({ success: true, volunteerId: 'vol-1' })
      expect(createNotifications).not.toHaveBeenCalled()
    })

    it('should throw on creation failure', async () => {
      vi.mocked(createVolunteer).mockResolvedValue({
        volunteer: null as any,
        error: new Error('DB error'),
      })

      const caller = createAnonymousCaller()
      await expect(
        caller.volunteer.create(validVolunteerInput),
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    })

    it('should reject invalid email', async () => {
      const caller = createAnonymousCaller()
      await expect(
        caller.volunteer.create({ ...validVolunteerInput, email: 'not-email' }),
      ).rejects.toThrow()
    })

    it('should reject missing required fields', async () => {
      const caller = createAnonymousCaller()
      await expect(
        caller.volunteer.create({ name: 'Test' } as any),
      ).rejects.toThrow()
    })
  })

  describe('list', () => {
    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()
      await expect(caller.volunteer.admin.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })

    it('should reject non-admin users', async () => {
      const regularUser = speakers.find((s) => !s.isOrganizer)!
      const caller = createAuthenticatedCaller(regularUser._id)
      await expect(caller.volunteer.admin.list()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })

  describe('getById', () => {
    it('should reject non-admin users', async () => {
      const regularUser = speakers.find((s) => !s.isOrganizer)!
      const caller = createAuthenticatedCaller(regularUser._id)
      await expect(
        caller.volunteer.admin.getById({ id: 'vol-1' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('should return NOT_FOUND for nonexistent volunteer', async () => {
      vi.mocked(getVolunteerById).mockResolvedValue({
        volunteer: null as any,
        error: null,
      })

      const caller = createAdminCaller()
      await expect(
        caller.volunteer.admin.getById({ id: 'nonexistent' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('should return volunteer for admin', async () => {
      vi.mocked(getVolunteerById).mockResolvedValue({
        volunteer: {
          _id: 'vol-1',
          name: 'Test',
          status: VolunteerStatus.PENDING,
        } as any,
        error: null,
      })

      const caller = createAdminCaller()
      const result = await caller.volunteer.admin.getById({ id: 'vol-1' })
      expect(result._id).toBe('vol-1')
    })
  })

  describe('sendEmail', () => {
    it('should reject sending email to non-approved volunteer', async () => {
      vi.mocked(getVolunteerById).mockResolvedValue({
        volunteer: {
          _id: 'vol-1',
          name: 'Test',
          status: VolunteerStatus.PENDING,
        } as any,
        error: null,
      })

      const caller = createAdminCaller()
      await expect(
        caller.volunteer.admin.sendEmail({
          volunteerId: 'vol-1',
          subject: 'Welcome',
          message: 'Congrats',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    /**
     * THE CREDENTIAL KEY FOLLOWS THE DOCUMENT, NOT THE REQUEST (#843).
     *
     * When the volunteer's own conference has no `contactEmail`, this procedure
     * rebuilds a conference object for the email, taking `_id`/`title` from the
     * VOLUNTEER's conference and the address fields from the CURRENT domain's.
     * `organization` is the field `resolveEmailSender` resolves the Resend
     * account from, so it must come from the volunteer's conference like the
     * identity fields — otherwise org A's volunteer mail goes out through org
     * B's Resend account whenever B's organizer processes A's volunteer.
     *
     * REACHABLE, not theoretical: `sendEmail` is the one volunteer procedure
     * with no `requireDocumentInCurrentConference` (its four siblings have it),
     * and `getVolunteerById` is a global by-id fetch with no conference or org
     * predicate. Production data makes it inexpressible today — every
     * conference has a `contactEmail`, all under one org — which is exactly the
     * "no live leak, fail-open shape anyway" standard #844 was justified on.
     *
     * WHY THIS CANNOT PASS FOR THE WRONG REASON: the two orgs are DISTINCT
     * values, and the test asserts the positive (`ORG_A`) rather than merely
     * "not B". A hardcoded `currentConf.organization` yields `TEST_ORG_ID` and
     * fails on the value, not on an absence — so a stub that silently returned
     * `undefined` would fail too rather than sneak through.
     */
    it("keys the sender on the VOLUNTEER's org, not the request domain's", async () => {
      const ORG_A = 'organization-other-tenant'

      vi.mocked(getVolunteerById).mockResolvedValue({
        volunteer: {
          _id: 'vol-1',
          name: 'Test',
          email: 'volunteer@other.example',
          status: VolunteerStatus.APPROVED,
          conference: {
            _id: 'conf-other',
            title: 'Another Tenant Conf',
            // Belongs to ORG A…
            organization: { _type: 'reference', _ref: ORG_A },
            // …and carries NO contactEmail, which is what sends this down the
            // rebuild branch under test.
          },
        } as any,
        error: null,
      })

      // The request is on the fixture organizer's own domain — a DIFFERENT org.
      const caller = createAdminCaller()
      await caller.volunteer.admin.sendEmail({
        volunteerId: 'vol-1',
        subject: 'Welcome',
        message: 'Congrats',
      })

      expect(sendVolunteerApprovalEmail).toHaveBeenCalledTimes(1)
      const conferenceArg = vi.mocked(sendVolunteerApprovalEmail).mock
        .calls[0][1] as { organization?: { _ref?: string } }

      // The control: the two orgs really are different, so the assertion below
      // is discriminating rather than trivially satisfied.
      expect(ORG_A).not.toBe(TEST_ORG_ID)
      expect(conferenceArg.organization?._ref).toBe(ORG_A)
    })
  })
})
