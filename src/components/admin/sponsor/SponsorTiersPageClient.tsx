'use client'

import { AdminPageHeader } from '@/components/admin'
import { GeneralBroadcastModal } from '@/components/admin'
import { SponsorTierEditor } from './SponsorTierEditor'
import { SponsorTierManagement } from './SponsorTierManagement'
import {
  GlobeAltIcon,
  UserGroupIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import { TicketIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { ConferenceSponsor } from '@/lib/sponsor/types'
import { Conference } from '@/lib/conference/types'
import { SponsorTier } from '@/lib/sponsor/types'
import { formatConferenceDateLong } from '@/lib/time'
import { useSponsorBroadcast } from '@/hooks/useSponsorBroadcast'

interface SponsorTiersPageClientProps {
  conference: Conference
  sponsors: ConferenceSponsor[]
  sponsorTiers: SponsorTier[]
  sponsorsByTier: Record<string, ConferenceSponsor[]>
  sortedTierNames: string[]
}

export function SponsorTiersPageClient({
  conference,
  sponsors,
  sponsorTiers,
  sponsorsByTier,
  sortedTierNames,
}: SponsorTiersPageClientProps) {
  const {
    isBroadcastModalOpen,
    setIsBroadcastModalOpen,
    handleBroadcastEmail,
    handleSyncContacts,
  } = useSponsorBroadcast()

  const recipientCount = sponsors.length

  return (
    <>
      <div className="mx-auto max-w-7xl">
        <AdminPageHeader
          icon={<ChartBarIcon />}
          title="Sponsor Tiers"
          description="Configure sponsorship tiers and manage sponsor assignments for"
          contextHighlight={conference.title}
          backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
        />

        <div className="mt-8">
          <SponsorTierEditor
            conferenceId={conference?._id || ''}
            sponsorTiers={sponsorTiers}
          />
        </div>

        <div className="mt-12">
          <SponsorTierManagement
            sponsors={sponsors}
            sponsorTiers={sponsorTiers}
            sponsorsByTier={sponsorsByTier}
            sortedTierNames={sortedTierNames}
          />
        </div>

        <div className="mt-12">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Quick Actions
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/admin/sponsors/contacts"
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700/50"
            >
              <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900/20">
                <UserGroupIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Sponsor Contacts
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  Manage contact information
                </p>
              </div>
            </Link>

            <Link
              href="/admin/tickets/discount"
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700/50"
            >
              <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/20">
                <TicketIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Sponsor Discount Codes
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  Manage ticket discount codes
                </p>
              </div>
            </Link>

            <Link
              href="/sponsor"
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700/50"
            >
              <div className="rounded-full bg-indigo-100 p-3 dark:bg-indigo-900/20">
                <GlobeAltIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  View Sponsor Page
                </p>
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                  Public sponsorship info
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <GeneralBroadcastModal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        onSend={handleBroadcastEmail}
        onSyncContacts={handleSyncContacts}
        recipientCount={recipientCount}
        recipientType="sponsors"
        fromEmail={`${conference.organizer || 'Cloud Native Days'} <${conference.sponsor_email}>`}
        eventName={conference.title}
        eventLocation={`${conference.city}, ${conference.country}`}
        eventDate={formatConferenceDateLong(conference.start_date)}
        eventUrl={`https://${conference.domains[0]}`}
        socialLinks={conference.social_links || []}
      />
    </>
  )
}
