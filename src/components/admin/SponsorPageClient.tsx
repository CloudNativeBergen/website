'use client'

import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { GeneralBroadcastModal } from '@/components/admin'
import SponsorTierEditor from '@/components/admin/SponsorTierEditor'
import SponsorTierManagement from '@/components/admin/SponsorTierManagement'
import {
  BuildingOffice2Icon,
  GlobeAltIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { TicketIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { ConferenceSponsorWithContact } from '@/lib/sponsor/types'
import { Conference } from '@/lib/conference/types'
import { SponsorTier } from '@/lib/sponsor/types'
import { formatConferenceDateLong } from '@/lib/time'
import { useSponsorBroadcast } from '@/hooks/useSponsorBroadcast'

interface SponsorPageClientProps {
  conference: Conference
  sponsors: ConferenceSponsorWithContact[]
  sponsorTiers: SponsorTier[]
  sponsorsByTier: Record<string, ConferenceSponsorWithContact[]>
  sortedTierNames: string[]
}

export default function SponsorPageClient({
  conference,
  sponsors,
  sponsorTiers,
  sponsorsByTier,
  sortedTierNames,
}: SponsorPageClientProps) {
  const {
    isBroadcastModalOpen,
    setIsBroadcastModalOpen,
    handleBroadcastEmail,
    handleSyncContacts,
  } = useSponsorBroadcast()

  const sponsorsWithContacts = sponsors.filter(
    (sponsor) =>
      sponsor.sponsor.contact_persons &&
      sponsor.sponsor.contact_persons.length > 0 &&
      sponsor.sponsor.contact_persons.some((contact) => contact.email),
  )

  return (
    <>
      <div className="mx-auto max-w-7xl">
        <AdminPageHeader
          icon={<BuildingOffice2Icon />}
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
              className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
            >
              <div className="flex items-center space-x-3">
                <div className="shrink-0">
                  <UserGroupIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Sponsor Contacts
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    Manage sponsor contact information
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/tickets/discount"
              className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
            >
              <div className="flex items-center space-x-3">
                <div className="shrink-0">
                  <TicketIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Sponsor Discount Codes
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    Manage and distribute ticket discount codes
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/sponsor"
              className="relative block rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
            >
              <div className="flex items-center space-x-3">
                <div className="shrink-0">
                  <GlobeAltIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    View Sponsor Page
                  </p>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    See the public sponsorship information
                  </p>
                </div>
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
        recipientCount={sponsorsWithContacts.length}
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
