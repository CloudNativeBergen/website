vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/events/registry', () => ({}))

import { describe, it, expect, vi } from 'vitest'
import { TRPCError } from '@trpc/server'
import {
  createAnonymousCaller,
  createAuthenticatedCaller,
  createAdminCaller,
  speakers,
} from '../../helpers/trpc'

describe('tRPC middleware', () => {
  describe('protectedProcedure', () => {
    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()

      await expect(caller.proposal.list()).rejects.toThrow(TRPCError)
      await expect(caller.proposal.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })

    it('should allow authenticated requests', async () => {
      // This will fail because of missing mock data, but it should NOT throw UNAUTHORIZED
      const caller = createAuthenticatedCaller()
      try {
        await caller.proposal.list()
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).not.toBe('UNAUTHORIZED')
      }
    })
  })

  describe('adminProcedure', () => {
    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()

      await expect(caller.speaker.admin.list()).rejects.toThrow(TRPCError)
      await expect(caller.speaker.admin.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })

    it('should reject non-admin users', async () => {
      const regularUser = speakers.find((s) => !s.isOrganizer)!
      const caller = createAuthenticatedCaller(regularUser._id)

      await expect(caller.speaker.admin.list()).rejects.toThrow(TRPCError)
      await expect(caller.speaker.admin.list()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('should allow admin users', async () => {
      const caller = createAdminCaller()
      // Should not throw UNAUTHORIZED or FORBIDDEN — may throw due to missing mock data
      try {
        await caller.speaker.admin.list()
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).not.toBe('UNAUTHORIZED')
        expect((error as TRPCError).code).not.toBe('FORBIDDEN')
      }
    })
  })
})
