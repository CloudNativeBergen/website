'use client'

import { useState, useMemo } from 'react'
import { AcademicCapIcon } from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin'
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
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import type {
  WorkshopSignupStatus,
  ProposalWithWorkshopData,
} from '@/lib/workshop/types'
import type { WorkshopAnnouncementView } from '@/lib/workshop/announcements'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/EmptyState'

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
}

export function WorkshopsClientPage({
  conferenceId,
  initialWorkshops,
}: WorkshopsClientPageProps) {
  const queryClient = useQueryClient()
  const utils = api.useUtils()
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

  const { data: workshopSignupsData, refetch: refetchWorkshopSignups } =
    api.workshop.admin.listSignups.useQuery(
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

  const confirmMutation = api.workshop.admin.batchConfirmSignups.useMutation({
    onSuccess: () => {
      refetchSignups()
      refetchWorkshopSignups()
      refetchStats()
    },
  })

  const deleteMutation = api.workshop.admin.deleteSignup.useMutation({
    onSuccess: () => {
      refetchSignups()
      refetchWorkshopSignups()
      refetchStats()
    },
  })

  const manualSignupMutation = api.workshop.admin.manualSignup.useMutation({
    onSuccess: () => {
      refetchSignups()
      refetchWorkshopSignups()
      refetchStats()
      setAddParticipantModal({
        isOpen: false,
        workshopId: '',
        workshopTitle: '',
      })
    },
  })

  const updateCapacityMutation = api.workshop.admin.updateCapacity.useMutation({
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: [['workshop', 'list']],
      })
      refetchSignups()
      refetchStats()

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
  })

  const { data: announcementsData } = api.workshop.announcements.useQuery(
    { workshopId: announceModal.workshopId },
    { enabled: announceModal.isOpen && !!announceModal.workshopId },
  )

  const announceMutation = api.workshop.announce.useMutation({
    onSuccess: (result) => {
      utils.workshop.announcements.invalidate({
        workshopId: announceModal.workshopId,
      })
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
        utils.workshop.announcements.invalidate({
          workshopId: announceModal.workshopId,
        })
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
        utils.workshop.announcements.invalidate({
          workshopId: announceModal.workshopId,
        })
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

  const handleConfirmSignup = (signupId: string, userName: string) => {
    confirmMutation.mutate(
      {
        signupIds: [signupId],
        sendEmails: true,
      },
      {
        onSuccess: () => {
          alert(`✅ ${userName} confirmed! Confirmation email sent.`)
        },
      },
    )
  }

  // Confirmation is handled inside SignupDetailsModal (its own ConfirmationModal
  // gates this destructive action), so this runs only after the admin confirms.
  const handleDeleteSignup = (signupId: string) => {
    deleteMutation.mutate({ signupId })
  }

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
      conference: {
        _type: 'reference',
        _ref: conferenceId,
      },
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
            const confirmedCount =
              workshop.signups ||
              workshopSignups.filter((s) => s.status === 'confirmed').length
            const waitlistCount =
              workshop.waitlistCount ||
              workshopSignups.filter((s) => s.status === 'waitlist').length

            return (
              <WorkshopCard
                key={workshop._id}
                workshop={workshop}
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
                  const capacity = workshop.capacity || 30
                  setEditCapacityModal({
                    isOpen: true,
                    workshopId: workshop._id,
                    workshopTitle: workshop.title,
                    currentCapacity: capacity,
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

      <SignupDetailsModal
        isOpen={signupModal.isOpen}
        onClose={() => setSignupModal({ ...signupModal, isOpen: false })}
        workshopTitle={signupModal.workshopTitle}
        status={signupModal.status}
        signups={filteredSignups}
        onConfirmSignup={handleConfirmSignup}
        onDeleteSignup={handleDeleteSignup}
        isConfirming={confirmMutation.isPending}
        isDeleting={deleteMutation.isPending}
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
