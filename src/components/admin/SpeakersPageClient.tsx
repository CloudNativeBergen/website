'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SpeakerTable } from '@/components/admin/SpeakerTable'
import { SpeakerManagementModal } from '@/components/admin/SpeakerManagementModal'
import { SpeakerActions } from '@/components/admin/SpeakerActions'
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
  TicketIcon,
} from '@heroicons/react/24/outline'
import { useNotification } from '@/components/admin/NotificationProvider'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting, Status } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import type { SpeakerTicketStatus } from '@/lib/tickets/speakerStatus'

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
  const [selectedSpeaker, setSelectedSpeaker] = useState<
    (Speaker & { proposals: ProposalExisting[] }) | null
  >(null)
  const [previewTalks, setPreviewTalks] = useState<ProposalExisting[]>([])

  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const sendTicketInvitationsMutation =
    api.speaker.admin.sendTicketInvitations.useMutation()

  // Whether each speaker has actually CLAIMED their comp ticket. One
  // full-event provider read per call, memoized 30s server-side. `retry: false`
  // so an outage settles on the `unknown` badge instead of hammering the
  // provider.
  const ticketStatusQuery = api.tickets.admin.speakerTicketStatus.useQuery(
    undefined,
    { retry: false },
  )
  const ticketStatuses = useMemo<Record<string, SpeakerTicketStatus>>(() => {
    // A REFUSED OR FAILED QUERY IS `unknown`, NOT "no status". Left as an empty
    // map, an outage would render "-" for everyone AND empty the "Ticket not
    // claimed" filter — an unreadable provider would look like nobody to chase,
    // which is the one reading this feature must never produce.
    if (ticketStatusQuery.isError) {
      return Object.fromEntries(
        speakers.map((speaker) => [
          speaker._id,
          { speakerId: speaker._id, state: 'unknown' as const },
        ]),
      )
    }
    return Object.fromEntries(
      (ticketStatusQuery.data?.statuses ?? []).map((s) => [s.speakerId, s]),
    )
  }, [ticketStatusQuery.data, ticketStatusQuery.isError, speakers])

  const handleSendTicketInvitations = async () => {
    if (
      !window.confirm(
        'Are you sure you want to process and send ticket invitations to all confirmed speakers who have not received one yet?',
      )
    ) {
      return
    }

    try {
      const res = await sendTicketInvitationsMutation.mutateAsync()
      // The sweep writes `issuedSpeakerTickets`, so the mounted status query is
      // now stale: freshly invited speakers would keep reading "Not invited".
      await utils.tickets.admin.speakerTicketStatus.invalidate()
      showNotification({
        type: 'success',
        title: 'Ticket Invitations Sent',
        message: res.message,
      })
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Failed to send ticket invitations',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Detection (#267). Org-scoped server-side; `retry: false` so a refusal (e.g.
  // an unresolvable org) surfaces its message instead of hammering the scan.

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
              onClick: () => router.push('/admin/speakers/duplicates'),
              icon: <ArrowsPointingInIcon className="h-4 w-4" />,
              variant: 'secondary',
            },
            {
              label: 'Send Ticket Invitations',
              onClick: handleSendTicketInvitations,
              icon: <TicketIcon className="h-4 w-4" />,
              disabled:
                confirmedSpeakersCount === 0 ||
                sendTicketInvitationsMutation.isPending,
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

        <div>
          <SpeakerTable
            speakers={speakers}
            currentConferenceId={currentConferenceId}
            featuredSpeakerIds={
              conference.featuredSpeakers?.map((s) => s._id) || []
            }
            ticketStatuses={ticketStatuses}
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
            ticketStatus={ticketStatuses[selectedSpeaker._id]}
          />
        )}

        {/* No remount `key`: the modal re-seeds on every closed→open
            transition, so reopening the SAME pair works — a `key` cannot do
            that, because an identical key is not a remount. */}
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
