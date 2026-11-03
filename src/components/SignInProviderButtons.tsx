import { GitHubIcon, LinkedInIcon } from '@/components/SocialIcons'

const BUTTON =
  'inline-flex w-full cursor-pointer items-center justify-center rounded-2xl bg-brand-cloud-blue px-6 py-4 text-lg font-semibold text-white transition-all duration-200 hover:bg-brand-cloud-blue-hover focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'

/**
 * OAuth sign-in buttons. `handoff` (decided server-side from
 * KONF_IDENTITY_TENANTS) sends the browser to the first-party identity
 * handoff; otherwise each button posts `signInAction` (NextAuth).
 */
export function SignInProviderButtons({
  providers,
  handoff,
  signInAction,
}: {
  providers: { id: string; name: string }[]
  handoff: boolean
  signInAction: (providerId: string) => Promise<void>
}) {
  return (
    <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {providers.map((provider) => {
        const label = (
          <>
            {provider.id === 'github' && (
              <GitHubIcon className="mr-2 h-5 w-5" />
            )}
            {provider.id === 'linkedin' && (
              <LinkedInIcon className="mr-2 h-5 w-5" />
            )}
            <span>Sign in with {provider.name}</span>
          </>
        )
        return handoff ? (
          <a
            key={provider.id}
            href={`/api/auth/handoff?provider=${encodeURIComponent(provider.id)}`}
            className={BUTTON}
          >
            {label}
          </a>
        ) : (
          <form key={provider.id} action={signInAction.bind(null, provider.id)}>
            <button type="submit" className={BUTTON}>
              {label}
            </button>
          </form>
        )
      })}
    </div>
  )
}
