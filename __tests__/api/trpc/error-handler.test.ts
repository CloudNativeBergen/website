vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

import { isClientError } from '@/server/trpc'

describe('tRPC error handler', () => {
  describe('isClientError', () => {
    it.each([
      'NOT_FOUND',
      'BAD_REQUEST',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'PARSE_ERROR',
    ])('should classify %s as a client error', (code) => {
      expect(isClientError(code)).toBe(true)
    })

    it.each(['INTERNAL_SERVER_ERROR', 'TIMEOUT', 'TOO_MANY_REQUESTS'])(
      'should not classify %s as a client error',
      (code) => {
        expect(isClientError(code)).toBe(false)
      },
    )
  })
})
