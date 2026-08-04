import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { auth } from '@/lib/auth'
import { EMAIL_LINK_PENDING_COOKIE } from '@/lib/auth/email-link/intent'
import { requestHost } from '@/lib/auth/email-link/origin'
import { peekEmailSignInToken } from '@/lib/auth/email-link/verify'
import { confirmEmailSignInAction } from '../actions'
import { maskAddress, readPendingEmailSignIn } from './pending'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * THE CONFIRMATION INTERSTITIAL — the login-CSRF control for magic links.
 *
 * Reached whenever a sign-in link is opened in a browser that did not request
 * it: the ordinary cross-device case (asked on a phone, opened on a laptop) and
 * the attack case (an attacker's own link, navigated to by a victim). The two
 * are indistinguishable to the server, so both get the same explicit choice.
 *
 * NOTHING IS MINTED BY RENDERING THIS PAGE. The token is only PEEKED
 * (`peekEmailSignInToken` — pure for the stateless tier, a read for the stored
 * one), so merely navigating a victim here cannot burn their single-use link.
 * The session is minted exclusively by {@link confirmEmailSignInAction}, a
 * server action, i.e. a POST that Next refuses cross-origin.
 *
 * WHAT THE USER MUST BE ABLE TO SEE: that continuing signs them in as a
 * DIFFERENT person than they currently are. Hence the masked address of the
 * link and, when a session already exists, the identity it would replace.
 */
export default async function ConfirmEmailSignIn() {
  const jar = await cookies()
  const pending = readPendingEmailSignIn(
    jar.get(EMAIL_LINK_PENDING_COOKIE)?.value,
  )
  if (!pending) redirect('/signin?error=EmailSignIn')

  const headerList = await headers()
  const peeked = await peekEmailSignInToken(
    pending.token,
    requestHost(headerList),
  )
  if (!peeked.ok) redirect('/signin?error=EmailSignIn')

  const session = await auth()
  const current = session?.speaker?.email ?? null

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center lg:px-12">
          <h1 className="font-display text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
            Confirm sign-in
          </h1>
          <p className="mt-6 text-lg text-brand-slate-gray dark:text-gray-300">
            You opened a sign-in link for{' '}
            <strong className="font-semibold">
              {maskAddress(peeked.identifier)}
            </strong>{' '}
            in a browser that did not request it.
          </p>

          {current && (
            <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-left dark:bg-amber-900/20">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                You are currently signed in as{' '}
                <strong className="font-semibold">
                  {maskAddress(current)}
                </strong>
                . Continuing will replace that session. If you did not ask for
                this link, close this page instead.
              </p>
            </div>
          )}

          <form action={confirmEmailSignInAction} className="mt-8">
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-brand-cloud-blue px-6 py-4 text-lg font-semibold text-white transition-all duration-200 hover:bg-brand-cloud-blue-hover focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue active:scale-[0.98]"
            >
              Continue signing in
            </button>
          </form>

          <p className="mt-4 text-base text-brand-slate-gray dark:text-gray-400">
            Did not expect this?{' '}
            <Link
              href="/"
              className="font-semibold text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover dark:text-blue-400"
            >
              Leave without signing in
            </Link>
            .
          </p>
        </div>
      </Container>
    </div>
  )
}
