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

          {/* `prefetch={false}`: these are route handlers that start a sign-in
              (and set a cookie), not pages to warm up. */}
          <div className="mt-10 flex gap-4">
            <Button href={WORKSHOP_SIGN_IN_PATH} prefetch={false}>
              Sign In
            </Button>
            <Button
              href={WORKSHOP_SIGN_UP_PATH}
              prefetch={false}
              variant="outline"
            >
              Create Account
            </Button>
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
