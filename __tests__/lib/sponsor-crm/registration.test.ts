import { describe, it, expect } from '@jest/globals'
import { buildPortalUrl } from '@/lib/sponsor-crm/registration'

describe('registration', () => {
  describe('buildPortalUrl', () => {
    it('should build correct portal URL', () => {
      const baseUrl = 'https://cloudnativebergen.no'
      const token = 'abc-123-def-456'

      const url = buildPortalUrl(baseUrl, token)

      expect(url).toBe(
        'https://cloudnativebergen.no/sponsor/portal/abc-123-def-456',
      )
    })

    it('should handle base URL without trailing slash', () => {
      const url = buildPortalUrl('https://example.com', 'token-123')

      expect(url).toBe('https://example.com/sponsor/portal/token-123')
    })

    it('should preserve UUID-format tokens', () => {
      const token = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      const url = buildPortalUrl('https://example.com', token)

      expect(url).toContain(token)
      expect(url).toBe(`https://example.com/sponsor/portal/${token}`)
    })

    it('should work with localhost URLs', () => {
      const url = buildPortalUrl('http://localhost:3000', 'test-token')

      expect(url).toBe('http://localhost:3000/sponsor/portal/test-token')
    })

    it('should include the full path structure', () => {
      const url = buildPortalUrl('https://site.com', 'tok')

      expect(url).toMatch(/\/sponsor\/portal\//)
    })
  })
})
