'use client'

import type { ReactNode } from 'react'
import { BoltIcon } from '@heroicons/react/24/outline'
import { formatDateTimeSafe } from '@/lib/time'
import { WorkshopSection } from './WorkshopSection'
import { WorkshopEarlyAccessBulkButton } from './WorkshopEarlyAccessBulkButton'
import { WORKSHOP_REGISTRATION_ANCHOR } from '../WorkshopRegistrationSettings'

/**
 * "Sponsor early access" on `/admin/workshops` (#1452): when it opens, the
 * bulk send with its result, and the sign-ups it admitted, in one card. The
 * time is edited under Settings, with the other registration times it is
 * checked against. Which ticket types get early access with no link is set in
 * "Workshop tickets".
 */
export function SponsorEarlyAccessCard({
  sponsorStart,
  children,
}: {
  /** "Sponsor early access opens", as stored. */
  sponsorStart?: string
  /** The early sign-ups list. */
  children: ReactNode
}) {
  return (
    <WorkshopSection
      icon={BoltIcon}
      title="Sponsor early access"
      description="People with a sponsor’s early-access link can sign up before registration opens for everyone."
    >
      <dl className="mt-4 flex flex-wrap items-baseline gap-x-2 text-sm">
        <dt className="font-medium text-gray-500 dark:text-gray-400">
          Early access opens
        </dt>
        <dd className="text-gray-900 dark:text-white">
          {sponsorStart ? formatDateTimeSafe(sponsorStart) : 'Not set'}
        </dd>
      </dl>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Change it in{' '}
        <a
          href={`#${WORKSHOP_REGISTRATION_ANCHOR}`}
          className="font-medium text-indigo-600 underline hover:no-underline dark:text-indigo-400"
        >
          Workshop registration
        </a>
        , under Settings.
      </p>
      <div className="mt-4">
        <WorkshopEarlyAccessBulkButton />
      </div>
      <div className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-700">
        {children}
      </div>
    </WorkshopSection>
  )
}
