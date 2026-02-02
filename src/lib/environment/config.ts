import type { Session } from 'next-auth'
import { Flags } from '../speaker/types'

export class AppEnvironment {
  static readonly isDevelopment = process.env.NODE_ENV === 'development'
  static readonly isProduction = process.env.NODE_ENV === 'production'

  static readonly isTestMode =
    AppEnvironment.isDevelopment &&
    process.env.NEXT_PUBLIC_ENABLE_TEST_MODE === 'true'

  static readonly testUser = {
    id: 'test-user-id',
    email: 'test@cloudnativedays.no',
    name: 'Test User',
    speakerId: 'test-speaker-id',
    picture: 'https://placehold.co/192x192/4f46e5/fff/png?text=TS',
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

  static createMockAuthContext(): Session {
    if (!AppEnvironment.isTestMode) {
      throw new Error('createMockAuthContext can only be used in test mode.')
    }

    return {
      user: {
        name: 'Test User',
        email: 'test@cloudnativedays.no',
        picture: 'https://placehold.co/64x64/d1fae5/374151?text=TU',
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      speaker: {
        _id: 'test-speaker-id',
        _rev: 'test-rev',
        _createdAt: new Date().toISOString(),
        _updatedAt: new Date().toISOString(),
        name: 'Test User',
        slug: 'test-user',
        email: 'test@cloudnativedays.no',
        is_organizer: true,
        flags: [Flags.requiresTravelFunding],
      },
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
