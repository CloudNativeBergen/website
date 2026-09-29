import clsx from 'clsx'
import {
  BoltIcon,
  ExclamationTriangleIcon,
  HandRaisedIcon,
} from '@heroicons/react/24/outline'
import type { SocialConnection } from '@/lib/social/provider'
import type { SecretFamily } from '@/lib/secrets/types'
import { SOCIAL_PLATFORM_LABELS } from '@/lib/social/types'

/** The intermediary a platform publishes through, as organizers know it. */
const VIA_LABELS: Partial<Record<SecretFamily, string>> = { buffer: 'Buffer' }

/**
 * Whether each connectable platform publishes by itself or is posted by hand
 * for this organization (#1130, spec §4). Derived on the server from the
 * organization's secrets and shown as-is; it carries no secret, and there is
 * nothing here to change — connecting is done in the secret store.
 */
export function ChannelConnections({
  connections,
}: {
  connections: readonly SocialConnection[]
}) {
  return (
    <section
      aria-label="How posts are published"
      className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 dark:border-gray-700 dark:bg-gray-800/50"
    >
      {connections.map(({ platform, mode, via }) => {
        const automatic = mode === 'automatic'
        const Icon = automatic ? BoltIcon : HandRaisedIcon
        const viaLabel = via ? (VIA_LABELS[via] ?? via) : null
        return (
          <p
            key={platform}
            data-platform={platform}
            data-mode={mode}
            className="flex items-start gap-2"
          >
            <Icon
              aria-hidden
              className={clsx(
                'mt-0.5 size-4 shrink-0',
                automatic
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400',
              )}
            />
            <span className="min-w-0">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {SOCIAL_PLATFORM_LABELS[platform]}
              </span>{' '}
              <span className="text-gray-600 dark:text-gray-300">
                {automatic
                  ? `Automatic${viaLabel ? ` via ${viaLabel}` : ''}`
                  : 'Manual \u2014 posted by hand'}
              </span>
            </span>
          </p>
        )
      })}
      <p className="text-xs text-gray-500 sm:ml-auto dark:text-gray-400">
        Other platforms are posted by hand.
      </p>
    </section>
  )
}

/**
 * The connection lookup was REFUSED (the secret store could not tell whose
 * credentials to use). Saying "manual" here would be a claim about a
 * connection nobody looked up, so this says only that the status is unknown.
 */
export function ChannelConnectionsUnavailable() {
  return (
    <section
      aria-label="How posts are published"
      className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300"
    >
      <ExclamationTriangleIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <span>
        Connection status unavailable &mdash; we could not check which platforms
        publish automatically. Try reloading in a few minutes.
      </span>
    </section>
  )
}
