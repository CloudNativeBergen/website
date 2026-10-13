'use client'

import { useId } from 'react'
import { BoltIcon } from '@heroicons/react/24/outline'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateSafe } from '@/lib/time'
import type {
  EarlySignupRow,
  EarlySignups,
} from '@/lib/workshop/early-access/signups'
import { EARLY_SIGNUPS_ANCHOR } from './anchor'
import { EarlyAccessBadge } from './EarlyAccessBadge'

export interface EarlySignupsListProps {
  /**
   * The early sign-ups the server answered, already narrowed to `sponsorId`
   * when one is set. `undefined`: no answer yet. THE LIST FILTERS NOTHING: the
   * page's general read of sign-ups holds the first hundred only, so the
   * server narrows, over every match.
   */
  signups: EarlySignupRow[] | undefined
  /** What the list can be narrowed to, as the server answered it. */
  sponsors: EarlySignups['sponsors'] | undefined
  /** The sponsor the list is narrowed to, or `null` for every sponsor. */
  sponsorId: string | null
  onSponsorChange: (sponsorId: string | null) => void
  /** Why the sign-ups could not be read. */
  error?: string | null
  onRetry?: () => void
}

const columns: Column<EarlySignupRow>[] = [
  {
    key: 'person',
    header: 'Name',
    primary: true,
    render: (signup) => (
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white">
          {signup.userName}
        </div>
        <div className="text-sm font-normal break-all text-gray-500 dark:text-gray-400">
          {signup.userEmail}
        </div>
      </div>
    ),
  },
  {
    key: 'workshop',
    header: 'Workshop',
    render: (signup) => (
      <span className="text-gray-900 dark:text-gray-200">
        {signup.workshop?.title ?? 'Unknown workshop'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (signup) =>
      signup.status === 'confirmed' ? (
        <StatusBadge label="Confirmed" color="green" />
      ) : (
        <StatusBadge label="Waitlist" color="yellow" />
      ),
  },
  {
    key: 'sponsor',
    header: 'Sponsor',
    render: (signup) =>
      signup.earlyAccess.sponsor?.name ? (
        <span className="text-gray-900 dark:text-gray-200">
          {signup.earlyAccess.sponsor.name}
        </span>
      ) : (
        // The sponsor is no longer in the conference.
        <EarlyAccessBadge earlyAccess={{ sponsor: null }} />
      ),
  },
  {
    key: 'signedUpAt',
    header: 'Signed up',
    render: (signup) => (
      <span className="text-gray-900 dark:text-gray-200">
        {formatDateSafe(signup.signedUpAt)}
      </span>
    ),
  },
]

/** What a sponsor of the conference is called in the control and the text. */
const nameOf = (sponsor: { name: string | null }) =>
  sponsor.name ?? 'Unnamed sponsor'
const NOT_IN_CONFERENCE = 'A sponsor not in this conference'

/**
 * The "Early sign-ups" list on `/admin/workshops` (#1348, spec §9): the
 * sign-ups of every workshop that a sponsor's early-access link admitted, with
 * person, workshop, status and sponsor. It can be narrowed to one sponsor.
 */
export function EarlySignupsList({
  signups,
  sponsors,
  sponsorId,
  onSponsorChange,
  error,
  onRetry,
}: EarlySignupsListProps) {
  const headingId = useId()
  const controlId = useId()
  const offered = sponsors ?? []
  const narrowedTo = sponsorId
    ? offered.find((sponsor) => sponsor._id === sponsorId)
    : undefined
  const narrowedName = narrowedTo
    ? nameOf(narrowedTo)
    : NOT_IN_CONFERENCE.replace(/^A/, 'a')
  const count = signups?.length ?? 0

  return (
    <section
      id={EARLY_SIGNUPS_ANCHOR}
      aria-labelledby={headingId}
      className="scroll-mt-24 rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BoltIcon className="size-5 shrink-0 text-gray-400 dark:text-gray-500" />
            <h3
              id={headingId}
              className="text-lg font-medium text-gray-900 dark:text-white"
            >
              Early sign-ups
            </h3>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Sign-ups made through a sponsor&rsquo;s early-access link, before
            registration opened for everyone.
          </p>
        </div>

        {(offered.length > 0 || sponsorId) && (
          <div className="w-full sm:w-auto">
            <label
              htmlFor={controlId}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Sponsor
            </label>
            <select
              id={controlId}
              value={sponsorId ?? ''}
              onChange={(event) => onSponsorChange(event.target.value || null)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white py-2 pr-8 pl-3 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none sm:w-64 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
            >
              <option value="">All sponsors</option>
              {offered.map((sponsor) => (
                <option key={sponsor._id} value={sponsor._id}>
                  {nameOf(sponsor)}
                </option>
              ))}
              {sponsorId && !narrowedTo && (
                <option value={sponsorId}>{NOT_IN_CONFERENCE}</option>
              )}
            </select>
          </div>
        )}
      </div>

      <div className="mt-4">
        {error ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 dark:bg-white/5 dark:text-gray-300 dark:outline-white/10 dark:hover:bg-white/10"
              >
                Try again
              </button>
            )}
          </div>
        ) : !signups ? (
          <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
            Reading the early sign-ups…
          </p>
        ) : count === 0 ? (
          <div className="rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {sponsorId
                ? `No early sign-ups through ${narrowedName}`
                : 'No early sign-ups yet'}
            </p>
            {sponsorId ? (
              <button
                type="button"
                onClick={() => onSponsorChange(null)}
                className="mt-2 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Show all sponsors
              </button>
            ) : (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                A sign-up made through a sponsor&rsquo;s early-access link,
                before registration opens for everyone, is listed here.
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              {count} early sign-up{count === 1 ? '' : 's'}
              {sponsorId ? ` through ${narrowedName}` : ''}
            </p>
            <DataTable<EarlySignupRow>
              data={signups}
              columns={columns}
              keyExtractor={(signup) => signup._id}
            />
          </>
        )}
      </div>
    </section>
  )
}
