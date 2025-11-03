'use client'

import { useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import type { ConferenceWithSpeakerData } from '@/lib/dashboard/types'
import type { Speaker } from '@/lib/speaker/types'
import { CompactConferenceHeader } from './CompactConferenceHeader'
import { CompactProposalList } from './CompactProposalList'
import { CompactPhotoStrip } from './CompactPhotoStrip'
import { CompactWorkshopStats } from './CompactWorkshopStats'
import { CompactTravelSupport } from './CompactTravelSupport'

interface CompactConferenceCardProps {
  data: ConferenceWithSpeakerData
  speaker: Speaker
  defaultExpanded?: boolean
}

export function CompactConferenceCard({
  data,
  defaultExpanded = false,
}: CompactConferenceCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const { proposals, galleryImages, workshopStats, travelSupport } = data

  const hasContent =
    proposals.length > 0 ||
    galleryImages.length > 0 ||
    workshopStats.length > 0 ||
    travelSupport !== null

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
        disabled={!hasContent}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {hasContent && (
            <div className="shrink-0">
              {isExpanded ? (
                <ChevronDownIcon className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronRightIcon className="h-5 w-5 text-gray-400" />
              )}
            </div>
          )}
          <CompactConferenceHeader data={data} />
        </div>
      </button>

      {isExpanded && hasContent && (
        <div className="space-y-4 border-t border-gray-200 px-4 py-4 dark:border-gray-700">
          {proposals.length > 0 && (
            <CompactProposalList
              proposals={proposals}
              canEdit={data.canEditProposals}
              conferenceHasEnded={data.isOver}
            />
          )}

          {workshopStats.length > 0 && (
            <CompactWorkshopStats stats={workshopStats} />
          )}

          {travelSupport && (
            <CompactTravelSupport travelSupport={travelSupport} />
          )}

          {galleryImages.length > 0 && (
            <CompactPhotoStrip
              images={galleryImages}
              conferenceName={data.conference.title}
            />
          )}
        </div>
      )}
    </div>
  )
}
