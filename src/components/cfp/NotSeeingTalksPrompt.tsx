import Link from 'next/link'
import {
  EnvelopeIcon,
  KeyIcon,
  LifebuoyIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import { LinkedProviders } from './LinkedProviders'

/** Provider keys we offer to link (must match `LinkedProviders`). */
const SUPPORTED_PROVIDER_KEYS = ['github', 'linkedin'] as const

/** True when at least one supported provider is NOT yet linked (so the
 * "link your other account" step is actually actionable). */
function hasUnlinkedProvider(providers?: string[]): boolean {
  const linked = new Set((providers ?? []).map((entry) => entry.split(':')[0]))
  return SUPPORTED_PROVIDER_KEYS.some((key) => !linked.has(key))
}

export interface NotSeeingTalksPromptProps {
  /**
   * Whether the speaker currently has any proposals. Drives the two-step
   * progressive disclosure: `false` renders a prominent guidance card, `true`
   * renders only a subtle, collapsible "Missing a talk?" affordance so the
   * normal case stays uncluttered.
   */
  hasProposals: boolean
  /** Raw `speaker.providers[]` entries, e.g. `["github:123"]`. */
  providers?: string[]
  /** Provider the speaker is currently signed in with (`session.account.provider`). */
  currentProvider?: string
  /**
   * Organizer/CFP contact email for the "contact the organizers" fallback. When
   * omitted, the fallback points at the profile page's sign-in methods instead.
   */
  contactEmail?: string
  /**
   * Server Action that starts the "link another provider" flow (typically
   * `startProviderLink`). Passed straight through to {@link LinkedProviders};
   * when omitted the link buttons render disabled (e.g. in Storybook).
   */
  onLinkAction?: (formData: FormData) => void | Promise<void>
}

const CONTACT_SUBJECT = 'Not seeing my talks — please merge my speaker accounts'

/**
 * The shared two-step guidance body reused by both the prominent card and the
 * subtle affordance.
 *
 * - Step 1: link the speaker's other OAuth provider (reusing
 *   {@link LinkedProviders}) so a duplicate account's talks come together.
 * - Step 2: contact the organizers to merge accounts as the fallback.
 */
function Guidance({
  providers,
  currentProvider,
  contactEmail,
  onLinkAction,
}: Omit<NotSeeingTalksPromptProps, 'hasProposals'>) {
  // Only offer the "link your other account" step when a supported provider is
  // still unlinked — otherwise the copy ("link your other account below") is
  // non-actionable and every row already reads "Linked".
  const canLink = hasUnlinkedProvider(providers)

  return (
    <div className="space-y-6">
      {canLink && (
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            You may have submitted them while signed in with a different
            account. If you used <strong>GitHub</strong> one time and{' '}
            <strong>LinkedIn</strong> another, link your other account below to
            bring your talks together.
          </p>
          <div className="mt-4">
            <LinkedProviders
              providers={providers}
              currentProvider={currentProvider}
              onLinkAction={onLinkAction}
            />
          </div>
        </div>
      )}

      <div
        className={
          canLink ? 'border-t border-gray-200 pt-4 dark:border-gray-700' : ''
        }
      >
        <h4 className="text-sm/6 font-medium text-gray-900 dark:text-white">
          Still not seeing your talks?
        </h4>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Contact the organizers and we&apos;ll merge your accounts for you
          &mdash; {contactEmail ? 'by email or ' : ''}
          <Link
            href="/cfp/messages"
            className="font-medium text-brand-cloud-blue hover:underline dark:text-blue-400"
          >
            message us directly
          </Link>
          .
        </p>
        {contactEmail ? (
          <a
            href={`mailto:${contactEmail}?subject=${encodeURIComponent(
              CONTACT_SUBJECT,
            )}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/50"
          >
            <EnvelopeIcon className="h-4 w-4" aria-hidden="true" />
            Contact the organizers
          </a>
        ) : (
          <Link
            href="/cfp/profile#linked-providers-heading"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/50"
          >
            <KeyIcon className="h-4 w-4" aria-hidden="true" />
            Manage sign-in methods
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * In-product guidance for the most common duplicate-account symptom: a speaker
 * signs in (e.g. with LinkedIn) and sees an empty or incomplete proposal list
 * because their talks live on a different speaker document from another
 * provider/email.
 *
 * Rendered on the authenticated speaker dashboard only. When the speaker has no
 * proposals it shows a prominent, friendly card; when they already have
 * proposals it shows an unobtrusive, collapsible "Missing a talk?" link so the
 * normal case is not cluttered. Both surfaces share the same {@link Guidance}.
 */
export function NotSeeingTalksPrompt({
  hasProposals,
  providers,
  currentProvider,
  contactEmail,
  onLinkAction,
}: NotSeeingTalksPromptProps) {
  if (hasProposals) {
    return (
      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-sm text-gray-500 transition-colors hover:text-brand-cloud-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:text-gray-400 dark:hover:text-blue-400 [&::-webkit-details-marker]:hidden">
          <QuestionMarkCircleIcon className="h-4 w-4" aria-hidden="true" />
          Missing a talk?
        </summary>
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <Guidance
            providers={providers}
            currentProvider={currentProvider}
            contactEmail={contactEmail}
            onLinkAction={onLinkAction}
          />
        </div>
      </details>
    )
  }

  return (
    <section
      aria-labelledby="not-seeing-talks-heading"
      className="rounded-lg border border-brand-cloud-blue/30 bg-brand-cloud-blue/5 p-6 dark:border-blue-400/30 dark:bg-blue-400/10"
    >
      <div className="flex items-start gap-3">
        <LifebuoyIcon
          className="h-6 w-6 shrink-0 text-brand-cloud-blue dark:text-blue-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3
            id="not-seeing-talks-heading"
            className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white"
          >
            Not seeing your talks?
          </h3>
          <div className="mt-3">
            <Guidance
              providers={providers}
              currentProvider={currentProvider}
              contactEmail={contactEmail}
              onLinkAction={onLinkAction}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
