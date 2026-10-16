'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { AcademicCapIcon } from '@heroicons/react/24/outline'
import {
  AdminPageHeader,
  WorkshopRegistrationSettings,
} from '@/components/admin'
import {
  WorkshopCard,
  SignupDetailsModal,
  AddParticipantModal,
  EditCapacityModal,
  AnnounceModal,
} from '@/components/admin/workshop'
import type { ParticipantFormData } from '@/components/admin/workshop'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import { ResendInstructionsButton } from './ResendInstructionsButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import type {
  WorkshopSignupStatus,
  ProposalWithWorkshopData,
} from '@/lib/workshop/types'
import type { WorkshopAnnouncementView } from '@/lib/workshop/announcements'
import { useRefreshAnnouncements } from './useRefreshAnnouncements'
import { useSignupActions } from './useSignupActions'
import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/EmptyState'
import {
  EarlySignupsList,
  EARLY_SIGNUPS_ANCHOR,
  EARLY_SPONSOR_PARAM,
  earlySignupsShownState,
  useBringEarlySignupsIntoView,
} from './early-signups'
import { workshopEarlySignupsSchema } from '@/server/schemas/workshop'
import { useSearchParams } from 'next/navigation'
import {
  TicketHolderContext,
  TicketHolderPanel,
  ticketHolderView,
  useRereadTicketHolders,
} from './holders'

interface SignupModalState {
  isOpen: boolean
  workshopId: string
  workshopTitle: string
  status: WorkshopSignupStatus | null
}

interface AddParticipantModalState {
  isOpen: boolean
  workshopId: string
  workshopTitle: string
}

interface EditCapacityModalState {
  isOpen: boolean
  workshopId: string
  workshopTitle: string
  currentCapacity: number
  currentSignups: number
}

interface AnnounceModalState {
  isOpen: boolean
  workshopId: string
  workshopTitle: string
  confirmedCount: number
}

interface WorkshopsClientPageProps {
  conferenceId: string
  initialWorkshops: ProposalWithWorkshopData[]
  workshopRegistrationSponsorStart?: string
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
  /** Why the resend action is unavailable, or null when it can be used. */
  resendDisabledReason: string | null
  /** The "Workshop tickets" section (#1332), rendered by the server page. */
  ticketsSection?: ReactNode
}

/**
 * THE PAGE BELONGS TO ONE CONFERENCE. If the conference changes under it (the
 * domain moved and the client kept this tree), it starts over: every list,
 * question and answer it holds is the other conference's, and the ticket
 * holders are read again on mount.
 */
export function WorkshopsClientPage(props: WorkshopsClientPageProps) {
  return <WorkshopsClientPageFor key={props.conferenceId} {...props} />
}

