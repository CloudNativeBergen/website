'use client'

import React from 'react'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { GeneralBroadcastModal } from '@/components/admin'
import { useSponsorBroadcast } from '@/hooks/useSponsorBroadcast'
import { api } from '@/lib/trpc/client'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { emailBrandColor } from '@/lib/branding/theme'
import { formatConferenceDateLong } from '@/lib/time'
import type { Conference } from '@/lib/conference/types'

interface SponsorDashboardBroadcastActionProps {
  conference: Conference
}

export function SponsorDashboardBroadcastAction({
  conference,
}: SponsorDashboardBroadcastActionProps) {
  const {
    isBroadcastModalOpen,
    setIsBroadcastModalOpen,
    handleBroadcastEmail,
    handleSyncContacts,
  } = useSponsorBroadcast()

  const sponsorsQuery = api.sponsor.crm.list.useQuery(
    { status: ['closed-won'] },
    { staleTime: 30000 },
  )

  const recipientCount = React.useMemo(() => {
    if (!sponsorsQuery.data) return 0
    const emails = new Set<string>()
    for (const s of sponsorsQuery.data) {
      for (const c of s.contactPersons ?? []) {
        if (c.email) emails.add(c.email.trim().toLowerCase())
      }
    }
    return emails.size
  }, [sponsorsQuery.data])

  return (
    <>
      <button
        type="button"
        onClick={() => setIsBroadcastModalOpen(true)}
        disabled={recipientCount === 0}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        <EnvelopeIcon className="size-4" aria-hidden="true" />
        <span>Send Broadcast</span>
        {recipientCount > 0 && (
          <span className="rounded-full bg-indigo-700 px-1.5 py-0.5 text-xs text-indigo-100 dark:bg-indigo-600">
            {recipientCount}
          </span>
        )}
      </button>

      <GeneralBroadcastModal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        onSend={handleBroadcastEmail}
        onSyncContacts={handleSyncContacts}
        recipientCount={recipientCount}
        recipientType="sponsors"
        fromEmail={`${conference.organizer || PLATFORM_NAME} <${conference.sponsorEmail}>`}
        eventName={conference.title}
        eventLocation={`${conference.city}, ${conference.country}`}
        eventDate={formatConferenceDateLong(conference.startDate)}
        eventUrl={conferenceBaseUrl(conference)}
        socialLinks={conference.socialLinks || []}
        brandColor={emailBrandColor(conference.theme)}
      />
    </>
  )
}
