import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import LinkedIn from 'next-auth/providers/linkedin'
import type { NextAuthConfig, Session, User } from 'next-auth'
import { NextRequest } from 'next/server'
import { getOrCreateSpeaker } from '@/lib/speaker/sanity'
import { sanityImage } from '@/lib/sanity/client'
import { AppEnvironment } from '@/lib/environment/config'

export interface NextAuthRequest extends NextRequest {
  auth: Session | null
}

const config = {
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
    LinkedIn({
      clientId: process.env.AUTH_LINKEDIN_ID,
      clientSecret: process.env.AUTH_LINKEDIN_SECRET,
    }),
  ],

  secret: process.env.AUTH_SECRET,

  session: {
    strategy: 'jwt',
  },

  pages: {
    signIn: '/signin',
  },

  callbacks: {
    async session({ session, token }) {
      const speaker = token.speaker
      const account = token.account

      return {
        ...session,
        user: {
          sub: token.sub,
          name: token.name,
          email: token.email,
          picture: token.picture,
        },
        speaker,
        account,
      } as Session
    },

    async jwt({ token, account, trigger }) {
      if (!trigger && !(token.account && token.speaker)) {
        console.error('Invalid auth token', token)
        return {}
      }

      // Migrate legacy snake_case JWT tokens from before migration 028.
      // Old tokens stored speaker.is_organizer; new code expects isOrganizer.
      // This block can be removed once all active sessions have expired.
      if (
        !trigger &&
        token.speaker &&
        typeof token.speaker === 'object' &&
        'is_organizer' in token.speaker &&
        !('isOrganizer' in token.speaker)
      ) {
        const sp = token.speaker as Record<string, unknown>
        sp.isOrganizer = sp.is_organizer
        delete sp.is_organizer
      }

      if (trigger === 'signIn') {
        if (!token || !token.email || !token.name) {
          console.error('Invalid auth token', token)
          return {}
        }

        if (!account || !account.provider || !account.providerAccountId) {
          console.error('Invalid auth account', account)
          return {}
        }

        const user: User = {
          email: token.email,
          name: token.name,
          image: token.picture,
        }
        const { speaker, err } = await getOrCreateSpeaker(user, account)
        if (err) {
          console.error('Error fetching or creating speaker profile', err)
          return {}
        }

        if (speaker.image) {
          if (typeof speaker.image === 'object') {
            token.picture = sanityImage(speaker.image)
              .width(192)
              .height(192)
              .fit('crop')
              .url()
          } else if (typeof speaker.image === 'string') {
            token.picture = speaker.image
          }
        }

        token.account = account
        token.speaker = {
          _id: speaker._id,
          name: speaker.name,
          email: speaker.email,
          image: speaker.image,
          isOrganizer: speaker.isOrganizer,
          flags: speaker.flags,
        }
      }

      return token
    },
    redirect({ url, baseUrl }) {
      return url.startsWith(baseUrl) ? url : baseUrl
    },
  },
} satisfies NextAuthConfig

type ProviderData = { id: string; name: string; type: string }
type ProviderWithFunction = () => ProviderData
type Provider = ProviderData | ProviderWithFunction

export const providerMap = config.providers.map((provider: Provider) => {
  if (typeof provider === 'function') {
    const providerData = provider()
    return {
      id: providerData.id,
      name: providerData.name,
      type: providerData.type,
    }
  } else {
    return { id: provider.id, name: provider.name, type: provider.type }
  }
})

export const { handlers, auth: _auth, signIn } = NextAuth(config)

export const auth = _auth as typeof _auth &
  (<HandlerResponse extends Response | Promise<Response>>(
    ...args: [
      (
        req: NextAuthRequest,
        context: { params: Record<string, string | string[] | undefined> },
      ) => HandlerResponse,
    ]
  ) => (
    req: NextRequest,
    context: { params: Record<string, string | string[] | undefined> },
  ) => HandlerResponse)

const SANITY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const MAX_IMPERSONATION_ID_LENGTH = 100

export async function getAuthSession(req?: {
  url?: string
}): Promise<Session | null> {
  if (AppEnvironment.isTestMode) {
    return AppEnvironment.createMockAuthContext()
  }

  const session = await _auth()

  // SECURITY: Impersonation is ONLY allowed in development mode
  // Explicitly check for production to prevent any bypass
  if (process.env.NODE_ENV === 'production') {
    return session
  }

  // Double-check we're in development
  if (!AppEnvironment.isDevelopment) {
    return session
  }

  // SECURITY: Only organizers can impersonate
  if (!session?.speaker?.isOrganizer) {
    return session
  }

  // No URL provided, no impersonation possible
  if (!req?.url) {
    return session
  }

  try {
    const url = new URL(req.url, 'http://localhost')
    const impersonateId = url.searchParams.get('impersonate')

    if (impersonateId) {
      if (!SANITY_ID_PATTERN.test(impersonateId)) {
        console.warn(
          `Invalid impersonation ID format: ${impersonateId.slice(0, 20)}`,
        )
        return session
      }

      if (impersonateId.length > MAX_IMPERSONATION_ID_LENGTH) {
        console.warn('Impersonation ID too long, rejecting')
        return session
      }

      const { getSpeaker } = await import('@/lib/speaker/sanity')
      const { speaker: impersonatedSpeaker } = await getSpeaker(impersonateId)

      if (impersonatedSpeaker && !impersonatedSpeaker.isOrganizer) {
        // SECURITY: Log impersonation for audit trail
        console.log(
          `[AUDIT] Admin ${session.speaker.email} (${session.speaker._id}) impersonating ${impersonatedSpeaker.email} (${impersonatedSpeaker._id})`,
        )

        return {
          ...session,
          speaker: impersonatedSpeaker,
          isImpersonating: true,
          realAdmin: session.speaker,
        }
      } else if (impersonatedSpeaker?.isOrganizer) {
        // SECURITY: Log attempted organizer impersonation
        console.error(
          `[SECURITY] Admin ${session.speaker.email} attempted to impersonate another organizer: ${impersonatedSpeaker.email}`,
        )
      }
    }
  } catch (error) {
    console.error('Error during impersonation:', error)
  }

  return session
}
