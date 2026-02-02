import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { ExclamationCircleIcon } from '@heroicons/react/24/outline'

const errorMessages: Record<string, string> = {
  Configuration: 'There is a problem with the server configuration.',
  AccessDenied: 'You do not have permission to sign in.',
  Verification:
    'The verification link is invalid or has already been used. Please try again.',
  OAuthSignin: 'Error starting OAuth sign in. Please try again.',
  OAuthCallback: 'Error during OAuth callback. Please try again.',
  OAuthCreateAccount: 'Could not create OAuth provider account.',
  EmailCreateAccount: 'Could not create email provider account.',
  Callback: 'Error during callback. Please try again.',
  OAuthAccountNotLinked:
    'This email is already associated with another provider. Please sign in with your original provider.',
  EmailSignin: 'Error sending email. Please try again.',
  CredentialsSignin: 'Invalid credentials. Please check and try again.',
  SessionRequired: 'Please sign in to access this page.',
  Default: 'Unable to sign in. Please try again.',
}

export default async function ErrorPage(props: {
  searchParams: Promise<{ error?: string }>
}) {
  const searchParams = await props.searchParams
  const error = searchParams.error ?? 'Default'
  const errorMessage = errorMessages[error] ?? errorMessages.Default

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl text-center lg:max-w-4xl lg:px-12">
            <div className="mb-8 flex justify-center">
              <ExclamationCircleIcon className="h-16 w-16 text-brand-sunbeam-yellow" />
            </div>
            <h1 className="font-display text-5xl font-bold tracking-tighter text-brand-cloud-blue sm:text-7xl dark:text-blue-400">
              Authentication Error
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-brand-slate-gray dark:text-gray-300">
              {errorMessage}
            </p>

            <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button href="/signin" variant="primary">
                Try Again
              </Button>
              <Button href="/" variant="outline">
                Go to Home
              </Button>
            </div>

            <div className="mt-12 rounded-2xl bg-brand-glacier-white p-6 dark:bg-gray-800">
              <p className="text-sm text-brand-slate-gray dark:text-gray-400">
                If you continue to experience issues, please contact support or
                try a different sign-in method.
              </p>
            </div>
          </div>
        </Container>
      </div>
    </>
  )
}
