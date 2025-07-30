/**
 * Centralized environment configuration for the application.
 * Handles test mode detection and mock data management.
 */

export class AppEnvironment {
  /**
   * Whether the app is running in development mode
   */
  static readonly isDevelopment = process.env.NODE_ENV === 'development'

  /**
   * Whether test mode is enabled (development + environment variable)
   */
  static readonly isTestMode =
    this.isDevelopment && process.env.NEXT_PUBLIC_ENABLE_TEST_MODE === 'true'

  /**
   * Consistent test user data used across the application
   */
  static readonly testUser = {
    id: 'test-user-id',
    email: 'test@cloudnativebergen.io',
    name: 'Test Speaker',
    speakerId: 'test-speaker-id',
    picture: '/images/default-avatar.png',
  } as const

  /**
   * Build API URL with optional test mode parameter
   */
  static buildApiUrl(
    endpoint: string,
    options?: { testMode?: boolean },
  ): string {
    const url = new URL(
      endpoint,
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000',
    )

    if (this.isTestMode || options?.testMode) {
      url.searchParams.set('test', 'true')
    }

    return url.toString()
  }

  /**
   * Check if test mode is active from URL search params
   */
  static isTestModeFromUrl(url: string | URL): boolean {
    const urlObj = typeof url === 'string' ? new URL(url) : url
    return this.isDevelopment && urlObj.searchParams.get('test') === 'true'
  }

  /**
   * Create mock authentication context for test mode
   */
  static createMockAuthContext() {
    if (!this.isTestMode) return null

    return {
      user: {
        email: this.testUser.email,
        name: this.testUser.name,
        sub: this.testUser.id,
        picture: this.testUser.picture,
      },
      speaker: {
        _id: this.testUser.speakerId,
        name: this.testUser.name,
        email: this.testUser.email,
        _type: 'speaker' as const,
        slug: { current: 'test-speaker' },
      },
      account: {
        provider: 'test',
        providerAccountId: 'test-account',
        type: 'oauth' as const,
        userId: this.testUser.id,
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  /**
   * Get test mode status from request URL
   */
  static getTestModeFromRequest(req: { url: string }): boolean {
    return this.isTestModeFromUrl(req.url)
  }

  /**
   * Create mock auth context from request if in test mode
   */
  static createMockAuthFromRequest(req: { url: string }) {
    return this.getTestModeFromRequest(req)
      ? this.createMockAuthContext()
      : null
  }
}
