'use client'

import { ProposalList } from '@/components/cfp/ProposalList'
import { WorkshopStatistics } from '@/components/cfp/WorkshopStatistics'
import { SpeakerShare } from '@/components/SpeakerShare'
import { SpeakerSharingActions } from '@/components/branding/SpeakerSharingActions'
import type { WorkshopStats } from '@/components/cfp/WorkshopStatistics'
import { LightBulbIcon } from '@heroicons/react/24/outline'
import type { Speaker } from '@/lib/speaker/types'
import type { ProposalExisting } from '@/lib/proposal/types'

export interface CFPListPageClientProps {
  speaker: Speaker
  confirmedProposals: ProposalExisting[]
  initialProposals: ProposalExisting[]
  cfpIsOpen: boolean
  currentConferenceId: string
  speakerSlug: string
  speakerUrl: string
  eventName: string
  workshopStats: WorkshopStats[]
}

export default function CFPListPageClient({
  speaker,
  confirmedProposals,
  initialProposals,
  cfpIsOpen,
  currentConferenceId,
  speakerSlug,
  speakerUrl,
  eventName,
  workshopStats,
}: CFPListPageClientProps) {
  return (
    <div className="mx-auto max-w-2xl lg:max-w-6xl lg:px-12">
      <div>
        <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
          Speaker Dashboard
        </h1>
        <div className="font-inter mt-6 space-y-4 text-xl tracking-normal text-gray-700 dark:text-gray-300">
          <p>
            Manage your proposals and share your confirmed talks with your
            network
          </p>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProposalList
            initialProposals={initialProposals}
            cfpIsOpen={cfpIsOpen}
            currentConferenceId={currentConferenceId}
          />

          {workshopStats.length > 0 && (
            <div className="mt-8">
              <WorkshopStatistics statistics={workshopStats} />
            </div>
          )}
        </div>

        {confirmedProposals.length > 0 && (
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <h2 className="font-jetbrains text-2xl font-bold tracking-tighter text-brand-cloud-blue dark:text-blue-400">
                Share Your Talks
              </h2>

              <div className="mt-6 space-y-4">
                {confirmedProposals.map((proposal) => (
                  <div
                    key={proposal._id}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                  >
                    <h3 className="font-jetbrains text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {proposal.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {proposal.format}
                    </p>
                    <div className="mt-4">
                      <SpeakerSharingActions
                        filename={`${speakerSlug}-${proposal.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                        speakerUrl={speakerUrl}
                        eventName={eventName}
                        talkTitle={proposal.title}
                      >
                        <span></span>
                      </SpeakerSharingActions>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-lg bg-brand-cloud-blue/5 p-4 dark:bg-blue-900/20">
                <div className="flex items-start">
                  <LightBulbIcon className="h-5 w-5 flex-shrink-0 text-brand-cloud-blue dark:text-blue-400" />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-brand-cloud-blue dark:text-blue-400">
                      Pro tip
                    </p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                      Sharing your confirmed talks helps promote the event and
                      builds your personal brand as a speaker.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <SpeakerShare speaker={speaker} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
