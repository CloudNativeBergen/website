import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import LinkedIn from 'next-auth/providers/linkedin'
import type { Account, NextAuthConfig, Profile, Session, User } from 'next-auth'
import { decode } from 'next-auth/jwt'
import { NextRequest } from 'next/server'
import { getOrCreateSpeaker } from '@/lib/speaker/sanity'
import { speakerImageUrl } from '@/lib/sanity/client'
import { AppEnvironment } from '@/lib/environment/config'
import type { Speaker } from '@/lib/speaker/types'
import type { JWT } from 'next-auth/jwt'

export interface NextAuthRequest extends NextRequest {
  auth: Session | null
}

/**
 * Write a resolved speaker (and the account just authenticated with) onto the
 * JWT. Shared by the normal login path and the Phase-2 link path so both mint an
 * identical token shape.
 */
function applySpeakerToToken(
  token: JWT,
  speaker: Speaker,
  account: Account,
): void {
  if (speaker.image && typeof speaker.image === 'string') {
    token.picture = speakerImageUrl(speaker.image, {
      width: 192,
      height: 192,
      fit: 'crop',
    })
  }

  token.account = account
  token.speaker = {
    _id: speaker._id,
    slug: speaker.slug,
    name: speaker.name,
    email: speaker.email,
    image: speaker.image,
    isOrganizer: speaker.isOrganizer,
    flags: speaker.flags,
  }
}

/**
 * Decode the browser's PRE-EXISTING NextAuth session token from the request
 * cookies.
 *
 * Why this is needed: on an OAuth sign-in, `@auth/core` builds a FRESH default
 * token from the just-authenticated provider and passes THAT to the `jwt`
 * callback — it does NOT hand us the session that was active before the flow
 * started. To bind a link-intent to its initiating session we therefore decode
 * the still-present session cookie ourselves (same secret/salt as `@auth/core`).
 * Handles the chunked cookie form (`<name>.0`, `.1`, …) that `@auth/core` uses
 * for large tokens. Returns `null` when there is no valid prior session.
 */
async function readPriorSessionToken(jar: {
  get(name: string): { value: string } | undefined
}): Promise<
  (JWT & { speaker?: Session['speaker']; account?: Session['account'] }) | null
> {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null

  // Prod uses the __Secure- prefix; dev uses the bare name. Salt === cookie name.
  const baseNames = ['__Secure-authjs.session-token', 'authjs.session-token']
  for (const base of baseNames) {
    let value = jar.get(base)?.value
    if (!value) {
      const chunks: string[] = []
      for (let i = 0; ; i++) {
        const chunk = jar.get(`${base}.${i}`)?.value
        if (!chunk) break
        chunks.push(chunk)
      }
      if (chunks.length) value = chunks.join('')
    }
    if (!value) continue

    try {
      const decoded = await decode({ token: value, secret, salt: base })
      if (decoded) {
        return decoded as JWT & {
          speaker?: Session['speaker']
          account?: Session['account']
        }
      }
    } catch {
      // Try the next candidate cookie name.
    }
  }
  return null
}

/**
 * NextAuth `events.signOut` handler. Clears any residual link-flow state on
 * sign-out so a pending link-intent cannot outlive the session that created it
 * (defence-in-depth alongside the single-use deletion in the jwt callback). The
 * signout route handler makes `cookies()` writable.
 *
 * Exported so it can be unit-tested; it is referenced from `config.events`
 * (used-in-file), so it is not an unused export.
 */
export async function signOutHandler(): Promise<void> {
  try {
    const { LINK_INTENT_COOKIE } = await import('@/lib/auth-link')
    const { cookies } = await import('next/headers')
    ;(await cookies()).delete(LINK_INTENT_COOKIE)
  } catch (err) {
    console.error('Failed to clear link-intent cookie on sign-out', err)
  }
}

type JwtCallbackParams = {
  token: JWT
  account?: Account | null
  profile?: Profile
  trigger?: 'signIn' | 'signUp' | 'update'
}

/**
 * The `jwt` callback body. Extracted (and exported) so the Phase-2 link
 * consumption — single-use deletion, initiating-session binding, and the
 * fall-through to a normal sign-in — is directly unit-testable. Referenced from
 * `config.callbacks.jwt` (used-in-file), so it is not an unused export.
 */
