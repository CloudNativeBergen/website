import type { Mock } from 'vitest'

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      unset: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    })),
  },
  clientReadUncached: {
    fetch: vi.fn(),
  },
}))

import {
  buildPortalUrl,
  generateRegistrationToken,
} from '@/lib/sponsor-crm/registration'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'

describe('registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateRegistrationToken', () => {
    it('returns existing token when registration is complete', async () => {
      // @ts-ignore
      ; (clientReadUncached.fetch as any).mockResolvedValue({
        registrationToken: 'existing-token-abc',
        registrationComplete: true,
      })

      const result = await generateRegistrationToken('sfc-123')
      expect(result.token).toBe('existing-token-abc')
      expect(result.error).toBeUndefined()
    })

    it('returns error when registration is complete but no token exists', async () => {
      // @ts-ignore
      ; (clientReadUncached.fetch as any).mockResolvedValue({
        registrationToken: null,
        registrationComplete: true,
      })

      const result = await generateRegistrationToken('sfc-123')
      expect(result.error?.message).toMatch(/already complete/)
    })

    it('returns existing token when one is already set', async () => {
      // @ts-ignore
      ; (clientReadUncached.fetch as any).mockResolvedValue({
        registrationToken: 'existing-token-xyz',
        registrationComplete: false,
      })

      const result = await generateRegistrationToken('sfc-123')
      expect(result.token).toBe('existing-token-xyz')
      expect(result.error).toBeUndefined()
    })

    it('generates new token when none exists', async () => {
      // @ts-ignore
      ; (clientReadUncached.fetch as any).mockResolvedValue({
        registrationToken: null,
        registrationComplete: false,
      })

      const mockPatch = {
        set: vi.fn().mockReturnThis(),
        // @ts-ignore
        commit: vi.fn().mockResolvedValue({}),
      }
        ; (clientWrite.patch as Mock).mockReturnValue(mockPatch)

      const result = await generateRegistrationToken('sfc-123')
      expect(result.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
      expect(result.error).toBeUndefined()
      expect(clientWrite.patch).toHaveBeenCalledWith('sfc-123')
    })

    it('returns error when document not found', async () => {
      // @ts-ignore
      ; (clientReadUncached.fetch as any).mockResolvedValue(null)

      const result = await generateRegistrationToken('sfc-missing')
      expect(result.error?.message).toMatch(/not found/)
    })

    it('returns error for empty ID', async () => {
      const result = await generateRegistrationToken('')
      expect(result.error?.message).toMatch(/required/)
    })
  })

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
