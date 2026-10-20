'use client'

import { useState, type ReactNode } from 'react'
import {
  AcademicCapIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
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
import { SponsorEarlyAccessCard } from './SponsorEarlyAccessCard'
import { WorkshopSection } from './WorkshopSection'
import { TicketsAttentionContext } from './attention'
import { WORKSHOP_TICKETS_ANCHOR } from './tickets/anchor'
import { WorkshopScheduleGrid } from './WorkshopScheduleGrid'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  WorkshopReminderButton,
  type LastWorkshopReminder,
} from './WorkshopReminderButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import {
  WorkshopSignupStatus,
  type ProposalWithWorkshopData,
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
  TICKET_HOLDERS_ANCHOR,
  TicketHolderContext,
  TicketHolderPanel,
  ticketHolderView,
  useRereadTicketHolders,
} from './holders'

interface WorkshopRef {
  workshopId: string
  workshopTitle: string
}

/**
 * A dialog and what it is about. What it was about is kept after it closes,
 * so the dialog does not empty while it fades out.
 */
function useDialog<T>() {
  const [about, setAbout] = useState<T | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  return {
    about,
    isOpen,
    open: (value: T) => {
      setAbout(value)
      setIsOpen(true)
    },
    close: () => setIsOpen(false),
  }
}

