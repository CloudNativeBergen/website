import Link from 'next/link'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'
import {
  WORKSHOP_SIGN_IN_PATH,
  WORKSHOP_SIGN_UP_PATH,
} from '@/lib/workshop/sign-in-paths'

/**
 * The workshop portal for a visitor with no session (#1296).
 *
 * Both buttons go to first-party routes on THIS host, whose handlers start the
 * WorkOS flow through the SDK (PKCE, and this host's own callback). The page
 * used to put a hand-assembled `api.workos.com` authorize URL in the markup.
 *
 * NOTE: the proxy redirects a signed-out visitor on `/workshop` straight to
 * WorkOS, so today this view only renders when a session reached the page but
 * was rejected there. Whether `/workshop` should show it instead of redirecting
 * is an open product decision (see the PR for #1296).
 */
export function WorkshopSignedOut({
  conferenceTitle,
}: {
  conferenceTitle: string
}) {
  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 sm:text-7xl dark:text-blue-400">
            Workshop Signup
          </h1>
          <div className="font-display mt-6 space-y-6 text-2xl tracking-tight text-blue-900 dark:text-blue-100">
            <p>Sign in to register for workshops at {conferenceTitle}.</p>
          </div>

          {/* FORMS, NOT LINKS. These targets are route handlers that set a
              cookie and redirect to another origin. `next/link` would fetch
              them as an RSC payload first — the handler runs, the cross-origin
              redirect fails — and only then navigate, so every click would
              start TWO sign-ins. A GET form is a plain browser navigation. */}
          <div className="mt-10 flex gap-4">
            <form action={WORKSHOP_SIGN_IN_PATH} method="get">
              <Button type="submit">Sign In</Button>
            </form>
            <form action={WORKSHOP_SIGN_UP_PATH} method="get">
              <Button type="submit" variant="outline">
                Create Account
              </Button>
            </form>
          </div>

          <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
            By signing in, you agree to our{' '}
            <Link
              href="/terms"
              className="underline hover:text-blue-600 dark:hover:text-blue-400"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              className="underline hover:text-blue-600 dark:hover:text-blue-400"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </Container>
    </div>
  )
}