export async function jwtSignInCallback({
  token,
  account,
  profile,
  trigger,
}: JwtCallbackParams): Promise<JWT> {
  if (!trigger && !(token.account && token.speaker)) {
    console.error('Invalid auth token', token)
    return {}
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

    // --- Phase 2: self-service "link another provider" -------------------
    // If this sign-in carries a valid, integrity-protected link-intent cookie
    // (minted only for an already-authenticated speaker X, bound to this
    // provider AND to X's session), attach the just-authenticated account to
    // the EXISTING speaker X instead of creating/switching to another document.
    //
    // `@/lib/auth-link` is imported dynamically so its Node-only crypto does not
    // enter the edge middleware bundle that statically imports this file.
    const { LINK_INTENT_COOKIE, verifyLinkIntent, linkResultStore } =
      await import('@/lib/auth-link')
    const { cookies } = await import('next/headers')
    const jar = await cookies()
    const linkToken = jar.get(LINK_INTENT_COOKIE)?.value

    // SINGLE-USE: delete the cookie the moment it is observed — BEFORE any use —
    // so a lingering intent can never be consumed twice regardless of outcome
    // (success, already-linked-elsewhere, or a thrown error). The route-handler
    // context that wraps this callback makes `cookies()` writable. This is the
    // primary defence against replay of an abandoned intent by a later sign-in.
    if (linkToken) {
      jar.delete(LINK_INTENT_COOKIE)
    }

    const rawIntent = linkToken
      ? verifyLinkIntent(linkToken, account.provider)
      : null

    // BIND TO THE INITIATING SESSION: honour the intent only if the browser is
    // STILL authenticated as the speaker that started the link. `@auth/core`
    // gives us a fresh token here (not the prior session), so decode the
    // pre-existing session cookie ourselves and require it to match both the
    // target speaker and the initiating session's `sub`. If there is no active
    // session, or it belongs to a different user, we ignore the intent and fall
    // through to a normal sign-in.
    let intent: typeof rawIntent = null
    // The pre-existing session decoded once and reused below.
    const prior = rawIntent ? await readPriorSessionToken(jar) : null
    if (rawIntent) {
      if (
        prior?.speaker?._id === rawIntent.speakerId &&
        prior?.sub === rawIntent.initiatorSub
      ) {
        intent = rawIntent
      } else {
        console.warn(
          'Link intent ignored: initiating session mismatch (treating as normal sign-in)',
        )
      }
    }

    if (intent) {
      const { attachProviderToSpeaker, getSpeaker } =
        await import('@/lib/speaker/sanity')
      const resultStore = linkResultStore.getStore()

      const {
        speaker: linked,
        status,
        err: linkErr,
      } = await attachProviderToSpeaker(
        intent.speakerId,
        user,
        account,
        profile,
      )

      if (!linkErr && status === 'linked') {
        if (resultStore) resultStore.result = 'linked'
        applySpeakerToToken(token, linked, account)
        return token
      }

      if (status === 'already-linked-elsewhere') {
        // Pre-existing duplicate. Do NOT merge and do NOT switch the session to
        // the other speaker: keep the user signed in as X (their pre-link
        // identity) and surface a clear "already linked" message.
        if (resultStore) resultStore.result = 'already-linked'
        const { speaker: originX } = await getSpeaker(intent.speakerId)
        if (originX?._id) {
          // Preserve X's original account (do not adopt the account that belongs
          // to the other speaker). We validated the prior session is X above, so
          // its account is X's own.
          const priorAccount = (prior?.account as Account) ?? account
          applySpeakerToToken(token, originX, priorAccount)
          return token
        }
        // X's document could not be loaded (deleted/not found between mint and
        // consumption). FAIL CLOSED: never fall through to the normal login path,
        // which would adopt the conflicting speaker Z's identity. Restore the
        // validated prior session (X); if there is none, keep the fresh token but
        // do not run getOrCreateSpeaker.
        if (prior) {
          return prior
        }
        if (resultStore) resultStore.result = 'error'
        console.error(
          'Provider link already-linked-elsewhere but initiating speaker not found; keeping current session',
          { speakerId: intent.speakerId },
        )
        return token
      }

      // Unexpected link failure — surface it and fall through to the normal
      // login path so the user still ends up with a working session.
      if (resultStore) resultStore.result = 'error'
      console.error('Provider link failed; falling back to normal sign-in', {
        status,
        linkErr,
      })
    }
    // --- end Phase 2 link handling ---------------------------------------

    const { speaker, err } = await getOrCreateSpeaker(user, account, profile)
    if (err) {
      console.error('Error fetching or creating speaker profile', err)
      return {}
    }

    applySpeakerToToken(token, speaker, account)
  }

  return token
}

