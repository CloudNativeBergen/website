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
import { TicketAddressModal } from '@/components/admin/TicketAddressModal'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting, Status } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import type { SpeakerTicketStatus } from '@/lib/tickets/speakerStatus'
import { ModalShell } from '@/components/ModalShell'

export function SpeakerInviteLinkPrompt({ onSaved }: { onSaved: () => void }) {
  const { showNotification } = useNotification()
  const save = api.conference.updateSpeakerRegistrationLink.useMutation()
  const [link, setLink] = useState('')
  const valid = /^https:\/\/\S+$/i.test(link)
  const handleSave = async () => {
    try {
      await save.mutateAsync({ speakerRegistrationLink: link })
      showNotification({
        type: 'success',
        title: 'Speaker invite link saved',
        message: 'This send and every later one now point speakers to it.',
      })
      onSaved()
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Could not save the link',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return (
    <div
      role="alert"
      className="mt-4 space-y-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/50 dark:bg-yellow-900/20"
    >
      <p className="font-inter text-sm text-yellow-800 dark:text-yellow-200">
        This conference has no speaker ticket invite link. Without it the email
        carries no claim link and can only point at the ticket provider&apos;s
        own invitation, which may never arrive. Paste Checkin&apos;s invite link
        for the speaker ticket category to save it on the conference.
      </p>
      <div className="flex gap-2">
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://app.checkin.no/..."
          className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 focus:ring-inset sm:text-sm sm:leading-6 dark:bg-gray-800 dark:text-white dark:ring-gray-700"
        />
        <button
          type="button"
          disabled={!valid || save.isPending}
          onClick={handleSave}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

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
  // The speaker whose ticket address is being looked up, or null when closed.
  const [ticketAddressSpeakerId, setTicketAddressSpeakerId] = useState<
    string | null
  >(null)
  const [isMissingLinkModalOpen, setIsMissingLinkModalOpen] = useState(false)
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
    if (noRegistrationLink) {
      setIsMissingLinkModalOpen(true)
      return
    }
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
            onFindTicket={setTicketAddressSpeakerId}
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
            ticketActionsUnavailableReason={undefined}
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
            <SpeakerInviteLinkPrompt
              onSaved={() => {
                utils.speaker.admin.ticketInvitationConfig.invalidate()
                utils.speaker.admin.ticketInvitationPreview.invalidate()
              }}
            />
          )}
        </ConfirmationModal>

        <ModalShell
          isOpen={isMissingLinkModalOpen}
          onClose={() => setIsMissingLinkModalOpen(false)}
        >
          <div className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Missing Registration Link
            </h2>
            <SpeakerInviteLinkPrompt
              onSaved={() => {
                utils.speaker.admin.ticketInvitationConfig.invalidate()
                utils.speaker.admin.ticketInvitationPreview.invalidate()
                setIsMissingLinkModalOpen(false)
              }}
            />
          </div>
        </ModalShell>

        <TicketAddressModal
          isOpen={ticketAddressSpeakerId !== null}
          onClose={() => setTicketAddressSpeakerId(null)}
          speakerId={ticketAddressSpeakerId}
          speakerName={
            speakers.find((s) => s._id === ticketAddressSpeakerId)?.name
          }
          // A recorded address changes the JOIN, not the speaker document the
          // page was rendered from, so the status query is what has to be
          // re-read — the row flips to Claimed off this invalidation.
          onLinked={() => utils.tickets.admin.speakerTicketStatus.invalidate()}
        />

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
            ticketStatus={ticketStatuses?.[selectedSpeaker._id]}
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
