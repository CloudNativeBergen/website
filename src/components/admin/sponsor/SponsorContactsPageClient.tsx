'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  UserGroupIcon,
  BuildingOffice2Icon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader, ErrorDisplay } from '@/components/admin'
import {
  AdminFilterBar,
  type FilterGroup,
} from '@/components/admin/AdminFilterBar'
import { SkeletonTable } from '@/components/admin/LoadingSkeleton'
import { StatusBadge } from '@/components/StatusBadge'
import { SponsorContactTable } from './SponsorContactTable'
import { SponsorContactActions } from './SponsorContactActions'
import { getSponsorStatusBadgeProps } from '@/components/admin/sponsor-crm/utils'
import { api } from '@/lib/trpc/client'
import { useDebounce } from '@/hooks/useDebounce'
import { Conference } from '@/lib/conference/types'
import type { SponsorStatus } from '@/lib/sponsor-crm/types'
import { ACCEPTED_SPONSOR_STATUS } from '@/lib/sponsor-crm/labels'
import { evaluateBilling } from '@/lib/sponsor-crm/billing'

/**
 * Pipeline stages offered as filters, ordered as they appear on the sponsor
 * board so the two pages read the same way.
 */
const STATUS_OPTIONS: SponsorStatus[] = [
  'closed-won',
  'negotiating',
  'contacted',
  'prospect',
  'closed-lost',
]

/**
 * The page opens on accepted sponsors — the ones an organizer actually has to
 * invoice and service. Everything else is a deal in progress (or a dead one)
 * and is one filter click away.
 */
const DEFAULT_STATUSES: SponsorStatus[] = [ACCEPTED_SPONSOR_STATUS]

type TriStateFilter = '' | 'yes' | 'no'

/** `''` means "no opinion" — the sentinel `AdminFilterBar` ignores when counting. */
function triStateToBoolean(value: TriStateFilter): boolean | undefined {
  return value === '' ? undefined : value === 'yes'
}

interface SponsorContactsPageClientProps {
  conference: Conference
}

