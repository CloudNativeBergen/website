import { CheckBadgeIcon, LinkIcon } from '@heroicons/react/24/outline'
import { GitHubIcon, LinkedInIcon } from '@/components/SocialIcons'

/**
 * Providers we support linking. `key` matches the prefix stored in
 * `speaker.providers[]` (e.g. `"github:<id>"`) and the NextAuth provider id.
 */
const SUPPORTED_PROVIDERS = [
  { key: 'github', name: 'GitHub', Icon: GitHubIcon },
  { key: 'linkedin', name: 'LinkedIn', Icon: LinkedInIcon },
] as const

export interface LinkedProvidersProps {
  /** Raw `speaker.providers[]` entries, e.g. `["github:123", "linkedin:456"]`. */
  providers?: string[]
  /** The provider the user is CURRENTLY signed in with (`session.account.provider`). */
  currentProvider?: string
  /**
   * Server Action that starts the "link another provider" OAuth round-trip. The
   * form submits a hidden `provider` field. When omitted (e.g. in Storybook) the
   * link buttons render disabled.
   */
  onLinkAction?: (formData: FormData) => void | Promise<void>
}

/**
 * Shows which OAuth providers are linked to the speaker, highlights the one the
 * user is currently signed in with, and offers a "Link" action for providers
 * that are not yet connected (identity Phase 2).
 */
export function LinkedProviders({
  providers,
  currentProvider,
  onLinkAction,
}: LinkedProvidersProps) {
  const linkedKeys = new Set(
    (providers ?? [])
      .map((entry) => entry.split(':')[0])
      .filter((key): key is string => Boolean(key)),
  )

  return (
    <section aria-labelledby="linked-providers-heading">
      <h3
        id="linked-providers-heading"
        className="text-sm/6 font-medium text-gray-900 dark:text-white"
      >
        Sign-in methods
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        These accounts can sign in to your speaker profile. Linking another
        provider lets you use it to reach the same profile.
      </p>

      <ul role="list" className="mt-3 space-y-3">
        {SUPPORTED_PROVIDERS.map(({ key, name, Icon }) => {
          const isLinked = linkedKeys.has(key)
          const isCurrent = currentProvider === key

          return (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Icon
                  className="h-6 w-6 shrink-0 text-gray-700 dark:text-gray-200"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {name}
                  </p>
                  {isLinked ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {isCurrent ? 'Linked · current sign-in' : 'Linked'}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Not linked
                    </p>
                  )}
                </div>
              </div>

              {isLinked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-fresh-green/10 px-2.5 py-1 text-xs font-medium text-brand-fresh-green dark:bg-green-900/30 dark:text-green-400">
                  <CheckBadgeIcon className="h-4 w-4" aria-hidden="true" />
                  Linked
                </span>
              ) : (
                <form action={onLinkAction}>
                  <input type="hidden" name="provider" value={key} />
                  <button
                    type="submit"
                    disabled={!onLinkAction}
                    aria-label={`Link your ${name} account`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-cloud-blue px-3 py-1.5 text-sm font-medium text-brand-cloud-blue transition-colors hover:bg-brand-cloud-blue/10 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-400/10"
                  >
                    <LinkIcon className="h-4 w-4" aria-hidden="true" />
                    Link {name}
                  </button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
