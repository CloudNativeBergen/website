'use client'

import React from 'react'
import { AdminPageHeader } from '@/components/admin'
import { SponsorCRMClient } from './SponsorCRMClient'
import { RectangleStackIcon } from '@heroicons/react/24/outline'
import { PlusIcon } from '@heroicons/react/20/solid'
import { Conference } from '@/lib/conference/types'
import { ImportHistoricSponsorsButton } from '@/components/admin/sponsor-crm/ImportHistoricSponsorsButton'
import { api } from '@/lib/trpc/client'

interface SponsorCRMPageWrapperProps {
  conference: Conference
  domain: string
}

export function SponsorCRMPageWrapper({
  conference,
  domain,
}: SponsorCRMPageWrapperProps) {
  const utils = api.useUtils()
  // Control hook to trigger form from header
  const [triggerNew, setTriggerNew] = React.useState(0)

  return (
    <div className="mx-auto max-w-7xl">
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
        actions={
          <div className="flex items-center gap-2">
            <ImportHistoricSponsorsButton
              conferenceId={conference._id}
              onSuccess={() => utils.sponsor.crm.list.invalidate()}
            />
            <button
              onClick={() => setTriggerNew((v) => v + 1)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <PlusIcon className="-ml-0.5 h-5 w-5" aria-hidden="true" />
              New Sponsor
            </button>
          </div>
        }
        backLink={{ href: '/admin/sponsors', label: 'Back' }}
      />

      <div className="-mt-2">
        <SponsorCRMClient
          conferenceId={conference._id}
          conference={conference}
          domain={domain}
          externalNewTrigger={triggerNew}
        />
      </div>
    </div>
  )
}
