'use server'

import { cookies } from 'next/headers'
import { auth, signIn } from '@/lib/auth'
import {
  LINK_INTENT_COOKIE,
  LINK_INTENT_TTL_SECONDS,
  isLinkableProvider,
  signLinkIntent,
} from '@/lib/auth-link'

/**
 * Server Action that begins the self-service "link another provider" flow.
 *
 * SECURITY: this is the only place a link-intent token is minted, and it does so
 * ONLY after resolving the caller's active session — the token is bound to the
 * signed-in speaker's `_id`. A visitor who is not authenticated cannot obtain a
 * token (they are bounced to sign-in). Because the resulting cookie is httpOnly,
 * HMAC-signed and short-lived, it cannot be forged or replayed to attach a
 * provider to a different account (see `@/lib/auth-link`).
 *
 * After the cookie is set we hand off to NextAuth `signIn` for the second
 * provider; proving control of that provider account is the link's ownership
 * proof, verified on the callback by the `jwt` callback in `@/lib/auth`.
 */
export async function startProviderLink(formData: FormData): Promise<void> {
  const provider = String(formData.get('provider') ?? '')
  if (!isLinkableProvider(provider)) {
    throw new Error('Unsupported provider for linking')
  }

  const session = await auth()
  if (!session?.speaker?._id) {
    // Not signed in — cannot link. Send them through the normal sign-in flow.
    await signIn(provider, { redirectTo: '/cfp/profile' })
    return
  }

  const token = signLinkIntent({
    speakerId: session.speaker._id,
    provider,
  })

  const jar = await cookies()
  jar.set(LINK_INTENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: LINK_INTENT_TTL_SECONDS,
  })

  // Kick off the second-provider OAuth round-trip. On return, the `jwt` callback
  // detects the link-intent cookie and attaches the provider to this speaker.
  await signIn(provider, { redirectTo: '/cfp/profile' })
}
