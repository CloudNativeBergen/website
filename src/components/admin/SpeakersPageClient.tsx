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
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting, Status } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import Link from 'next/link'
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
  const [isTicketConfirmOpen, setIsTicketConfirmOpen] = useState(false)
  // A SET, not one id: two rows can be in flight at once, and a single id let
  // the first one to finish clear the other row's pending state — which made a
  // marker-bypassing re-send clickable again mid-flight.
  const [sendingTicketSpeakerIds, setSendingTicketSpeakerIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const sendTicketInvitationsMutation =
    api.speaker.admin.sendTicketInvitations.useMutation()
  const sendTicketInvitationMutation =
    api.speaker.admin.sendTicketInvitation.useMutation()

  // Can this conference send invitations at all? Provider-free and cheap, so
  // unlike the sweep preview it runs on mount: every row needs the answer, not
  // only the confirmation modal. A failed read leaves the rows alone rather
  // than hiding the action on a guess — the server refuses either way.
  const ticketConfigQuery = api.speaker.admin.ticketInvitationConfig.useQuery(
    undefined,
    { retry: false },
  )
  const noRegistrationLink =
    ticketConfigQuery.data?.hasRegistrationLink === false

  // What the sweep WOULD do, asked for only while the confirmation is open —
  // it is a dry run of the sweep, which reads the ticket provider. The numbers
  // come from the sending code itself, so what the organizer confirms is what
  // the send does.
  const ticketPreviewQuery = api.speaker.admin.ticketInvitationPreview.useQuery(
    undefined,
    { enabled: isTicketConfirmOpen, retry: false, staleTime: 0 },
  )
  // NOT just `data`: react-query keeps the PREVIOUS result while refetching, so
  // a reopened modal would show the last run's counts and enable Send against
  // them. Nothing is a preview until this fetch has landed.
  //
  // `isError` too: with `retry: false` a failed refetch leaves `isFetching`
  // false while react-query STILL holds the previous result, so Send would go
  // live against the last run's counts under a message saying the numbers
  // could not be worked out.
  const preview =
    ticketPreviewQuery.isFetching || ticketPreviewQuery.isError
      ? undefined
      : ticketPreviewQuery.data

  // Whether each speaker has actually CLAIMED their comp ticket. One
  // full-event provider read per call, memoized 30s server-side. `retry: false`
  // so an outage settles on the `unknown` badge instead of hammering the
  // provider.
  const ticketStatusQuery = api.tickets.admin.speakerTicketStatus.useQuery(
    undefined,
    { retry: false },
  )
  const ticketStatuses = useMemo<Record<string, SpeakerTicketStatus>>(() => {
    // AN EMPTY RESULT HERE IS LOAD-BEARING — DO NOT SIMPLIFY IT AWAY.
    //
    // A REFUSED OR FAILED QUERY IS `unknown`, NOT "no status". Left as an empty
    // map, an outage would render "-" for everyone AND empty the "Ticket not
    // claimed" filter — an unreadable provider would look like nobody left to
    // chase, which is the one reading this feature must never produce.
    //
    // `fetchRedeemedSpeakerEmails` already guards exactly this on the server
    // (provider down ⇒ `unknown` for everyone, never "unclaimed"). That guard
    // covers the provider failing UNDER a working query; it cannot see the
    // query itself failing — an unresolvable conference, a feature deny, a
    // network error — so the same invariant has to be restated here. Deleting
    // this branch reintroduces the bug one layer above the fix.
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
    setIsTicketConfirmOpen(false)
    try {
      const res = await sendTicketInvitationsMutation.mutateAsync()
      // The sweep writes `issuedSpeakerTickets`, so the mounted status query is
      // now stale: freshly invited speakers would keep reading "Not invited".
      await utils.tickets.admin.speakerTicketStatus.invalidate()
      showNotification({
        // Nothing sent is not a success, even when nothing failed.
        type: res.sent > 0 ? 'success' : 'warning',
        title: res.sent > 0 ? 'Ticket invitations sent' : 'No invitations sent',
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

  const handleSendTicketInvitation = async (speakerId: string) => {
    if (sendingTicketSpeakerIds.has(speakerId)) return
    setSendingTicketSpeakerIds((prev) => new Set(prev).add(speakerId))
    try {
      await sendTicketInvitationMutation.mutateAsync({ speakerId })
      await utils.tickets.admin.speakerTicketStatus.invalidate()
      showNotification({
        type: 'success',
        title: 'Invitation sent',
        message: 'The speaker has been sent their ticket invitation.',
      })
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Failed to send invitation',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSendingTicketSpeakerIds((prev) => {
        const next = new Set(prev)
        next.delete(speakerId)
        return next
      })
    }
  }

  // Everything the organizer needs before pressing send: which conference, how
  // many get an email, how many are skipped, and whether that email will carry
  // a claim link at all.
  const ticketConfirmMessage = ticketPreviewQuery.isError
    ? 'Could not work out who would be emailed. Sending now would be a guess.'
    : !preview
      ? 'Working out who would be emailed…'
      : // `blocked` is NOT "nobody is waiting". Ticketing is unconfigured or the
        // provider could not be read, so the sweep would send nothing whatever
        // the queue looks like.
        preview.blocked
        ? preview.blockedReason === 'no-registration-link'
          ? // The panel below carries the reason and the link to fix it; this
            // line only has to be unambiguous about the outcome.
            'No ticket invitations will be sent.'
          : 'Ticket invitations cannot be issued for this conference right now. Check the ticketing configuration, and that an invitation-only speaker ticket type exists.'
        : preview.toSend === 0
          ? `No speakers at ${preview.conferenceTitle} are waiting for a ticket invitation. ${preview.alreadyInvited} have already been invited or already hold a ticket.`
          : `${preview.toSend} ${preview.toSend === 1 ? 'speaker' : 'speakers'} at ${preview.conferenceTitle} will be emailed a ticket invitation now. ${preview.alreadyInvited} will be skipped: already invited, or already holding a ticket.`

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
              label: 'New Speaker',
              onClick: handleCreateClick,
              icon: <PlusIcon className="h-4 w-4" />,
            },
            // Hidden without the entitlement — the page it points at 404s.
            ...(badgesEnabled
              ? [
                  {
                    label: 'Badges',
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
              label: 'Duplicates',
              onClick: () => router.push('/admin/speakers/duplicates'),
              icon: <ArrowsPointingInIcon className="h-4 w-4" />,
              variant: 'secondary',
            },
            {
              label: 'Tickets',
              onClick: () => setIsTicketConfirmOpen(true),
              icon: <TicketIcon className="h-4 w-4" />,
              disabled:
                confirmedSpeakersCount === 0 ||
                sendTicketInvitationsMutation.isPending,
              variant: 'secondary',
            },
            {
              label: 'Send Email',
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
            ticketStatusesLoading={ticketStatusQuery.isPending}
            onSendTicketInvitation={handleSendTicketInvitation}
            sendingTicketSpeakerIds={sendingTicketSpeakerIds}
            // The sweep bypasses no marker, but a row action does — so while a
            // sweep is in flight every row is held, rather than letting a click
            // race it to the same speaker and mail them twice.
            //
            // HELD UNTIL THE STATUS REFETCH LANDS, not just until the mutation
            // resolves. In that gap a freshly invited row still reads "Not
            // invited" (`ticketStatusesLoading` is `isPending`, false during a
            // refetch), and a click there re-sends over the speaker's own
            // marker — a second provider invitation and a second email.
            //
            // Still a UI guard, not a lock: two organizers in two browsers can
            // overlap, which needs a server-side per-speaker lock.
            ticketActionsDisabled={
              sendTicketInvitationsMutation.isPending ||
              ticketStatusQuery.isFetching
            }
            // Not a disabled button: the row says why, because the fix is a
            // setting the organizer owns and a dead control does not name it.
            ticketActionsUnavailableReason={
              noRegistrationLink
                ? 'No speaker registration link — add one in Settings → Registration'
                : undefined
            }
            onEditSpeaker={handleEditSpeaker}
            onPreviewSpeaker={handlePreviewSpeaker}
          />
        </div>

        <ConfirmationModal
          isOpen={isTicketConfirmOpen}
          onClose={() => setIsTicketConfirmOpen(false)}
          onConfirm={handleSendTicketInvitations}
          title="Send ticket invitations"
          message={ticketConfirmMessage}
          confirmButtonText="Send invitations"
          variant="warning"
          isLoading={sendTicketInvitationsMutation.isPending}
          confirmDisabled={!preview || preview.blocked || preview.toSend === 0}
        >
          {preview && !preview.hasRegistrationLink && (
            <p className="font-inter rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
              This conference has no speaker registration link. Without it the
              email carries no claim link and can only point at the ticket
              provider&apos;s own invitation, which may never arrive. Add it
              under{' '}
              <Link
                href="/admin/settings"
                className="font-semibold underline underline-offset-2"
              >
                Settings → Registration
              </Link>{' '}
              and open this again.
            </p>
          )}
        </ConfirmationModal>

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
