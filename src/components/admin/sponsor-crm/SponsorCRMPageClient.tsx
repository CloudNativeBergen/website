'use client'

import React from 'react'
import { AdminPageHeader } from '@/components/admin'
import { SponsorCRMPipeline } from './SponsorCRMPipeline'
import { RectangleStackIcon } from '@heroicons/react/24/outline'
import { PlusIcon } from '@heroicons/react/20/solid'
import { Conference } from '@/lib/conference/types'
import { ImportHistoricSponsorsButton } from '@/components/admin/sponsor-crm/ImportHistoricSponsorsButton'
import { api } from '@/lib/trpc/client'

interface SponsorCRMPageClientProps {
  conference: Conference
  domain: string
}

export function SponsorCRMPageClient({
  conference,
  domain,
}: SponsorCRMPageClientProps) {
  const utils = api.useUtils()
  // Control hook to trigger form from header
  const [triggerNew, setTriggerNew] = React.useState(0)

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col overflow-hidden lg:h-[calc(100vh-9rem)]">
      <AdminPageHeader
        icon={<RectangleStackIcon />}
        title="Sponsor Pipeline"
        description={
          <span>
            Manage relationships for{' '}
            <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
              {conference.title}
            </span>
          </span>
        }
        actionItems={[
          {
            label: 'Import Historic',
            render: () => (
              <ImportHistoricSponsorsButton
                conferenceId={conference._id}
                onSuccess={() => utils.sponsor.crm.list.invalidate()}
              />
            ),
          },
          {
            label: 'New Sponsor',
            onClick: () => setTriggerNew((v) => v + 1),
            icon: <PlusIcon className="-ml-0.5 h-5 w-5" aria-hidden="true" />,
          },
        ]}
        backLink={{ href: '/admin/sponsors', label: 'Back' }}
      />

      <div className="min-h-0 flex-1">
        <SponsorCRMPipeline
          conferenceId={conference._id}
          conference={conference}
          domain={domain}
          externalNewTrigger={triggerNew}
        />
      </div>
    </div>
  )
}
