/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState } from 'react'
import { SponsorDetailHeader } from '@/components/admin/sponsor-crm/widgets/SponsorDetailHeader'
import { SponsorOverviewWidget } from '@/components/admin/sponsor-crm/widgets/SponsorOverviewWidget'
import { SponsorContactsWidget } from '@/components/admin/sponsor-crm/widgets/SponsorContactsWidget'
import { SponsorContractWidget } from '@/components/admin/sponsor-crm/widgets/SponsorContractWidget'
import { SponsorActivityFeedWidget } from '@/components/admin/sponsor-crm/widgets/SponsorActivityFeedWidget'
import { SponsorDashboardModals } from '@/components/admin/sponsor-crm/widgets/SponsorDashboardModals'

interface SponsorDashboardClientProps {
  sponsorId: string
  conferenceId: string
  initialOverview?: any
}

export function SponsorDashboardClient({
  sponsorId,
  conferenceId,
  initialOverview,
}: SponsorDashboardClientProps) {
  const [activeModal, setActiveModal] = useState<
    'contacts' | 'contract' | 'overview' | 'activity' | 'messages' | null
  >(null)

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-900/50">
      <SponsorDetailHeader
        sponsorId={sponsorId}
        conferenceId={conferenceId}
        initialData={initialOverview}
      />

      <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Left Column (Core Details) */}
            <div className="flex flex-col gap-8 lg:col-span-1">
              <SponsorOverviewWidget
                sponsorId={sponsorId}
                initialData={initialOverview}
                onEdit={() => setActiveModal('overview')}
              />
              <SponsorContactsWidget
                sponsorId={sponsorId}
                onEdit={() => setActiveModal('contacts')}
              />
            </div>

            {/* Right Column (Contracts & Timeline) */}
            <div className="flex h-[calc(100vh-12rem)] flex-col gap-8 lg:col-span-2">
              <SponsorContractWidget
                sponsorId={sponsorId}
                onEdit={() => setActiveModal('contract')}
              />
              <SponsorActivityFeedWidget
                sponsorId={sponsorId}
                onNewActivity={() => setActiveModal('activity')}
              />
            </div>
          </div>
        </div>
      </main>

      <SponsorDashboardModals
        sponsorId={sponsorId}
        activeModal={activeModal as any}
        onClose={() => setActiveModal(null)}
      />
    </div>
  )
}
