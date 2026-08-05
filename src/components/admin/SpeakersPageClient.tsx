'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SpeakerTable } from '@/components/admin/SpeakerTable'
import { SpeakerManagementModal } from '@/components/admin/SpeakerManagementModal'
import { SpeakerActions } from '@/components/admin/SpeakerActions'
import {
  SpeakerMergeModal,
  type MergeCandidate,
} from '@/components/admin/SpeakerMergeModal'
import { DuplicateSpeakersPanel } from '@/components/admin/DuplicateSpeakersPanel'
import { api } from '@/lib/trpc/client'
import SpeakerProfilePreview from '@/components/SpeakerProfilePreview'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import {
  PlusIcon,
  UserGroupIcon,
  EnvelopeIcon,
  AcademicCapIcon,
  CreditCardIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting, Status } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'

interface SpeakersPageClientProps {
  speakers: (Speaker & { proposals: ProposalExisting[] })[]
  currentConferenceId: string
  conference: Conference
  stats: {
    totalSpeakers: number
    confirmedSpeakers: number
    localSpeakers: number
    newSpeakers: number
    diverseSpeakers: number
    speakersNeedingTravel: number
  }
  confirmedSpeakersCount: number
  conferenceEmail: string
  /**
   * Whether this organization may manage speaker badges. `/admin/speakers/badge`
   * 404s without the entitlement (badge issuance refuses any non-platform org —
   * RunKonf/platform#46), so the shortcut to it must disappear with it. Defaults
   * to `false`: a caller that forgets to pass it hides a link rather than
   * offering a dead one.
   */
  badgesEnabled?: boolean
}

