'use client'

import Link from 'next/link'
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'
import { SpeakerAvatarsWithNames } from '@/components/SpeakerAvatars'
import { extractSpeakersFromProposal } from '@/lib/proposal/utils'
import {
  formats,
  statuses,
  Status,
  type ProposalExisting,
} from '@/lib/proposal/types'
import { Flags } from '@/lib/speaker/types'
import { formatConferenceDateShort } from '@/lib/time'

/**
 * Proposal status → the shared {@link StatusBadge} palette. Kept as a map over
 * the `Status` enum (rather than a chain of ternaries) so a status added to
 * `@/lib/proposal/types` shows up here as a missing key at typecheck time.
 */
const STATUS_COLOR: Record<Status, BadgeColor> = {
  [Status.draft]: 'gray',
  [Status.submitted]: 'yellow',
  [Status.accepted]: 'green',
  [Status.waitlisted]: 'orange',
  [Status.confirmed]: 'blue',
  [Status.rejected]: 'red',
  [Status.withdrawn]: 'gray',
  [Status.deleted]: 'gray',
}

/** One labelled fact row. `icon` is optional so text-only facts line up too. */
function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon ? (
        <Icon
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
        />
      ) : (
        <span aria-hidden="true" className="h-4 w-4 shrink-0" />
      )}
      <span className="shrink-0 text-gray-500 dark:text-gray-400">{label}</span>
      <span className="min-w-0 font-medium break-words text-gray-900 dark:text-white">
        {children}
      </span>
    </div>
  )
}

export interface ProposalContextPaneViewProps {
  proposal: ProposalExisting
  /**
   * Narrow-screen back affordance (the drill-down step). Omitted on wide
   * screens, where the pane is a rail beside the thread and there is nothing to
   * go back from.
   */
  backHref?: string
}

/**
 * READ-ONLY proposal context for the conversation open beside it.
 *
 * Deliberately NOT an editor and NOT a set of status actions: the proposal
 * editor at `/admin/proposals/<id>` stays the single place a proposal is
 * changed, and this pane's only outbound control is the link to it. Everything
 * shown is derived from `ProposalExisting` via the same helpers the proposal
 * surfaces use (`extractSpeakersFromProposal`, the `statuses`/`formats` label
 * maps, `Flags.requiresTravelFunding`), so the shape is never re-derived here.
 *
 * Presentational — the container below supplies the proposal — so stories and
 * tests render it without tRPC.
 */
export function ProposalContextPaneView({
  proposal,
  backHref,
}: ProposalContextPaneViewProps) {
  const speakers = extractSpeakersFromProposal(proposal)
  const requiresTravelFunding = speakers.some((speaker) =>
    speaker?.flags?.includes(Flags.requiresTravelFunding),
  )
  const schedule = proposal.scheduleInfo

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        {backHref && (
          <Link
            href={backHref}
            className="-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue lg:hidden dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            Conversation
          </Link>
        )}
        <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
          Proposal
        </h2>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <h3 className="font-space-grotesk text-base leading-snug font-bold text-gray-900 dark:text-white">
          {proposal.title}
        </h3>

        <div>
          <StatusBadge
            label={statuses.get(proposal.status) ?? proposal.status}
            color={STATUS_COLOR[proposal.status] ?? 'gray'}
          />
        </div>

        {speakers.length > 0 ? (
          <SpeakerAvatarsWithNames
            speakers={proposal.speakers ?? []}
            size="sm"
            maxVisible={3}
          />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No speakers on this proposal.
          </p>
        )}

        <div className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
          <Fact icon={ClockIcon} label="Format">
            {formats.get(proposal.format) ?? proposal.format}
          </Fact>

          {schedule?.date ? (
            <>
              {/* Short date + a separate time row: at 288px the long form
                  ("tirsdag 27. oktober 2026 · 13:20–13:45") wrapped mid-value
                  and pushed the track line off the fold. */}
              <Fact icon={CalendarDaysIcon} label="Scheduled">
                {formatConferenceDateShort(schedule.date)}
                {schedule.timeSlot &&
                  ` · ${schedule.timeSlot.startTime}–${schedule.timeSlot.endTime}`}
              </Fact>
              {schedule.trackTitle && (
                <Fact icon={MapPinIcon} label="Track">
                  {schedule.trackTitle}
                </Fact>
              )}
            </>
          ) : (
            <Fact icon={CalendarDaysIcon} label="Scheduled">
              <span className="font-normal text-gray-500 dark:text-gray-400">
                Not on the schedule
              </span>
            </Fact>
          )}
        </div>

        {requiresTravelFunding && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <ExclamationTriangleIcon
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>Requires travel funding</span>
          </div>
        )}
      </div>

      {/* `pb-[max(...)]` for the same reason as the thread composer: the
          workspace frame is full-bleed below `lg`, so this footer ends at the
          screen edge and would otherwise sit under an iPhone home indicator. */}
      <div className="shrink-0 border-t border-gray-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-700">
        <Link
          href={`/admin/proposals/${proposal._id}`}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Open proposal editor
          <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}

export interface ProposalContextPaneProps {
  proposalId: string
  backHref?: string
}

/**
 * Data container: loads the proposal behind a proposal-attached conversation.
 *
 * Reuses `proposal.admin.getById` — the SAME read the proposal editor and the
 * `MessageSlideOver` rail already make — so the pane costs no new endpoint and
 * shares their React Query cache entry.
 */
export function ProposalContextPane({
  proposalId,
  backHref,
}: ProposalContextPaneProps) {
  const { data, isLoading, isError } = api.proposal.admin.getById.useQuery({
    id: proposalId,
  })

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
        <div className="h-10 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="p-4">
        <p role="alert" className="text-sm text-gray-500 dark:text-gray-400">
          Couldn&apos;t load the proposal for this conversation.
        </p>
        <Link
          href={`/admin/proposals/${proposalId}`}
          className="mt-2 inline-flex text-sm font-medium text-brand-cloud-blue hover:underline dark:text-blue-300"
        >
          Open proposal editor
        </Link>
      </div>
    )
  }

  return <ProposalContextPaneView proposal={data} backHref={backHref} />
}
