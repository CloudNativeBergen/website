export class AppEnvironment {
  static readonly isDevelopment = process.env.NODE_ENV === 'development'

  static readonly isTestMode =
    this.isDevelopment && process.env.NEXT_PUBLIC_ENABLE_TEST_MODE === 'true'

  static readonly testUser = {
    id: 'test-user-id',
    email: 'test@cloudnativebergen.io',
    name: 'Test Speaker',
    speakerId: 'test-speaker-id',
    picture: '/images/default-avatar.png',
  } as const

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

  static isTestModeFromUrl(url: string | URL): boolean {
    const urlObj = typeof url === 'string' ? new URL(url) : url
    return this.isDevelopment && urlObj.searchParams.get('test') === 'true'
  }

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

  static getTestModeFromRequest(req: { url: string }): boolean {
    return this.isTestModeFromUrl(req.url)
  }

  static createMockAuthFromRequest(req: { url: string }) {
    return this.getTestModeFromRequest(req)
      ? this.createMockAuthContext()
      : null
  }
}