function WorkshopsClientPageFor({
  conferenceId,
  initialWorkshops,
  workshopRegistrationSponsorStart,
  workshopRegistrationStart,
  workshopRegistrationEnd,
  resendDisabledReason,
  ticketsSection,
}: WorkshopsClientPageProps) {
  const queryClient = useQueryClient()
  const { showNotification } = useNotification()
  const [announceModal, setAnnounceModal] = useState<AnnounceModalState>({
    isOpen: false,
    workshopId: '',
    workshopTitle: '',
    confirmedCount: 0,
  })
  const [deleteAnnouncementTarget, setDeleteAnnouncementTarget] =
    useState<WorkshopAnnouncementView | null>(null)
  const [signupModal, setSignupModal] = useState<SignupModalState>({
    isOpen: false,
    workshopId: '',
    workshopTitle: '',
    status: null,
  })
  const [addParticipantModal, setAddParticipantModal] =
    useState<AddParticipantModalState>({
      isOpen: false,
      workshopId: '',
      workshopTitle: '',
    })
  const [editCapacityModal, setEditCapacityModal] =
    useState<EditCapacityModalState>({
      isOpen: false,
      workshopId: '',
      workshopTitle: '',
      currentCapacity: 0,
      currentSignups: 0,
    })
  const { data: signupsData, refetch: refetchSignups } =
    api.workshop.admin.getAllSignups.useQuery(
      {
        pageSize: 100,
      },
      {
        enabled: !!conferenceId,
      },
    )

  const { data: workshopSignupsData } = api.workshop.admin.listSignups.useQuery(
    {
      workshopId: signupModal.workshopId,
      status: signupModal.status || undefined,
    },
    {
      enabled: !!signupModal.workshopId && !!signupModal.status,
    },
  )

  const { data: statsData, refetch: refetchStats } =
    api.workshop.admin.getSummary.useQuery(undefined, {
      enabled: !!conferenceId,
    })

  // THE TICKET HOLDERS (#1333): read after the page, since the ticket read is
  // slow once the shared memo has lapsed. One read for the panel and for the
  // banner in the "Workshop tickets" section (through the context below).
  // Outside the batch: the sign-ups and the totals do not wait for it.
  const ticketHolders = api.workshop.admin.ticketHolders.useQuery(undefined, {
    enabled: !!conferenceId,
    trpc: { context: { skipBatch: true } },
    // READ ON EVERY VISIT, also within the app's 60-second stale time: an
    // answer cached on an earlier visit may be another conference's (the
    // domain moved), and `ticketHolderView` never shows one. Read again, it
    // is this conference's; still another's, the panel says unavailable.
    refetchOnMount: 'always',
  })
  const holderView = ticketHolderView(ticketHolders, conferenceId)
  const rereadTicketHolders = useRereadTicketHolders()

  // THE "EARLY SIGN-UPS" LIST (#1348). Narrowing it to a sponsor is a new
  // read with the sponsor in its input: the server narrows, over every match.
  // Nothing here filters, since `signups` above is the first hundred only.
  //
  // THE ADDRESS IS THE ONE SOURCE OF WHAT IT IS NARROWED TO (`earlySponsor`,
  // as the count's link on a sponsor's record sets it). No state is kept for
  // it: with Cache Components, Next keeps a visited route mounted and hidden,
  // so state seeded from the address once would still hold the OLD narrowing
  // when that link brings the organizer back with another sponsor. A value
  // the read's schema would refuse is no narrowing.
  const searchParams = useSearchParams()
  const inAddress = workshopEarlySignupsSchema.shape.sponsorId.safeParse(
    searchParams.get(EARLY_SPONSOR_PARAM) ?? undefined,
  )
  const earlySponsorId = (inAddress.success && inAddress.data) || null
  const earlySignups = api.workshop.admin.listEarlySignups.useQuery(
    earlySponsorId ? { sponsorId: earlySponsorId } : {},
    {
      enabled: !!conferenceId,
      // The last answer's sponsors keep the control on the page while the
      // next answer is on its way. Its ROWS are not shown meanwhile: they
      // belong to another narrowing.
      placeholderData: keepPreviousData,
    },
  )
  // The count's link carries the list's fragment, and the list is the last
  // section of the page: it is brought into view, once per history entry
  // (see the hook for why Next does not, and why once).
  useBringEarlySignupsIntoView(earlySponsorId)
  const narrowEarlySignups = (sponsorId: string | null) => {
    // Written to the address, which `useSearchParams` above follows. Through
    // the History API, not the router: a navigation would render this page on
    // the server again, and its reads are live. Narrowed, the address is the
    // one the count's link has, anchor included, so the same address opened
    // anew shows the same list in view. Everything else in it is kept.
    const url = new URL(window.location.href)
    if (sponsorId) {
      url.searchParams.set(EARLY_SPONSOR_PARAM, sponsorId)
      url.hash = EARLY_SIGNUPS_ANCHOR
    } else {
      url.searchParams.delete(EARLY_SPONSOR_PARAM)
    }
    // The entry is marked as one that needs no bringing into view: the
    // organizer is at the list, now and when they come back to this entry.
    window.history.replaceState(
      earlySignupsShownState(),
      '',
      `${url.pathname}${url.search}${url.hash}`,
    )
  }

  const utils = api.useUtils()

  // Everything this page shows about sign-ups, read again. One function for
  // every action that changes them.
  const readSignupsAgain = () => {
    refetchSignups()
    // EVERY list of a workshop, not only the open one: a move changes two of
    // them, and one read a moment ago is otherwise shown again as it was.
    void utils.workshop.admin.listSignups.invalidate()
    // A confirm, a move or a delete changes what the early list says too.
    void utils.workshop.admin.listEarlySignups.invalidate()
    // The summary carries each workshop's own counts and capacity, which is
    // what the cards show (see `live` below). The server render is NOT asked
    // for again: `router.refresh()` re-runs the whole page for three numbers,
    // and one that cannot reach the server turns into a hard navigation.
    refetchStats()
    // Who is flagged, confirmed or waiting changes with every action too.
    rereadTicketHolders()
  }

  // Confirm, move to waitlist, delete. Everything is read again after every
  // attempt, also a refused one: the sign-up may be gone (see the hook).
  const signupActions = useSignupActions(readSignupsAgain)

  const manualSignupMutation = api.workshop.admin.manualSignup.useMutation({
    onSuccess: () => {
      readSignupsAgain()
      setAddParticipantModal({
        isOpen: false,
        workshopId: '',
        workshopTitle: '',
      })
    },
    // Refused (full, already signed up, busy: #1344): the dialog stays open
    // with what was typed, and the reason is shown.
    onError: (error) => {
      readSignupsAgain()
      showNotification(
        // No answer came back: the server may have added them all the same.
        error.data
          ? {
              type: 'error',
              title: 'Participant not added',
              message: error.message,
            }
          : {
              type: 'warning',
              title: 'No answer from the server',
              message:
                'The participant may or may not have been added. Check the list before trying again.',
            },
      )
    },
  })

  const updateCapacityMutation = api.workshop.admin.updateCapacity.useMutation({
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: [['workshop', 'list']],
      })
      readSignupsAgain()

      if (result.promotedCount && result.promotedCount > 0) {
        alert(`✅ ${result.message}`)
      }

      setEditCapacityModal({
        isOpen: false,
        workshopId: '',
        workshopTitle: '',
        currentCapacity: 0,
        currentSignups: 0,
      })
    },
    onError: (error) => {
      readSignupsAgain()
      showNotification(
        error.data
          ? {
              type: 'error',
              title: 'Capacity not changed',
              message: error.message,
            }
          : {
              type: 'warning',
              title: 'No answer from the server',
              message:
                'The capacity may or may not have been changed. Check the workshop before trying again.',
            },
      )
    },
  })

  const refreshAnnouncements = useRefreshAnnouncements()

  const { data: announcementsData } = api.workshop.announcements.useQuery(
    { workshopId: announceModal.workshopId },
    { enabled: announceModal.isOpen && !!announceModal.workshopId },
  )

  const announceMutation = api.workshop.announce.useMutation({
    onSuccess: (result) => {
      refreshAnnouncements(announceModal.workshopId)
      showNotification({
        type: result.failed > 0 ? 'warning' : 'success',
        title: 'Announcement sent',
        message:
          result.failed > 0
            ? `${result.sent} sent, ${result.failed} failed of ${result.recipientCount} confirmed participants.`
            : `Emailed ${result.sent} confirmed participant${result.sent === 1 ? '' : 's'}.`,
      })
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Could not send announcement',
        message: error.message,
      })
    },
  })

  const updateAnnouncementMutation =
    api.workshop.updateAnnouncement.useMutation({
      onSuccess: () => {
        refreshAnnouncements(announceModal.workshopId)
        showNotification({
          type: 'success',
          title: 'Announcement updated',
          message: 'The announcement copy was updated (no email was re-sent).',
        })
      },
      onError: (error) => {
        showNotification({
          type: 'error',
          title: 'Could not update announcement',
          message: error.message,
        })
      },
    })

  const deleteAnnouncementMutation =
    api.workshop.deleteAnnouncement.useMutation({
      onSuccess: () => {
        setDeleteAnnouncementTarget(null)
        refreshAnnouncements(announceModal.workshopId)
        showNotification({
          type: 'success',
          title: 'Announcement deleted',
          message: 'The announcement was removed from the workshop page.',
        })
      },
      onError: (error) => {
        showNotification({
          type: 'error',
          title: 'Could not delete announcement',
          message: error.message,
        })
      },
    })

  const signups = useMemo(() => signupsData?.data || [], [signupsData?.data])

  const signupsByWorkshop = useMemo(() => {
    const grouped = new Map<string, typeof signups>()
    signups.forEach((signup) => {
      const workshopId = signup.workshop._ref || signup.workshop._id || ''
      if (!grouped.has(workshopId)) {
        grouped.set(workshopId, [])
      }
      grouped.get(workshopId)?.push(signup)
    })
    return grouped
  }, [signups])

  const handleAddParticipant = (participant: ParticipantFormData) => {
    manualSignupMutation.mutate({
      userName: participant.userName,
      userEmail: participant.userEmail,
      userWorkOSId: participant.userWorkOSId || `manual_${Date.now()}`,
      experienceLevel: participant.experienceLevel,
      operatingSystem: participant.operatingSystem,
      workshop: {
        _type: 'reference',
        _ref: addParticipantModal.workshopId,
      },
      // No conference reference: the server resolves it from the request
      // domain, so a signup can never target another tenant's conference.
    })
  }

  const handleUpdateCapacity = (capacity: number) => {
    updateCapacityMutation.mutate({
      workshopId: editCapacityModal.workshopId,
      capacity,
    })
  }

  const handleAnnounce = (body: string) => {
    announceMutation.mutate({
      workshopId: announceModal.workshopId,
      body,
    })
  }

  const filteredSignups = useMemo(() => {
    if (!signupModal.status || !signupModal.workshopId) return []
    // Use workshop-specific data if available, otherwise fallback to filtered general signups
    if (workshopSignupsData?.data) {
      return workshopSignupsData.data
    }
    return signups.filter(
      (s) =>
        (s.workshop._ref || s.workshop._id) === signupModal.workshopId &&
        s.status === signupModal.status,
    )
  }, [signups, signupModal.workshopId, signupModal.status, workshopSignupsData])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Workshop Management"
        description="Manage workshop signups and capacity"
        icon={<AcademicCapIcon className="h-6 w-6" />}
        stats={
          statsData
            ? [
                {
                  value: statsData.data.totals.totalWorkshops,
                  label: 'Total Workshops',
                  color: 'blue' as const,
                },
                {
                  value: statsData.data.totals.uniqueParticipants,
                  label: 'Unique Participants',
                  color: 'purple' as const,
                },
                {
                  value: statsData.data.totals.totalSignups,
                  label: 'Total Signups',
                  color: 'slate' as const,
                },
                {
                  value: statsData.data.totals.totalConfirmed,
                  label: 'Confirmed',
                  color: 'green' as const,
                },
                {
                  value: statsData.data.totals.totalWaitlist,
                  label: 'Waitlist',
                  color: 'blue' as const,
                },
              ]
            : []
        }
      >
        {/* Below the stats, not beside the title: the title row cannot wrap,
            and on a phone the reason text would push the page sideways. */}
        <div className="mt-4 flex justify-end">
          <ResendInstructionsButton disabledReason={resendDisabledReason} />
        </div>
      </AdminPageHeader>

      {/* The section is rendered by the server; its banner reads the ticket
          holders this page read, through the context. It comes FIRST (spec
          §3): the not-set types are named above the statistics that leave
          their holders out. */}
      <TicketHolderContext.Provider value={holderView}>
        {ticketsSection}
      </TicketHolderContext.Provider>

      <TicketHolderPanel
        view={holderView}
        onRetry={() => void ticketHolders.refetch()}
        onMoveToWaitlist={signupActions.moveToWaitlist}
        onDeleteSignup={signupActions.remove}
        isMoving={signupActions.isMoving}
        isDeleting={signupActions.isDeleting}
        isRefreshing={ticketHolders.isFetching}
      />

      <WorkshopRegistrationSettings
        workshopRegistrationSponsorStart={workshopRegistrationSponsorStart}
        workshopRegistrationStart={workshopRegistrationStart}
        workshopRegistrationEnd={workshopRegistrationEnd}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {initialWorkshops.length === 0 ? (
          <EmptyState
            icon={AcademicCapIcon}
            title="No workshops found"
            description="No workshops have been created for this conference yet."
            className="col-span-full rounded-lg bg-gray-50 p-8 dark:bg-gray-800"
          />
        ) : (
          initialWorkshops.map((workshop) => {
            const workshopSignups = signupsByWorkshop.get(workshop._id) || []
            // The summary is read again after every action; the server render
            // (`workshop`) never is. Once the summary is in, its numbers are
            // the card's: the workshop's own counts from the same server read,
            // not a count of the 100 sign-ups this page lists.
            const live = statsData?.data.workshops.find(
              (stats) => stats.workshopId === workshop._id,
            )
            const confirmedCount =
              live?.confirmedSignups ??
              (workshop.signups ||
                workshopSignups.filter((s) => s.status === 'confirmed').length)
            const waitlistCount =
              live?.waitlistSignups ??
              (workshop.waitlistCount ||
                workshopSignups.filter((s) => s.status === 'waitlist').length)
            const capacity = live?.capacity ?? workshop.capacity

            return (
              <WorkshopCard
                key={workshop._id}
                workshop={{ ...workshop, capacity }}
                confirmedCount={confirmedCount}
                waitlistCount={waitlistCount}
                onViewConfirmed={() =>
                  setSignupModal({
                    isOpen: true,
                    workshopId: workshop._id,
                    workshopTitle: workshop.title,
                    status: 'confirmed' as WorkshopSignupStatus,
                  })
                }
                onViewWaitlist={() =>
                  setSignupModal({
                    isOpen: true,
                    workshopId: workshop._id,
                    workshopTitle: workshop.title,
                    status: 'waitlist' as WorkshopSignupStatus,
                  })
                }
                onAddParticipant={() =>
                  setAddParticipantModal({
                    isOpen: true,
                    workshopId: workshop._id,
                    workshopTitle: workshop.title,
                  })
                }
                onEditCapacity={() => {
                  setEditCapacityModal({
                    isOpen: true,
                    workshopId: workshop._id,
                    workshopTitle: workshop.title,
                    currentCapacity: capacity || 30,
                    currentSignups: confirmedCount,
                  })
                }}
                onAnnounce={() =>
                  setAnnounceModal({
                    isOpen: true,
                    workshopId: workshop._id,
                    workshopTitle: workshop.title,
                    confirmedCount,
                  })
                }
              />
            )
          })
        )}
      </div>

      <EarlySignupsList
        signups={
          earlySignups.isPlaceholderData
            ? undefined
            : earlySignups.data?.signups
        }
        sponsors={earlySignups.data?.sponsors}
        sponsorId={earlySponsorId}
        onSponsorChange={narrowEarlySignups}
        error={
          earlySignups.error ? 'The early sign-ups could not be read.' : null
        }
        onRetry={() => void earlySignups.refetch()}
      />

      <SignupDetailsModal
        isOpen={signupModal.isOpen}
        onClose={() => {
          setSignupModal({ ...signupModal, isOpen: false })
          // A question left open (#1358) is not asked again on reopening.
          signupActions.dismissFull()
        }}
        workshopTitle={signupModal.workshopTitle}
        status={signupModal.status}
        signups={filteredSignups}
        onConfirmSignup={signupActions.confirm}
        fullRefusal={signupActions.full}
        onConfirmBeyondCapacity={signupActions.confirmBeyondCapacity}
        onDismissFullRefusal={signupActions.dismissFull}
        onMoveToWaitlist={signupActions.moveToWaitlist}
        onDeleteSignup={signupActions.remove}
        isConfirming={signupActions.isConfirming}
        isMoving={signupActions.isMoving}
        isDeleting={signupActions.isDeleting}
      />

      <AddParticipantModal
        isOpen={addParticipantModal.isOpen}
        onClose={() =>
          setAddParticipantModal({ ...addParticipantModal, isOpen: false })
        }
        workshopTitle={addParticipantModal.workshopTitle}
        onSubmit={handleAddParticipant}
        isSubmitting={manualSignupMutation.isPending}
      />

      <EditCapacityModal
        isOpen={editCapacityModal.isOpen}
        onClose={() =>
          setEditCapacityModal({ ...editCapacityModal, isOpen: false })
        }
        workshopTitle={editCapacityModal.workshopTitle}
        currentCapacity={editCapacityModal.currentCapacity}
        currentSignups={editCapacityModal.currentSignups}
        onSubmit={handleUpdateCapacity}
        isSubmitting={updateCapacityMutation.isPending}
      />

      <AnnounceModal
        isOpen={announceModal.isOpen}
        onClose={() => setAnnounceModal({ ...announceModal, isOpen: false })}
        workshopTitle={announceModal.workshopTitle}
        confirmedCount={announceModal.confirmedCount}
        onSubmit={handleAnnounce}
        isSubmitting={announceMutation.isPending}
        announcements={announcementsData?.data ?? []}
        onEditAnnouncement={(announcementId, body) =>
          updateAnnouncementMutation.mutate({ announcementId, body })
        }
        onDeleteAnnouncement={(announcement) =>
          setDeleteAnnouncementTarget(announcement)
        }
        isEditingAnnouncement={updateAnnouncementMutation.isPending}
      />

      <ConfirmationModal
        isOpen={!!deleteAnnouncementTarget}
        onClose={() => setDeleteAnnouncementTarget(null)}
        onConfirm={() =>
          deleteAnnouncementTarget &&
          deleteAnnouncementMutation.mutate({
            announcementId: deleteAnnouncementTarget._id,
          })
        }
        isLoading={deleteAnnouncementMutation.isPending}
        title="Delete announcement"
        message="Are you sure you want to delete this announcement? It will be removed from the workshop page. Participants who already received the email will not be notified."
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  )
}
