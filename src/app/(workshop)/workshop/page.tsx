import { withAuth, getSignInUrl, getSignUpUrl } from '@workos-inc/authkit-nextjs'
import Link from 'next/link'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import WorkshopList from '@/components/workshop/WorkshopList'
import { Container } from '@/components/Container'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Button } from '@/components/Button'

export default async function WorkshopPage() {
  const { user } = await withAuth()

  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) {
    return (
      <div className="relative py-20 sm:pb-24 sm:pt-36">
        <BackgroundImage className="-bottom-14 -top-36" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 dark:text-blue-400 sm:text-7xl">
              Conference not found
            </h1>
          </div>
        </Container>
      </div>
    )
  }

  if (!user) {
    const signInUrl = await getSignInUrl({ returnPathname: '/workshop' })
    const signUpUrl = await getSignUpUrl({ returnPathname: '/workshop' })

    return (
      <div className="relative py-20 sm:pb-24 sm:pt-36">
        <BackgroundImage className="-bottom-14 -top-36" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 dark:text-blue-400 sm:text-7xl">
              Workshop Signup
            </h1>
            <div className="mt-6 space-y-6 font-display text-2xl tracking-tight text-blue-900 dark:text-blue-100">
              <p>
                Sign in to register for workshops at {conference.title}.
              </p>
            </div>

            <div className="mt-10 flex gap-4">
              <Button href={signInUrl}>
                Sign In
              </Button>
              <Button href={signUpUrl} variant="outline">
                Create Account
              </Button>
            </div>

            <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
              By signing in, you agree to our{' '}
              <Link href="/privacy" className="underline hover:text-blue-600 dark:hover:text-blue-400">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </Container>
      </div>
    )
  }

  return (
    <div className="relative py-20 sm:pb-24 sm:pt-36">
      <BackgroundImage className="-bottom-14 -top-36" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-5xl font-bold tracking-tighter text-blue-600 dark:text-blue-400 sm:text-7xl">
              Workshop Signup
            </h1>
            <Button href="/api/auth/signout" variant="outline">
              Sign Out
            </Button>
          </div>

          <div className="mt-6 space-y-6 font-display text-2xl tracking-tight text-blue-900 dark:text-blue-100">
            <p>Welcome, {user.firstName && user.lastName
              ? `${user.firstName} ${user.lastName}`
              : user.firstName || user.lastName || user.email
            }</p>
            <p>
              Register for workshops at {conference.title}.
            </p>
          </div>

          <div className="mt-12">
            <WorkshopList
              conferenceId={conference._id}
              userWorkOSId={user.id}
              userEmail={user.email}
              userName={user.firstName && user.lastName
                ? `${user.firstName} ${user.lastName}`
                : user.email
              }
            />
          </div>
        </div>
      </Container>
    </div>
  )
}