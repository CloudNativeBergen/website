import { TravelSupportService } from '../service'

describe('TravelSupportService', () => {
  describe('canUserApprove', () => {
    it('should allow admin to approve other users requests', () => {
      const result = TravelSupportService.canUserApprove(
        true,
        'speaker-123',
        'admin-456',
      )
      expect(result).toBe(true)
    })

    it('should prevent admin from approving their own request', () => {
      const result = TravelSupportService.canUserApprove(
        true,
        'admin-123',
        'admin-123',
      )
      expect(result).toBe(false)
    })

    it('should prevent non-admin from approving any request', () => {
      const result = TravelSupportService.canUserApprove(
        false,
        'speaker-123',
        'user-456',
      )
      expect(result).toBe(false)
    })

    it('should prevent non-admin from approving their own request', () => {
      const result = TravelSupportService.canUserApprove(
        false,
        'user-123',
        'user-123',
      )
      expect(result).toBe(false)
    })
  })
})