export function SponsorContactsPageClient({
  conference,
}: SponsorContactsPageClientProps) {
  const [statuses, setStatuses] = useState<SponsorStatus[]>(DEFAULT_STATUSES)
  const [billingFilter, setBillingFilter] = useState<TriStateFilter>('')
  const [contactsFilter, setContactsFilter] = useState<TriStateFilter>('')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  const {
    data: sponsors = [],
    isLoading,
    isError,
    error,
  } = api.sponsor.crm.list.useQuery({
    status: statuses.length > 0 ? statuses : undefined,
    hasContactInfo: triStateToBoolean(contactsFilter),
    billingComplete: triStateToBoolean(billingFilter),
    searchQuery:
      debouncedSearchQuery.trim().length >= 2
        ? debouncedSearchQuery.trim()
        : undefined,
  })

  // The unfiltered roster, used for the "of N" total and for the broadcast
  // recipient count. The broadcast targets the synced sponsor audience — every
  // sponsor's contacts, regardless of what this page is filtered to — so its
  // count must come from here and not from the visible rows.
  const { data: allSponsors = [] } = api.sponsor.crm.list.useQuery({})

  const broadcastRecipientCount = useMemo(() => {
    const addresses = new Set<string>()
    for (const sfc of allSponsors) {
      for (const contact of sfc.contactPersons ?? []) {
        const email = contact.email?.trim().toLowerCase()
        if (email) addresses.add(email)
      }
    }
    return addresses.size
  }, [allSponsors])

  const stats = useMemo(() => {
    let contactCount = 0
    let billingReady = 0

    for (const sfc of sponsors) {
      contactCount += sfc.contactPersons?.length ?? 0
      if (evaluateBilling(sfc).complete) billingReady++
    }

    return {
      contactCount,
      billingReady,
      billingGaps: sponsors.length - billingReady,
    }
  }, [sponsors])

  const toggleStatus = (value: string) => {
    const status = value as SponsorStatus
    setStatuses((current) =>
      current.includes(status)
        ? current.filter((entry) => entry !== status)
        : [...current, status],
    )
  }

  const filterGroups: FilterGroup[] = [
    {
      key: 'status',
      label: 'Stage',
      options: STATUS_OPTIONS.map((status) => ({
        value: status,
        label: <StatusBadge {...getSponsorStatusBadgeProps(status)} />,
      })),
      selected: statuses,
      onChange: toggleStatus,
      emptyText: 'No pipeline stages available',
    },
    {
      key: 'billing',
      label: 'Billing',
      multi: false,
      options: [
        { value: '', label: 'Any billing state' },
        { value: 'yes', label: 'Ready to invoice' },
        { value: 'no', label: 'Incomplete billing' },
      ],
      selected: [billingFilter],
      onChange: (value) => setBillingFilter(value as TriStateFilter),
    },
    {
      key: 'contacts',
      label: 'Contacts',
      multi: false,
      options: [
        { value: '', label: 'Any' },
        { value: 'yes', label: 'Has contact persons' },
        { value: 'no', label: 'Missing contact persons' },
      ],
      selected: [contactsFilter],
      onChange: (value) => setContactsFilter(value as TriStateFilter),
    },
  ]

  const handleClearAll = () => {
    setStatuses([])
    setBillingFilter('')
    setContactsFilter('')
    setSearchQuery('')
  }

  // Mirrors the server's own from-address resolution (see
  // `lib/email/broadcast.ts`) so the modal cannot advertise an address the
  // send would never use.
  const fromAddress = conference.sponsorEmail || conference.contactEmail
  const organizerName = conference.organizer?.trim()
  const fromEmail = fromAddress
    ? organizerName
      ? `${organizerName} <${fromAddress}>`
      : fromAddress
    : 'No sponsor or contact email configured'

  const isFiltered =
    statuses.length > 0 ||
    billingFilter !== '' ||
    contactsFilter !== '' ||
    debouncedSearchQuery.trim().length >= 2

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<UserGroupIcon />}
        title="Sponsor Contacts"
        description="Contact and billing details for accepted sponsors of"
        contextHighlight={conference.title}
        stats={[
          {
            value: sponsors.length,
            label: 'Sponsors shown',
            color: 'slate',
          },
          {
            value: stats.contactCount,
            label: 'Contact persons',
            color: 'blue',
          },
          {
            value: stats.billingReady,
            label: 'Ready to invoice',
            color: 'green',
          },
          {
            value: stats.billingGaps,
            label: 'Incomplete billing',
            color: stats.billingGaps > 0 ? 'red' : 'slate',
          },
        ]}
        actions={
          <SponsorContactActions
            visibleSponsors={sponsors}
            broadcastRecipientCount={broadcastRecipientCount}
            fromEmail={fromEmail}
            conference={conference}
          />
        }
        backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
      />

      <AdminFilterBar
        filters={filterGroups}
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: 'Search sponsor or contact...',
        }}
        resultCount={sponsors.length}
        totalCount={allSponsors.length}
        resultLabel="sponsors"
        onClearAll={handleClearAll}
      />

      {isError ? (
        <ErrorDisplay
          title="Failed to Load Sponsors"
          message={error?.message || 'Could not load sponsor CRM data'}
        />
      ) : isLoading ? (
        <SkeletonTable rows={6} columns={6} />
      ) : (
        <SponsorContactTable
          sponsors={sponsors}
          emptyDescription={
            isFiltered
              ? 'No sponsors match the current filters. Try widening the stage or billing filter.'
              : 'No sponsors were found for this conference.'
          }
        />
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Quick Navigation
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/sponsors"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
          >
            <div className="rounded-full bg-indigo-100 p-3 dark:bg-indigo-900/20">
              <BuildingOffice2Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Sponsor Dashboard
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Back to overview
              </p>
            </div>
          </Link>

          <Link
            href="/admin/sponsors/tiers"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
          >
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/20">
              <ChartBarIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Sponsor Tiers
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Manage tiers
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
