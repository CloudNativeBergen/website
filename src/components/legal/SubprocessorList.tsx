import {
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline'
// Imported from the MODULE, not the `@/lib/legal` barrel: the barrel re-exports
// `resolveSubprocessorDisclosure` from a `server-only` file, and this component
// also renders in Storybook. `./subprocessors` is pure and client-safe.
import type {
  DisclosedSubprocessor,
  SubprocessorDisclosure,
  SubprocessorId,
} from '@/lib/legal/subprocessors'

/**
 * The /privacy subprocessor list, rendered from the RESOLVED disclosure rather
 * than hardcoded per vendor (#690).
 *
 * PRESENTATION ONLY — every decision about what belongs in the list is made in
 * `@/lib/legal/subprocessors`. This component's one job on top of rendering is
 * to make UNCERTAINTY VISIBLE: an entry the resolver could not confirm carries a
 * "may not apply" badge and the list carries a notice, because an over-long list
 * presented as fact is its own inaccuracy — smaller than omitting a processor,
 * but still a claim the organizer signs their name to.
 */

const ICONS: Record<SubprocessorId, typeof LockClosedIcon> = {
  sanity: LockClosedIcon,
  vercel: GlobeAltIcon,
  resend: EnvelopeIcon,
  checkin: DocumentTextIcon,
  tito: DocumentTextIcon,
  pirsch: ChartBarIcon,
  slack: ChatBubbleLeftRightIcon,
  'oauth-providers': LockClosedIcon,
  workos: LockClosedIcon,
}

const GROUP_TITLES = {
  infrastructure: 'Essential Service Providers',
  authentication: 'Authentication Services',
} as const

function SubprocessorRow({ processor }: { processor: DisclosedSubprocessor }) {
  const Icon = ICONS[processor.id]
  return (
    <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
      <div className="flex items-start space-x-3">
        <Icon className="mt-1 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            {processor.name}
            {processor.certainty === 'possible' ? (
              <span className="ml-2 inline-block rounded-sm bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-normal text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                May not apply to this event
              </span>
            ) : null}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {processor.purpose}
            {processor.detail ? ` ${processor.detail}` : ''}
          </p>
          {/*
            WHO CHOSE THIS PROCESSOR is the question a DPA review is actually
            asking. Some of these are shared platform infrastructure the
            organizer never selected (our hosting, our content dataset) and some
            are vendors they picked; publishing the list without the distinction
            reads as though the organizer chose all of them.
          */}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
            {processor.chosenBy === 'organizer'
              ? 'Selected by the event organizer'
              : 'Shared platform infrastructure'}
            {processor.location
              ? ` • Location: ${processor.location} • Protected by Standard Contractual Clauses`
              : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

export function SubprocessorList({
  disclosure,
}: {
  disclosure: SubprocessorDisclosure
}) {
  const groups = (['infrastructure', 'authentication'] as const)
    .map((group) => ({
      group,
      processors: disclosure.processors.filter((p) => p.group === group),
    }))
    .filter(({ processors }) => processors.length > 0)

  return (
    <div className="space-y-6">
      {/*
        Rendered only when something could NOT be determined. The previous
        blanket caveat ("this list describes the services the platform can use")
        was on the page unconditionally, which trained the reader to discount the
        whole list. A notice that appears only when it is true is worth reading.
      */}
      {disclosure.incomplete ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="flex items-start space-x-3">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Some of this event&apos;s integration settings could not be read
              just now, so the entries marked{' '}
              <span className="font-semibold">may not apply to this event</span>{' '}
              are listed as a precaution. We would rather name a provider that
              turns out not to process your data than leave one out.
            </p>
          </div>
        </div>
      ) : null}

      {groups.map(({ group, processors }) => (
        <div key={group}>
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            {GROUP_TITLES[group]}
          </h3>
          <div className="space-y-3">
            {processors.map((processor) => (
              <SubprocessorRow key={processor.id} processor={processor} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
