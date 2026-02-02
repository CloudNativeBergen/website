import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { signIn, providerMap } from '@/lib/auth'
import { GitHubIcon, LinkedInIcon } from '@/components/SocialIcons'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'

const SIGNIN_ERROR_URL = '/error'

export default async function Signin(props: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const searchParams = await props.searchParams
  const error = searchParams.error

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
            <div className="text-center">
              <h1 className="font-display text-5xl font-bold tracking-tighter text-brand-cloud-blue sm:text-7xl dark:text-blue-400">
                Sign In
              </h1>
              <p className="mt-4 text-lg text-brand-slate-gray dark:text-gray-300">
                Choose your preferred sign-in method
              </p>
            </div>

            {error && (
              <div className="mt-8 rounded-2xl bg-red-50 p-4 dark:bg-red-900/20">
                <p className="text-sm text-red-800 dark:text-red-300">
                  Authentication error. Please try again.
                </p>
              </div>
            )}

            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Object.values(providerMap).map((provider) => (
                <form
                  key={provider.id}
                  action={async () => {
                    'use server'
                    try {
                      await signIn(provider.id, {
                        redirectTo: searchParams.callbackUrl ?? '/',
                      })
                    } catch (error) {
                      if (error instanceof AuthError) {
                        return redirect(
                          `${SIGNIN_ERROR_URL}?error=${error.type}`,
                        )
                      }
                      throw error
                    }
                  }}
                >
                  <button
                    type="submit"
                    className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl bg-brand-cloud-blue px-6 py-4 text-lg font-semibold text-white transition-all duration-200 hover:bg-brand-cloud-blue-hover focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {provider.id === 'github' && (
                      <GitHubIcon className="mr-2 h-5 w-5" />
                    )}
                    {provider.id === 'linkedin' && (
                      <LinkedInIcon className="mr-2 h-5 w-5" />
                    )}
                    <span>Sign in with {provider.name}</span>
                  </button>
                </form>
              ))}
            </div>

            <div className="mt-10 rounded-2xl bg-brand-glacier-white p-6 dark:bg-gray-800">
              <p className="text-sm leading-relaxed text-brand-slate-gray dark:text-gray-300">
                By signing in, you agree to our processing of your personal data
                as described in our{' '}
                <a
                  href="/privacy"
                  className="font-semibold text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Privacy Policy
                </a>
                . We will collect your profile information from the selected
                provider to create and manage your account.
              </p>
            </div>
          </div>
        </Container>
      </div>
    </>
  )
}