/**
 * The `session` callback body: project the JWT's speaker/account and a trimmed
 * user onto the client-visible session. Extracted (and exported) so the shape
 * the browser receives is directly unit-testable. Referenced from
 * `config.callbacks.session`.
 */
export async function sessionCallback({
  session,
  token,
}: {
  session: Session
  token: JWT
}): Promise<Session> {
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
}

/**
 * The `redirect` callback body. Extracted (and exported) so the security-
 * critical OPEN-REDIRECT guard (same-origin check on the parsed URL) and the
 * Phase-2 link-result param append are directly unit-testable. Referenced from
 * `config.callbacks.redirect`.
 */
export async function redirectCallback({
  url,
  baseUrl,
}: {
  url: string
  baseUrl: string
}): Promise<string> {
  // OPEN-REDIRECT GUARD: only ever return a URL on baseUrl's own origin.
  // Compare parsed ORIGINS — a bare `url.startsWith(baseUrl)` is unsafe because a
  // look-alike host such as `https://<base>.evil.com` is a string prefix of the
  // base and would slip through. Relative URLs resolve onto baseUrl; anything
  // else (off-site, protocol-relative `//evil`, unparseable) falls back to base.
  let target: string
  try {
    const resolved = new URL(url, baseUrl)
    target =
      resolved.origin === new URL(baseUrl).origin
        ? resolved.toString()
        : baseUrl
  } catch {
    target = baseUrl
  }

  // Phase 2: append the link outcome (set by the jwt callback in the same
  // request) so the profile page can show a success / already-linked banner.
  // `target` is guaranteed same-origin above, so the append is always safe.
  const { linkResultStore, LINK_RESULT_PARAM } = await import('@/lib/auth-link')
  const result = linkResultStore.getStore()?.result
  if (result) {
    try {
      const resolved = new URL(target, baseUrl)
      resolved.searchParams.set(LINK_RESULT_PARAM, result)
      target = resolved.toString()
    } catch {
      // Leave target unchanged on any URL parsing issue.
    }
  }

  return target
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

  events: {
    signOut: signOutHandler,
  },

  callbacks: {
    async session(params) {
      return sessionCallback(params)
    },

    async jwt(params) {
      return jwtSignInCallback(params)
    },
    async redirect(params) {
      return redirectCallback(params)
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
const CLI_JWT_SALT = 'authjs.session-token'

function extractBearerToken(headers?: Headers): string | null {
  const value = headers?.get('authorization')
  if (!value?.startsWith('Bearer ')) return null
  return value.slice(7)
}

export async function getSessionFromBearerToken(
  token: string,
): Promise<Session | null> {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null

  try {
    const decoded = await decode({ token, secret, salt: CLI_JWT_SALT })
    if (!decoded) return null

    if (decoded.exp && decoded.exp * 1000 < Date.now()) return null

    const speaker = decoded.speaker as Session['speaker']
    const account = decoded.account as Session['account']
    if (!decoded.sub || !speaker?._id || !account) return null

    return {
      expires: new Date((decoded.exp ?? 0) * 1000).toISOString(),
      user: {
        sub: decoded.sub,
        name: decoded.name as string,
        email: decoded.email as string,
        picture: decoded.picture as string,
      },
      speaker,
      account,
    }
  } catch {
    return null
  }
}

export async function getAuthSession(req?: {
  url?: string
  headers?: Headers
}): Promise<Session | null> {
  if (AppEnvironment.isTestMode) {
    return AppEnvironment.createMockAuthContext()
  }

  const session = await _auth()

  // If no cookie session, try Bearer token from Authorization header
  if (!session) {
    const bearerToken = extractBearerToken(req?.headers)
    if (bearerToken) return getSessionFromBearerToken(bearerToken)
    return null
  }

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
