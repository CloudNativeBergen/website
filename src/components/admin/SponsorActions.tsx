'use client'

import { Button } from '@/components/Button'
import { GeneralBroadcastModal } from '@/components/admin'
import { UserGroupIcon, EnvelopeIcon } from '@heroicons/react/24/outline'
import { ConferenceSponsorWithContact } from '@/lib/sponsor/types'
import { useSponsorBroadcast } from '@/hooks/useSponsorBroadcast'

interface SponsorActionsProps {
  sponsors: ConferenceSponsorWithContact[]
  conferenceTitle: string
  conferenceLocation: string
  conferenceDate: string
  conferenceUrl: string
  socialLinks: string[]
  contactEmail: string
}

export function SponsorActions({
  sponsors,
  conferenceTitle,
  conferenceLocation,
  conferenceDate,
  conferenceUrl,
  socialLinks,
  contactEmail,
}: SponsorActionsProps) {
  const {
    isBroadcastModalOpen,
    setIsBroadcastModalOpen,
    handleBroadcastEmail,
    handleSyncContacts,
  } = useSponsorBroadcast()

  // Count sponsors with contact information
  const sponsorsWithContacts = sponsors.filter(
    (sponsor) =>
      sponsor.sponsor.contact_persons &&
      sponsor.sponsor.contact_persons.length > 0 &&
      sponsor.sponsor.contact_persons.some((contact) => contact.email),
  )

  if (sponsorsWithContacts.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
        <div className="text-center">
          <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">
            No Sponsor Contacts
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Add contact information to sponsors to enable email broadcasts.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Sponsor Communications
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Send emails to {sponsorsWithContacts.length} sponsors with contact
            information
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => setIsBroadcastModalOpen(true)}
            className="inline-flex items-center gap-2"
          >
            <EnvelopeIcon className="h-4 w-4" />
            Send Broadcast
          </Button>
        </div>
      </div>

      <GeneralBroadcastModal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        onSend={handleBroadcastEmail}
        onSyncContacts={handleSyncContacts}
        recipientCount={sponsorsWithContacts.length}
        recipientType="sponsors"
        fromEmail={`Cloud Native Bergen <${contactEmail}>`}
        eventName={conferenceTitle}
        eventLocation={conferenceLocation}
        eventDate={conferenceDate}
        eventUrl={conferenceUrl}
        socialLinks={socialLinks}
      />
    </div>
  )
}
