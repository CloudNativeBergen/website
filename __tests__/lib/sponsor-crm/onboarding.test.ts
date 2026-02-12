import { describe, it, expect } from '@jest/globals'
import { buildOnboardingUrl } from '@/lib/sponsor-crm/onboarding'

describe('onboarding', () => {
  describe('buildOnboardingUrl', () => {
    it('should build correct onboarding URL', () => {
      const baseUrl = 'https://cloudnativebergen.no'
      const token = 'abc-123-def-456'

      const url = buildOnboardingUrl(baseUrl, token)

      expect(url).toBe(
        'https://cloudnativebergen.no/sponsor/onboarding/abc-123-def-456',
      )
    })

    it('should handle base URL without trailing slash', () => {
      const url = buildOnboardingUrl('https://example.com', 'token-123')

      expect(url).toBe('https://example.com/sponsor/onboarding/token-123')
    })
  })
})
