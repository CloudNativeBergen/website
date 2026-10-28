'use client'

import { useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import type { ConferenceWithSpeakerData } from '@/lib/dashboard/types'
import type { Speaker } from '@/lib/speaker/types'
import { CompactConferenceHeader } from './CompactConferenceHeader'
import { CompactProposalList } from './CompactProposalList'
import { CompactPhotoStrip } from './CompactPhotoStrip'
import { SpeakerTalkPhotoList } from '@/components/photo-wall/talk/SpeakerTalkPhotos'
import { DashboardTalkPhotosOptOutSwitch } from '@/components/photo-wall/talk/TalkPhotosOptOutSwitch'
import { CompactWorkshopStats } from './CompactWorkshopStats'
import { CompactTravelSupport } from './CompactTravelSupport'
import { CompactBadges } from './CompactBadges'
import { SpeakerBriefingPanel } from './SpeakerBriefingPanel'
import { SpeakerThankYou } from './SpeakerThankYou'
import { shareTags } from '@/lib/share/social'
import { deriveBlueskyHandle } from '@/lib/stream/config'

interface CompactConferenceCardProps {
  data: ConferenceWithSpeakerData
  speaker: Speaker
  defaultExpanded?: boolean
}

export function CompactConferenceCard({
  data,
  speaker,
  defaultExpanded = false,
}: CompactConferenceCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const panelId = useId()
  const domain = data.conference.domains?.[0]
  const { proposals, galleryImages, workshopStats, travelSupport, badges } =
    data

  // Unread-message badges (V2b): ONE bounded `message.unreadByProposalIds` query
  // per card that has proposals, reusing the caller's existing notification
  // store (no new polling). Gated on `proposals.length` so cards without talks
  // (gallery/workshop-only editions) never fire it.
  const proposalIds = useMemo(() => proposals.map((p) => p._id), [proposals])
  const { data: unreadByProposalId } = api.message.unreadByProposalIds.useQuery(
    { proposalIds },
    { enabled: proposalIds.length > 0, staleTime: 30_000 },
  )

  const hasContent =
    proposals.length > 0 ||
    galleryImages.length > 0 ||
    workshopStats.length > 0 ||
    travelSupport !== null ||
    badges.length > 0 ||
    !!data.briefing

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="min-w-0 flex-1 text-left"
          disabled={!hasContent}
          aria-expanded={hasContent ? isExpanded : undefined}
          aria-controls={hasContent && isExpanded ? panelId : undefined}
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
        {domain && (
          <Link
            href={`https://${domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 py-3 pr-4 text-xs font-medium text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80 dark:text-blue-400 dark:hover:text-blue-300"
          >
            View →
          </Link>
        )}
      </div>

      {isExpanded && hasContent && (
        <div
          id={panelId}
          className="space-y-4 border-t border-gray-200 px-4 py-4 dark:border-gray-700"
        >
          {data.briefing && (
            <SpeakerBriefingPanel
              briefing={data.briefing}
              conferenceDay={data.conferenceDay}
              dayBefore={data.dayBefore}
              ticketSentAt={data.ticketSentAt}
              pinDinner={data.pinDinner}
              dinnerChoice={data.dinnerChoice}
              asOrganizer={data.asOrganizer}
              changesEmail={
                data.conference.cfpEmail || data.conference.contactEmail
              }
              social={{
                hashtag:
                  data.conference.socialHashtag?.trim().replace(/^#*/, '') ||
                  undefined,
                bluesky:
                  deriveBlueskyHandle(data.conference.socialLinks) ?? undefined,
              }}
            />
          )}

          {data.thankYou && data.thankYou.length > 0 && (
            <SpeakerThankYou
              talks={data.thankYou}
              eventName={data.conference.title}
              tags={shareTags(data.conference)}
              url={domain && `https://${domain}`}
            />
          )}

          {badges.length > 0 && <CompactBadges badges={badges} />}

          {proposals.length > 0 && (
            <CompactProposalList
              proposals={proposals}
              canEdit={data.canEditProposals}
              unreadByProposalId={unreadByProposalId}
              feedbackChips={data.feedbackChips}
              feedbackLinkOrigin={data.feedbackLinkOrigin}
            />
          )}

          {workshopStats.length > 0 && (
            <CompactWorkshopStats stats={workshopStats} />
          )}

          {travelSupport && (
            <CompactTravelSupport travelSupport={travelSupport} />
          )}

          {data.talkPhotos && data.talkPhotos.length > 0 && (
            <div className="space-y-3">
              <SpeakerTalkPhotoList talks={data.talkPhotos} />
              <DashboardTalkPhotosOptOutSwitch
                stored={speaker.talkPhotosOptOut}
              />
            </div>
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
