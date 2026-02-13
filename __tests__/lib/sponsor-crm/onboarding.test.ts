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

    it('should preserve UUID-format tokens', () => {
      const token = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      const url = buildOnboardingUrl('https://example.com', token)

      expect(url).toContain(token)
      expect(url).toBe(`https://example.com/sponsor/onboarding/${token}`)
    })

    it('should work with localhost URLs', () => {
      const url = buildOnboardingUrl('http://localhost:3000', 'test-token')

      expect(url).toBe('http://localhost:3000/sponsor/onboarding/test-token')
    })

    it('should include the full path structure', () => {
      const url = buildOnboardingUrl('https://site.com', 'tok')

      expect(url).toMatch(/\/sponsor\/onboarding\//)
    })
  })
})