interface WorkshopsClientPageProps {
  conferenceId: string
  initialWorkshops: ProposalWithWorkshopData[]
  workshopRegistrationSponsorStart?: string
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
  /** Why the reminder is unavailable, or null when it can be used. */
  reminderDisabledReason: string | null
  /** The last reminder, as the conference stores it. */
  lastReminder: LastWorkshopReminder | null
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
  reminderDisabledReason,
  lastReminder,
  ticketsSection,
}: WorkshopsClientPageProps) {
  const queryClient = useQueryClient()
  const { showNotification } = useNotification()
  const signupDialog = useDialog<
    WorkshopRef & { status: WorkshopSignupStatus }
  >()
  const addDialog = useDialog<WorkshopRef>()
  const capacityDialog = useDialog<
    WorkshopRef & { currentCapacity: number; currentSignups: number }
  >()
  const announceDialog = useDialog<WorkshopRef & { confirmedCount: number }>()
  const [deleteAnnouncementTarget, setDeleteAnnouncementTarget] =
    useState<WorkshopAnnouncementView | null>(null)

  // The open workshop's sign-ups, read for the dialog: the server lists them
  // all, where a general read of the conference's would stop at a page.
  const workshopSignups = api.workshop.admin.listSignups.useQuery(
    {
      workshopId: signupDialog.about?.workshopId ?? '',
      status: signupDialog.about?.status,
    },
    { enabled: !!signupDialog.about },
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
  const flaggedCount =
    holderView.state === 'ready' ? holderView.stats.flagged.length : 0
  // Told by the "Workshop tickets" card (see `TicketsAttentionContext`).
  const [ticketsNeedDecision, setTicketsNeedDecision] = useState(false)
  const rereadTicketHolders = useRereadTicketHolders()

  // THE "EARLY SIGN-UPS" LIST (#1348). Narrowing it to a sponsor is a new
  // read with the sponsor in its input: the server narrows, over every match.
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
      addDialog.close()
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
        showNotification({
          type: 'success',
          title: 'Capacity changed',
          message: result.message,
        })
      }

      capacityDialog.close()
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

  const announcedWorkshopId = announceDialog.about?.workshopId ?? ''
  const { data: announcementsData } = api.workshop.announcements.useQuery(
    { workshopId: announcedWorkshopId },
    { enabled: announceDialog.isOpen && !!announcedWorkshopId },
  )
  const notifyFailure = (title: string) => (error: { message: string }) =>
    showNotification({ type: 'error', title, message: error.message })

  const announceMutation = api.workshop.announce.useMutation({
    onSuccess: (result) => {
      refreshAnnouncements(announcedWorkshopId)
      showNotification({
        type: result.failed > 0 ? 'warning' : 'success',
        title: 'Announcement sent',
        message:
          result.failed > 0
            ? `${result.sent} sent, ${result.failed} failed of ${result.recipientCount} confirmed participants.`
            : `Emailed ${result.sent} confirmed participant${result.sent === 1 ? '' : 's'}.`,
      })
    },
    onError: notifyFailure('Could not send announcement'),
  })

  const updateAnnouncementMutation =
    api.workshop.updateAnnouncement.useMutation({
      onSuccess: () => {
        refreshAnnouncements(announcedWorkshopId)
        showNotification({
          type: 'success',
          title: 'Announcement updated',
          message: 'The announcement copy was updated (no email was re-sent).',
        })
      },
      onError: notifyFailure('Could not update announcement'),
    })

  const deleteAnnouncementMutation =
    api.workshop.deleteAnnouncement.useMutation({
      onSuccess: () => {
        setDeleteAnnouncementTarget(null)
        refreshAnnouncements(announcedWorkshopId)
        showNotification({
          type: 'success',
          title: 'Announcement deleted',
          message: 'The announcement was removed from the workshop page.',
        })
      },
      onError: notifyFailure('Could not delete announcement'),
    })

  const handleAddParticipant = (participant: ParticipantFormData) => {
    manualSignupMutation.mutate({
      userName: participant.userName,
      userEmail: participant.userEmail,
      userWorkOSId: participant.userWorkOSId || `manual_${Date.now()}`,
      experienceLevel: participant.experienceLevel,
      operatingSystem: participant.operatingSystem,
      workshop: {
        _type: 'reference',
        _ref: addDialog.about?.workshopId ?? '',
      },
      // No conference reference: the server resolves it from the request
      // domain, so a signup can never target another tenant's conference.
    })
  }

  const handleUpdateCapacity = (capacity: number) => {
    updateCapacityMutation.mutate({
      workshopId: capacityDialog.about?.workshopId ?? '',
      capacity,
    })
  }

  const handleAnnounce = (body: string) => {
    announceMutation.mutate({
      workshopId: announcedWorkshopId,
      body,
    })
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Workshop management"
        description="Sign-ups, seats, ticket access and sponsor early access"
        icon={<AcademicCapIcon className="h-6 w-6" />}
        stats={
          statsData
            ? [
                {
                  value: statsData.data.totals.totalWorkshops,
                  label: 'Total workshops',
                  color: 'blue' as const,
                },
                {
                  value: statsData.data.totals.uniqueParticipants,
                  label: 'Unique participants',
                  color: 'purple' as const,
                },
                {
                  value: statsData.data.totals.totalSignups,
                  label: 'Total sign-ups',
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
          <WorkshopReminderButton
            disabledReason={reminderDisabledReason}
            recipients={holderView}
            lastSent={lastReminder}
          />
        </div>
      </AdminPageHeader>

      {/* ONLY WHEN SOMETHING NEEDS THE ORGANIZER: what the cards further
          down hold, named where it is seen first. */}
      {(ticketsNeedDecision || flaggedCount > 0) && (
        <WorkshopSection
          tone="attention"
          icon={ExclamationTriangleIcon}
          title="Needs attention"
        >
          <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-200">
            {ticketsNeedDecision && (
              <li>
                A ticket type needs a decision before its holders can sign up.{' '}
                <a
                  href={`#${WORKSHOP_TICKETS_ANCHOR}`}
                  className="font-medium underline hover:no-underline"
                >
                  Review workshop tickets
                </a>
              </li>
            )}
            {flaggedCount > 0 && (
              <li>
                {flaggedCount === 1
                  ? '1 person has signed up without a workshop ticket.'
                  : `${flaggedCount} people have signed up without a workshop ticket.`}{' '}
                <a
                  href={`#${TICKET_HOLDERS_ANCHOR}`}
                  className="font-medium underline hover:no-underline"
                >
                  Review ticket holders
                </a>
              </li>
            )}
          </ul>
        </WorkshopSection>
      )}

      <WorkshopSection
        icon={AcademicCapIcon}
        title="Workshops"
        description="Seats, waitlists and announcements, by track and time."
      >
        <div className="mt-4">
          {initialWorkshops.length === 0 ? (
            <EmptyState
              icon={AcademicCapIcon}
              title="No workshops found"
              description="No workshops have been created for this conference yet."
              className="rounded-lg bg-gray-50 p-8 dark:bg-gray-800"
            />
          ) : (
            <WorkshopScheduleGrid
              workshops={initialWorkshops}
              renderCard={(workshop) => {
                // The summary is read again after every action; the server
                // render (`workshop`) never is. Once the summary is in, its
                // numbers are the card's; until then, the server render's.
                const live = statsData?.data.workshops.find(
                  (stats) => stats.workshopId === workshop._id,
                )
                const confirmedCount =
                  live?.confirmedSignups ?? workshop.signups ?? 0
                const waitlistCount =
                  live?.waitlistSignups ?? workshop.waitlistCount ?? 0
                const capacity = live?.capacity ?? workshop.capacity
                const ref = {
                  workshopId: workshop._id,
                  workshopTitle: workshop.title,
                }

                return (
                  <WorkshopCard
                    key={workshop._id}
                    workshop={{ ...workshop, capacity }}
                    confirmedCount={confirmedCount}
                    waitlistCount={waitlistCount}
                    onViewConfirmed={() =>
                      signupDialog.open({
                        ...ref,
                        status: WorkshopSignupStatus.CONFIRMED,
                      })
                    }
                    onViewWaitlist={() =>
                      signupDialog.open({
                        ...ref,
                        status: WorkshopSignupStatus.WAITLIST,
                      })
                    }
                    onAddParticipant={() => addDialog.open(ref)}
                    onEditCapacity={() =>
                      capacityDialog.open({
                        ...ref,
                        currentCapacity: capacity || 30,
                        currentSignups: confirmedCount,
                      })
                    }
                    onAnnounce={() =>
                      announceDialog.open({ ...ref, confirmedCount })
                    }
                  />
                )
              }}
            />
          )}
        </div>
      </WorkshopSection>

      <TicketHolderPanel
        view={holderView}
        onRetry={() => void ticketHolders.refetch()}
        onMoveToWaitlist={signupActions.moveToWaitlist}
        onDeleteSignup={signupActions.remove}
        isMoving={signupActions.isMoving}
        isDeleting={signupActions.isDeleting}
        isRefreshing={ticketHolders.isFetching}
      />

      <SponsorEarlyAccessCard sponsorStart={workshopRegistrationSponsorStart}>
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
      </SponsorEarlyAccessCard>

      {/* SETTINGS: set once, rarely changed. Each card is collapsed until it
          has something to say (the tickets card opens itself when a type
          needs a decision, and "Needs attention" links to it). */}
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <Cog6ToothIcon
            aria-hidden
            className="size-5 text-gray-400 dark:text-gray-500"
          />
          Settings
        </h2>
        <WorkshopRegistrationSettings
          workshopRegistrationSponsorStart={workshopRegistrationSponsorStart}
          workshopRegistrationStart={workshopRegistrationStart}
          workshopRegistrationEnd={workshopRegistrationEnd}
        />
        {/* Rendered by the server; its banner reads the ticket holders this
            page read, and it tells "Needs attention" when a type needs a
            decision, through the contexts. */}
        <TicketHolderContext.Provider value={holderView}>
          <TicketsAttentionContext.Provider value={setTicketsNeedDecision}>
            {ticketsSection}
          </TicketsAttentionContext.Provider>
        </TicketHolderContext.Provider>
      </div>

      <SignupDetailsModal
        isOpen={signupDialog.isOpen}
        onClose={() => {
          signupDialog.close()
          // A question left open (#1358) is not asked again on reopening.
          signupActions.dismissFull()
        }}
        workshopTitle={signupDialog.about?.workshopTitle ?? ''}
        status={signupDialog.about?.status ?? null}
        signups={workshopSignups.data?.data}
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
        isOpen={addDialog.isOpen}
        onClose={addDialog.close}
        workshopTitle={addDialog.about?.workshopTitle ?? ''}
        onSubmit={handleAddParticipant}
        isSubmitting={manualSignupMutation.isPending}
      />

      <EditCapacityModal
        isOpen={capacityDialog.isOpen}
        onClose={capacityDialog.close}
        workshopTitle={capacityDialog.about?.workshopTitle ?? ''}
        currentCapacity={capacityDialog.about?.currentCapacity ?? 0}
        currentSignups={capacityDialog.about?.currentSignups ?? 0}
        onSubmit={handleUpdateCapacity}
        isSubmitting={updateCapacityMutation.isPending}
      />

      <AnnounceModal
        isOpen={announceDialog.isOpen}
        onClose={announceDialog.close}
        workshopTitle={announceDialog.about?.workshopTitle ?? ''}
        confirmedCount={announceDialog.about?.confirmedCount ?? 0}
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
