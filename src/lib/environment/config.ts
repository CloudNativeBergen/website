export class AppEnvironment {
  static readonly isDevelopment = process.env.NODE_ENV === 'development'

  static readonly isTestMode =
    AppEnvironment.isDevelopment &&
    process.env.NEXT_PUBLIC_ENABLE_TEST_MODE === 'true'

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

    if (AppEnvironment.isTestMode || options?.testMode) {
      url.searchParams.set('test', 'true')
    }

    return url.toString()
  }

  static isTestModeFromUrl(url: string | URL): boolean {
    const urlObj = typeof url === 'string' ? new URL(url) : url
    return (
      AppEnvironment.isDevelopment && urlObj.searchParams.get('test') === 'true'
    )
  }

  static createMockAuthContext() {
    if (!AppEnvironment.isTestMode) return null

    return {
      user: {
        email: AppEnvironment.testUser.email,
        name: AppEnvironment.testUser.name,
        sub: AppEnvironment.testUser.id,
        picture: AppEnvironment.testUser.picture,
      },
      speaker: {
        _id: AppEnvironment.testUser.speakerId,
        name: AppEnvironment.testUser.name,
        email: AppEnvironment.testUser.email,
        _type: 'speaker' as const,
        slug: { current: 'test-speaker' },
      },
      account: {
        provider: 'test',
        providerAccountId: 'test-account',
        type: 'oauth' as const,
        userId: AppEnvironment.testUser.id,
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  static getTestModeFromRequest(req: { url: string }): boolean {
    return AppEnvironment.isTestModeFromUrl(req.url)
  }

  static createMockAuthFromRequest(req: { url: string }) {
    return AppEnvironment.getTestModeFromRequest(req)
      ? AppEnvironment.createMockAuthContext()
      : null
  }
}
