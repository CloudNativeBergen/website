import type { SignupEarlyAccess } from '@/lib/workshop/types'

/**
 * Marks an early sign-up (#1348, spec §9): "via _Sponsor_", the sponsor whose
 * early-access link admitted it, or "early access" when that sponsor is no
 * longer in the conference. Renders nothing for a sign-up that is not early.
 *
 * "early access" is also what a sponsor that IS in the conference and has no
 * name reads as; the tooltip tells the two apart.
 */
export function EarlyAccessBadge({
  earlyAccess,
}: {
  earlyAccess: SignupEarlyAccess | undefined
}) {
  if (!earlyAccess) return null
  if (earlyAccess.ticketType) {
    return (
      <span
        title={`Signed up early with a “${earlyAccess.ticketType}” ticket`}
        className="inline-block max-w-[min(16rem,100%)] truncate rounded-full bg-blue-100 px-2.5 py-0.5 align-middle text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
      >
        Ticket: {earlyAccess.ticketType}
      </span>
    )
  }
  const name = earlyAccess.sponsor?.name
  return (
    <span
      title={
        name
          ? `Signed up through ${name}’s early-access link`
          : earlyAccess.sponsor
            ? 'Signed up through the early-access link of a sponsor of this conference that has no name'
            : 'Signed up through the early-access link of a sponsor that is no longer in this conference'
      }
      className={`inline-block max-w-[min(16rem,100%)] truncate rounded-full px-2.5 py-0.5 align-middle text-xs font-medium ${
        name
          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
      }`}
    >
      {name ? `via ${name}` : 'early access'}
    </span>
  )
}
