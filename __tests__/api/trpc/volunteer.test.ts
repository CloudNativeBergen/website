vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/events/registry', () => ({}))

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
} from '../../helpers/trpc'
import { createVolunteer, getVolunteerById } from '@/lib/volunteer/sanity'
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
  })
})