export default function SpeakersPageClient({
  speakers,
  currentConferenceId,
  conference,
  stats,
  confirmedSpeakersCount,
  conferenceEmail,
  badgesEnabled = false,
}: SpeakersPageClientProps) {
  const router = useRouter()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false)
  const [selectedSpeaker, setSelectedSpeaker] = useState<
    (Speaker & { proposals: ProposalExisting[] }) | null
  >(null)
  const [previewTalks, setPreviewTalks] = useState<ProposalExisting[]>([])
  // The pair the duplicate panel handed over, or null for a manual merge.
  const [mergeSeed, setMergeSeed] = useState<{
    survivorId: string
    loserId: string
  } | null>(null)

  // Detection (#267). Org-scoped server-side; `retry: false` so a refusal (e.g.
  // an unresolvable org) surfaces its message instead of hammering the scan.
  const duplicatesQuery = api.speaker.admin.duplicateCandidates.useQuery(
    undefined,
    { retry: false },
  )

  /**
   * THE MERGE PICKER MUST NOT BE THE PAGE'S TABLE.
   *
   * This page lists speakers with an accepted/confirmed talk
   * (`getSpeakersWithAcceptedTalks`) — right for the table, catastrophic for the
   * merge modal, which used to be handed that same array. A duplicate document
   * almost never has an accepted talk (the talks are on the OTHER document), so
   * BOTH dropdowns systematically excluded exactly the documents an organizer
   * needed to select, and the merge was impossible through the UI for the very
   * case it exists for.
   *
   * The candidate source is therefore the org-scoped, talk-status-agnostic
   * corpus the duplicate scan already reads. Until it arrives we fall back to
   * the page's list so the button is never dead — the fallback is the OLD,
   * filtered behaviour and must never become the steady state.
   */
  const mergeCandidates = useMemo<MergeCandidate[]>(() => {
    const fromScan = duplicatesQuery.data?.mergeCandidates
    if (fromScan && fromScan.length > 0) return fromScan

    return speakers.map((speaker) => ({
      _id: speaker._id,
      name: speaker.name,
      email: speaker.email,
      providers: speaker.providers ?? [],
    }))
  }, [speakers, duplicatesQuery.data])

  const handleMergePair = (pair: { survivorId: string; loserId: string }) => {
    setMergeSeed(pair)
    setIsMergeModalOpen(true)
  }

  const handleCreateClick = () => {
    setIsCreateModalOpen(true)
    setSelectedSpeaker(null)
  }

  const handleEditSpeaker = (
    speaker: Speaker & { proposals: ProposalExisting[] },
  ) => {
    setSelectedSpeaker(speaker)
    setIsEditModalOpen(true)
  }

  const handlePreviewSpeaker = (
    speaker: Speaker & { proposals: ProposalExisting[] },
  ) => {
    setSelectedSpeaker(speaker)
    const confirmedTalks = speaker.proposals.filter((proposal) => {
      if (proposal.status !== Status.confirmed) return false

      if (typeof proposal.conference === 'string') {
        return proposal.conference === currentConferenceId
      } else if (
        proposal.conference &&
        typeof proposal.conference === 'object' &&
        '_id' in proposal.conference
      ) {
        return proposal.conference._id === currentConferenceId
      }
      return false
    })
    setPreviewTalks(confirmedTalks)
    setIsPreviewModalOpen(true)
  }

  const handleSpeakerCreated = () => {
    router.refresh()
    setIsCreateModalOpen(false)
  }

  const handleSpeakerUpdated = () => {
    router.refresh()
    setIsEditModalOpen(false)
    setSelectedSpeaker(null)
  }

  const handleCloseModals = () => {
    setIsCreateModalOpen(false)
    setIsEditModalOpen(false)
    setIsPreviewModalOpen(false)
    setIsEmailModalOpen(false)
    setSelectedSpeaker(null)
    setPreviewTalks([])
  }

  return (
    <>
      <div className="space-y-6">
        <AdminPageHeader
          icon={<UserGroupIcon className="h-6 w-6" />}
          title="Speaker Management"
          description={
            <>
              Manage speakers for{' '}
              <span className="font-semibold">{conference.title}</span>
            </>
          }
          stats={[
            {
              value: stats.totalSpeakers,
              label: 'Total speakers',
              color: 'slate' as const,
            },
            {
              value: `${stats.confirmedSpeakers} (${
                stats.totalSpeakers > 0
                  ? Math.round(
                      (stats.confirmedSpeakers / stats.totalSpeakers) * 100,
                    )
                  : 0
              }%)`,
              label: 'Confirmed',
              color: 'green' as const,
            },
            {
              value: `${stats.newSpeakers} (${
                stats.totalSpeakers > 0
                  ? Math.round((stats.newSpeakers / stats.totalSpeakers) * 100)
                  : 0
              }%)`,
              label: 'New speakers',
              color: 'blue' as const,
            },
            {
              value: `${stats.diverseSpeakers} (${
                stats.totalSpeakers > 0
                  ? Math.round(
                      (stats.diverseSpeakers / stats.totalSpeakers) * 100,
                    )
                  : 0
              }%)`,
              label: 'Diverse',
              color: 'purple' as const,
            },
            {
              value: `${stats.localSpeakers} (${
                stats.totalSpeakers > 0
                  ? Math.round(
                      (stats.localSpeakers / stats.totalSpeakers) * 100,
                    )
                  : 0
              }%)`,
              label: 'Local',
              color: 'green' as const,
            },
            {
              value: stats.speakersNeedingTravel,
              label: 'Need travel',
              color: 'indigo' as const,
            },
          ]}
          actionItems={[
            {
              label: 'Create New Speaker',
              onClick: handleCreateClick,
              icon: <PlusIcon className="h-4 w-4" />,
            },
            // Hidden without the entitlement — the page it points at 404s.
            ...(badgesEnabled
              ? [
                  {
                    label: 'Manage Badges',
                    href: '/admin/speakers/badge',
                    icon: <AcademicCapIcon className="h-4 w-4" />,
                    variant: 'secondary' as const,
                  },
                ]
              : []),
            {
              label: 'Travel Support',
              href: '/admin/speakers/travel-support',
              icon: <CreditCardIcon className="h-4 w-4" />,
              variant: 'secondary',
            },
            {
              label: 'Merge Duplicates',
              onClick: () => {
                setMergeSeed(null)
                setIsMergeModalOpen(true)
              },
              icon: <ArrowsPointingInIcon className="h-4 w-4" />,
              variant: 'secondary',
            },
            {
              label: 'Email Speakers',
              onClick: () => setIsEmailModalOpen(true),
              icon: <EnvelopeIcon className="h-4 w-4" />,
              disabled: confirmedSpeakersCount === 0,
            },
          ]}
        />

        <DuplicateSpeakersPanel
          groups={duplicatesQuery.data?.groups ?? []}
          scannedCount={duplicatesQuery.data?.scannedCount ?? 0}
          isLoading={duplicatesQuery.isLoading}
          errorMessage={duplicatesQuery.error?.message ?? null}
          onMergePair={handleMergePair}
        />

        <div>
          <SpeakerTable
            speakers={speakers}
            currentConferenceId={currentConferenceId}
            featuredSpeakerIds={
              conference.featuredSpeakers?.map((s) => s._id) || []
            }
            onEditSpeaker={handleEditSpeaker}
            onPreviewSpeaker={handlePreviewSpeaker}
          />
        </div>

        <SpeakerManagementModal
          isOpen={isCreateModalOpen}
          onClose={handleCloseModals}
          editingSpeaker={null}
          onSpeakerCreated={handleSpeakerCreated}
        />

        {selectedSpeaker && (
          <SpeakerManagementModal
            isOpen={isEditModalOpen}
            onClose={handleCloseModals}
            editingSpeaker={selectedSpeaker}
            onSpeakerUpdated={handleSpeakerUpdated}
          />
        )}

        {selectedSpeaker && (
          <SpeakerProfilePreview
            isOpen={isPreviewModalOpen}
            onClose={handleCloseModals}
            speaker={selectedSpeaker}
            talks={previewTalks}
          />
        )}

        {/* No remount `key`: the modal re-seeds on every closed→open
            transition, so reopening the SAME pair works — a `key` cannot do
            that, because an identical key is not a remount. */}
        <SpeakerMergeModal
          isOpen={isMergeModalOpen}
          onClose={() => setIsMergeModalOpen(false)}
          speakers={mergeCandidates}
          initialSurvivorId={mergeSeed?.survivorId}
          initialLoserId={mergeSeed?.loserId}
          onMerged={() => {
            setMergeSeed(null)
            duplicatesQuery.refetch()
            router.refresh()
          }}
        />
      </div>

      <SpeakerActions
        eligibleSpeakersCount={confirmedSpeakersCount}
        fromEmail={conferenceEmail}
        conference={conference}
        isModalOpen={isEmailModalOpen}
        setIsModalOpen={setIsEmailModalOpen}
      />
    </>
  )
}
