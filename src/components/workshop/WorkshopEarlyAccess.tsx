import { ClockIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { formatRegistrationInstant } from '@/lib/time'

/**
 * Early access on the workshop portal (#1346, spec §7), for a person whose
 * browser opened a sponsor's live link. `sponsorName` is the sponsor of that
 * person's own link: the only thing about a link the browser is ever sent.
 *
 * IT TAKES THE PLACE of the banner that names the official opening: the page
 * shows one or the other, never both.
 *
 *  - `opensAt` set: the sponsor start time is still ahead.
 *  - `opensAt` unset: inside the early-access window, sign-up is open for them.
 */
export function WorkshopEarlyAccessBanner({
  sponsorName,
  opensAt,
}: {
  sponsorName: string | null
  opensAt?: string
}) {
  const sponsor = sponsorName || 'a sponsor'
  if (opensAt) {
    return (
      <div className="mt-8 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
        <div className="flex">
          <ClockIcon
            aria-hidden="true"
            className="size-5 shrink-0 text-blue-500 dark:text-blue-300"
          />
          {/* A sponsor's name can be one long word: it wraps, it does not
              push the page wide. */}
          <div className="ml-3 min-w-0 break-words">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Early access through {sponsor} opens{' '}
              {formatRegistrationInstant(opensAt)}
            </h3>
            <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
              You can sign up for workshops from then, before registration opens
              for everyone.
            </p>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-8 flex rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
      <SparklesIcon
        aria-hidden="true"
        className="size-5 shrink-0 text-green-500 dark:text-green-300"
      />
      <p
        role="status"
        className="ml-3 min-w-0 text-sm font-medium break-words text-green-800 dark:text-green-200"
      >
        You have early access through {sponsor}
      </p>
    </div>
  )
}

/**
 * The notice for a person who just opened an early-access link that is not
 * live (spec §5): the same whether the link was revoked, never existed or is
 * another conference's.
 */
export function WorkshopEarlyAccessInvalidNotice() {
  return (
    <p
      role="status"
      className="mt-8 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200"
    >
      This early access link is no longer valid. Ask whoever sent it to you for
      a new one.
    </p>
  )
}
