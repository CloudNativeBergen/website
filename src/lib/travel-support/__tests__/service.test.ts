import { describe, it, expect } from '@jest/globals'
import { TravelSupportService } from '../service'

describe('TravelSupportService', () => {
  describe('canUserApprove', () => {
    it('should allow admin to approve other users requests', () => {
      const result = TravelSupportService.canUserApprove(
        true, // isAdmin
        'speaker-123', // requestOwnerId
        'admin-456', // approverUserId
      )
      expect(result).toBe(true)
    })

    it('should prevent admin from approving their own request', () => {
      const result = TravelSupportService.canUserApprove(
        true, // isAdmin
        'admin-123', // requestOwnerId
        'admin-123', // approverUserId (same as owner)
      )
      expect(result).toBe(false)
    })

    it('should prevent non-admin from approving any request', () => {
      const result = TravelSupportService.canUserApprove(
        false, // isAdmin
        'speaker-123', // requestOwnerId
        'user-456', // approverUserId
      )
      expect(result).toBe(false)
    })

    it('should prevent non-admin from approving their own request', () => {
      const result = TravelSupportService.canUserApprove(
        false, // isAdmin
        'user-123', // requestOwnerId
        'user-123', // approverUserId (same as owner)
      )
      expect(result).toBe(false)
    })
  })
})
