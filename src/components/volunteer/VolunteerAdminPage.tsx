'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { api } from '@/lib/trpc/client'
import { formatDateTimeSafe } from '@/lib/time'
import { VolunteerStatus, VolunteerWithConference } from '@/lib/volunteer/types'
import {
  UserGroupIcon,
  EnvelopeIcon,
  PhoneIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  TrashIcon,
  PencilSquareIcon,
  ArrowLeftIcon,
  PaperAirplaneIcon,
  ExclamationTriangleIcon,
  TicketIcon,
  MinusCircleIcon,
  QuestionMarkCircleIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardIcon,
  CheckIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { CheckBadgeIcon } from '@heroicons/react/24/solid'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import { AdminPageHeader } from '@/components/admin'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { VolunteerBulkEmailModal } from './VolunteerBulkEmailModal'
import { sendInChunks } from '@/lib/volunteer/chunkedSend'
import { VolunteerEditModal } from '@/components/volunteer/VolunteerEditModal'
import { VolunteerApprovalModal } from '@/components/volunteer/VolunteerApprovalModal'
import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { AdminButton } from '@/components/admin/AdminButton'
import { TableToolbar } from '@/components/DataTable/TableToolbar'
import { useNotificationSafe } from '@/components/admin/NotificationProvider'
import type { VolunteerTicketStatus } from '@/lib/tickets/volunteerStatus'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import {
  buildVolunteersCsv,
  volunteerLogistics,
  volunteersCsvFilename,
} from '@/lib/volunteer/export'

const volunteerStatusConfig: Record<
  VolunteerStatus,
  {
    color: BadgeColor
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  }
> = {
  [VolunteerStatus.PENDING]: { color: 'yellow', icon: ClockIcon },
  [VolunteerStatus.APPROVED]: { color: 'green', icon: CheckCircleIcon },
  [VolunteerStatus.CONFIRMED]: { color: 'blue', icon: CheckBadgeIcon },
  [VolunteerStatus.REJECTED]: { color: 'red', icon: XCircleIcon },
}

const ticketStatusConfig: Record<
  VolunteerTicketStatus['state'],
  {
    label: string
    color: BadgeColor
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
    className?: string
  }
> = {
  redeemed: {
    label: 'Ticket Claimed',
    color: 'green',
    icon: CheckBadgeIcon,
  },
  invited: {
    label: 'Approval Email Sent',
    color: 'yellow',
    icon: ClockIcon,
  },
  'not-invited': {
    label: 'No Approval Email',
    color: 'gray',
    icon: MinusCircleIcon,
  },
  unknown: {
    label: 'Ticket Unknown',
    color: 'gray',
    icon: QuestionMarkCircleIcon,
    className:
      'border border-dashed border-gray-400 bg-transparent dark:border-gray-500',
  },
}

// Pending first: those are the applications that need an organizer's attention.
const VOLUNTEER_STATUS_LABELS: Record<VolunteerStatus, string> = {
  [VolunteerStatus.PENDING]: 'Pending',
  [VolunteerStatus.APPROVED]: 'Approved',
  [VolunteerStatus.CONFIRMED]: 'Confirmed',
  [VolunteerStatus.REJECTED]: 'Rejected',
}

const STATUS_SORT_ORDER: Record<VolunteerStatus, number> = {
  [VolunteerStatus.PENDING]: 0,
  [VolunteerStatus.APPROVED]: 1,
  [VolunteerStatus.CONFIRMED]: 2,
  [VolunteerStatus.REJECTED]: 3,
}

// Rejected applications are hidden by default; tick "rejected" in the Status
// filter to see them. Clearing filters restores this default.
const DEFAULT_STATUS_FILTER = [
  VolunteerStatus.PENDING,
  VolunteerStatus.APPROVED,
  VolunteerStatus.CONFIRMED,
]

type TicketFilterState =
  'all' | 'redeemed' | 'invited' | 'not-invited' | 'unclaimed'

const TICKET_FILTER_LABELS: Record<TicketFilterState, string> = {
  all: 'All ticket states',
  redeemed: 'Claimed',
  invited: 'Email sent (Unclaimed)',
  'not-invited': 'No email sent',
  unclaimed: 'Not claimed (Chase list)',
}

export default function VolunteerAdminPage() {
  const notify = useNotificationSafe()
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(
    null,
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<Set<VolunteerStatus>>(
    () => new Set(DEFAULT_STATUS_FILTER),
  )
  const [ticketFilter, setTicketFilter] = useState<TicketFilterState>('all')
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false)
  // Ids the "remind to register ticket" confirm is about to send to.
  const [reminderTargets, setReminderTargets] = useState<string[] | null>(null)
  const [emailModalVolunteer, setEmailModalVolunteer] =
    useState<VolunteerWithConference | null>(null)
  const [pendingApprovalReviewNotes, setPendingApprovalReviewNotes] =
    useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [deleteVolunteerId, setDeleteVolunteerId] = useState<string | null>(
    null,
  )
  const [editModalOpen, setEditModalOpen] = useState(false)

  const backButtonRef = useRef<HTMLButtonElement>(null)
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  // Focus target after a selection change: the back button when opening the
  // detail view, the card again when going back. Only matters below lg, where
  // the list and detail swap places and the focused node gets hidden.
  const pendingFocus = useRef<string | 'back' | null>(null)

  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false)
  // Where to go once the admin agrees to drop unsaved review notes.
  const [pendingSelection, setPendingSelection] = useState<{
    id: string | null
  } | null>(null)
  // Switch only after the modal has closed, so its focus restore does not undo ours.
  const confirmedSelection = useRef<{ id: string | null } | null>(null)

  const selectVolunteer = (id: string | null) => {
    if (id !== selectedVolunteerId && reviewNotes.trim()) {
      setPendingSelection({ id })
      return
    }
    switchVolunteer(id)
  }

  const switchVolunteer = (id: string | null) => {
    pendingFocus.current = id ? 'back' : selectedVolunteerId
    setSelectedVolunteerId(id)
    setReviewNotes('')
  }

  useEffect(() => {
    const target = pendingFocus.current
    pendingFocus.current = null
    if (!target) return
    // focus() is a no-op on display:none nodes, so on desktop focus stays put.
    ;(target === 'back'
      ? backButtonRef.current
      : // The card is gone after a delete, or hidden by the filter after a reject.
        (cardRefs.current.get(target) ?? listHeadingRef.current)
    )?.focus()
  }, [selectedVolunteerId])

  const {
    data: volunteers,
    isLoading: loadingList,
    error: listError,
  } = api.volunteer.admin.list.useQuery()

  const {
    data: selectedVolunteer,
    isLoading: loadingDetails,
    error: detailsError,
  } = api.volunteer.admin.getById.useQuery(
    { id: selectedVolunteerId! },
    { enabled: !!selectedVolunteerId },
  )

  const ticketStatusQuery = api.tickets.admin.volunteerTicketStatus.useQuery(
    undefined,
    { retry: false, staleTime: 30_000 },
  )

  const ticketStatuses = useMemo<Record<string, VolunteerTicketStatus>>(() => {
    if (ticketStatusQuery.isError && volunteers) {
      return Object.fromEntries(
        volunteers.map((v) => [
          v._id,
          { volunteerId: v._id, state: 'unknown' as const },
        ]),
      )
    }
    return Object.fromEntries(
      (ticketStatusQuery.data?.statuses ?? []).map((s) => [s.volunteerId, s]),
    )
  }, [ticketStatusQuery.data, ticketStatusQuery.isError, volunteers])

  const utils = api.useUtils()

  const updateVolunteerLinks = api.conference.updateVolunteerLinks.useMutation({
    onSuccess: async (_, variables) => {
      await Promise.all([
        utils.volunteer.admin.list.invalidate(),
        selectedVolunteerId
          ? utils.volunteer.admin.getById.invalidate({
              id: selectedVolunteerId,
            })
          : Promise.resolve(),
      ])
      setEmailModalVolunteer((prev) =>
        prev
          ? {
              ...prev,
              conference: prev.conference
                ? {
                    ...prev.conference,
                    ...(variables.volunteerRegistrationLink !== undefined
                      ? {
                          volunteerRegistrationLink:
                            variables.volunteerRegistrationLink || undefined,
                        }
                      : {}),
                    ...(variables.volunteerSlackInviteUrl !== undefined
                      ? {
                          volunteerSlackInviteUrl:
                            variables.volunteerSlackInviteUrl || undefined,
                        }
                      : {}),
                  }
                : prev.conference,
            }
          : null,
      )
    },
  })

  const updateStatus = api.volunteer.admin.updateStatus.useMutation({
    onSuccess: async (_, variables) => {
      await Promise.all([
        utils.volunteer.admin.list.invalidate(),
        variables.volunteerId
          ? utils.volunteer.admin.getById.invalidate({
              id: variables.volunteerId,
            })
          : Promise.resolve(),
      ])
      setReviewNotes('')
      notify?.showNotification({
        type: 'success',
        title: `Volunteer application marked as ${VOLUNTEER_STATUS_LABELS[variables.status].toLowerCase()}`,
      })
    },
    onError: (err) => {
      notify?.showNotification({
        type: 'error',
        title: 'Failed to update volunteer status',
        message: err.message,
      })
    },
  })

  const sendBulkEmail = api.volunteer.admin.sendBulkEmail.useMutation()

  // Pending volunteers ticked for a bulk approve/reject.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false)
  const bulkUpdateStatus = api.volunteer.admin.bulkUpdateStatus.useMutation()
  const toggleChecked = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const runBulkStatus = async (
    status: VolunteerStatus.APPROVED | VolunteerStatus.REJECTED,
    ids: string[],
  ) => {
    let updated = 0
    let skipped = 0
    try {
      // The server takes at most 50 ids per call.
      for (let i = 0; i < ids.length; i += 50) {
        const res = await bulkUpdateStatus.mutateAsync({
          volunteerIds: ids.slice(i, i + 50),
          status,
        })
        updated += res.updated
        skipped += res.skipped
      }
      setCheckedIds(new Set())
      notify?.showNotification({
        type: 'success',
        title: `${updated} ${updated === 1 ? 'volunteer' : 'volunteers'} marked as ${VOLUNTEER_STATUS_LABELS[status].toLowerCase()}`,
        message: skipped
          ? `${skipped} skipped because they were no longer pending.`
          : undefined,
      })
    } catch (err) {
      notify?.showNotification({
        type: 'error',
        title: 'Failed to update volunteer status',
        message: [
          updated
            ? `${updated} ${updated === 1 ? 'volunteer was' : 'volunteers were'} updated before the error.`
            : '',
          err instanceof Error ? err.message : '',
        ]
          .filter(Boolean)
          .join(' '),
      })
    } finally {
      await utils.volunteer.admin.list.invalidate()
    }
  }

  const sendTicketReminder =
    api.volunteer.admin.sendTicketReminder.useMutation()
  // "Sent 25 of 80" while the reminder chunks go out; null when idle.
  const [reminderProgress, setReminderProgress] = useState<string | null>(null)

  const runTicketReminder = async (ids: string[]) => {
    const total = ids.length
    setReminderProgress(`Sent 0 of ${total}`)
    const res = await sendInChunks(
      ids,
      (volunteerIds) => sendTicketReminder.mutateAsync({ volunteerIds }),
      (done) => setReminderProgress(`Sent ${done} of ${total}`),
    )
    setReminderProgress(null)
    await utils.volunteer.admin.list.invalidate()
    if (selectedVolunteerId) {
      await utils.volunteer.admin.getById.invalidate({
        id: selectedVolunteerId,
      })
    }
    // Keep the dialog open on what is left: failures plus anything unsent.
    // Already reminded volunteers are skipped by the server for 24 hours.
    const left = [...res.failed.map((f) => f.id), ...ids.slice(res.done)]
    setReminderTargets(left.length > 0 ? left : null)
    if (res.error) {
      notify?.showNotification({
        type: 'error',
        title: 'Ticket reminder stopped',
        message: `Stopped after ${res.done} of ${total}: ${res.error.message}. Send again to continue with the rest.`,
      })
    } else if (res.failed.length > 0) {
      notify?.showNotification({
        type: 'warning',
        title: 'Some ticket reminders failed',
        message: `Not sent to: ${res.failed.map((f) => f.email).join(', ')}`,
      })
    } else {
      notify?.showNotification({
        type: 'success',
        title: 'Ticket reminder sent',
        message: `Processed ${total} ${total === 1 ? 'volunteer' : 'volunteers'}`,
      })
    }
  }

  const sendEmail = api.volunteer.admin.sendEmail.useMutation({
    onSuccess: async (data, variables) => {
      setEmailModalOpen(false)
      setEmailModalVolunteer(null)
      await Promise.all([
        utils.volunteer.admin.list.invalidate(),
        utils.tickets.admin.volunteerTicketStatus.invalidate(),
        variables.volunteerId
          ? utils.volunteer.admin.getById.invalidate({
              id: variables.volunteerId,
            })
          : Promise.resolve(),
      ])
      notify?.showNotification({
        type: 'success',
        title: 'Approval email sent successfully',
      })
      if (data?.trackingRecorded === false) {
        notify?.showNotification({
          type: 'warning',
          title: 'Email sent, but tracking not recorded',
          message:
            'The approval email was delivered, but recording the sent timestamp on the volunteer record failed.',
        })
      }
    },
  })

  const deleteVolunteer = api.volunteer.admin.delete.useMutation({
    onSuccess: async (_, variables) => {
      await Promise.all([
        utils.volunteer.admin.list.invalidate(),
        variables.volunteerId
          ? utils.volunteer.admin.getById.invalidate({
              id: variables.volunteerId,
            })
          : Promise.resolve(),
      ])
      if (selectedVolunteerId === variables.volunteerId) {
        switchVolunteer(null)
      }
      setDeleteVolunteerId(null)
      notify?.showNotification({
        type: 'success',
        title: 'Volunteer application deleted',
      })
    },
    onError: (err) => {
      notify?.showNotification({
        type: 'error',
        title: 'Failed to delete volunteer',
        message: err.message,
      })
    },
  })

  const statusFilterIsDefault =
    statusFilter.size === DEFAULT_STATUS_FILTER.length &&
    DEFAULT_STATUS_FILTER.every((s) => statusFilter.has(s))

  // Default filter hides only rejected, so an empty list here means all are rejected.
  const allRejectedHidden =
    !!volunteers?.length &&
    statusFilterIsDefault &&
    ticketFilter === 'all' &&
    !searchQuery.trim() &&
    volunteers.every((v) => v.status === VolunteerStatus.REJECTED)

  // Volunteers come from the current conference only, so suggestions stay tenant-scoped.
  const taskSuggestions = useMemo(
    () =>
      [
        ...new Set((volunteers ?? []).flatMap((v) => v.assignedTasks ?? [])),
      ].sort(),
    [volunteers],
  )

  const filteredVolunteers = useMemo(() => {
    if (!volunteers) return []
    const matches = volunteers.filter((v) => {
      if (statusFilter.size > 0 && !statusFilter.has(v.status)) {
        return false
      }
      if (ticketFilter !== 'all') {
        const ts = ticketStatuses[v._id]
        if (!ts) return false
        if (ticketFilter === 'unclaimed') {
          if (
            (v.status !== VolunteerStatus.APPROVED &&
              v.status !== VolunteerStatus.CONFIRMED) ||
            (ts.state !== 'invited' && ts.state !== 'not-invited')
          ) {
            return false
          }
        } else if (ts.state !== ticketFilter) {
          return false
        }
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const matchesName = v.name.toLowerCase().includes(query)
        const matchesEmail = v.email.toLowerCase().includes(query)
        const matchesPhone = v.phone
          ? v.phone.toLowerCase().includes(query)
          : false
        const matchesOccupation = v.occupation
          ? v.occupation.toLowerCase().includes(query)
          : false
        const matchesTasks = [
          ...(v.preferredTasks ?? []),
          ...(v.assignedTasks ?? []),
        ].some((t) => t?.toLowerCase().includes(query))

        if (
          !matchesName &&
          !matchesEmail &&
          !matchesPhone &&
          !matchesOccupation &&
          !matchesTasks
        ) {
          return false
        }
      }
      return true
    })
    // Array.prototype.sort is stable, so the server order holds within a group.
    return matches.sort(
      (a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status],
    )
  }, [volunteers, statusFilter, ticketFilter, ticketStatuses, searchQuery])

  const visiblePendingIds = filteredVolunteers
    .filter((v) => v.status === VolunteerStatus.PENDING)
    .map((v) => v._id)
  // Only ticked ids that are still pending and visible count; ids hidden by a
  // filter or no longer pending after a refetch are ignored, never acted on.
  const selectedIds = visiblePendingIds.filter((id) => checkedIds.has(id))

  const { copied: copiedAllEmails, copyToClipboard: copyAllEmails } =
    useCopyToClipboard({
      onError: () =>
        notify?.showNotification({
          type: 'error',
          title: 'Copy failed',
          message: 'Could not copy the email addresses to the clipboard.',
        }),
    })

  const filteredEmails = useMemo(() => {
    const seen = new Set<string>()
    const emails: string[] = []
    for (const volunteer of filteredVolunteers) {
      const email = volunteer.email?.trim()
      if (!email) continue
      const key = email.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        emails.push(email)
      }
    }
    return emails
  }, [filteredVolunteers])
  // Approved/confirmed volunteers whose ticket is known not to be redeemed.
  // The server recomputes this; the count only drives the confirm text.
  const isReminderEligible = useCallback(
    (v: { _id: string; status: VolunteerStatus }) => {
      const state = ticketStatuses[v._id]?.state
      return (
        (v.status === VolunteerStatus.APPROVED ||
          v.status === VolunteerStatus.CONFIRMED) &&
        (state === 'invited' || state === 'not-invited')
      )
    },
    [ticketStatuses],
  )
  const reminderEligibleIds = useMemo(
    () => filteredVolunteers.filter(isReminderEligible).map((v) => v._id),
    [filteredVolunteers, isReminderEligible],
  )
  const emailCountLabel = `${filteredEmails.length} ${filteredEmails.length === 1 ? 'email' : 'emails'}`

  const stats = useMemo(() => {
    if (!volunteers)
      return {
        total: '…',
        pending: '…',
        approved: '…',
        confirmed: '…',
        rejected: '…',
        claimed: '…',
      }
    const claimed = volunteers.filter(
      (v) => ticketStatuses[v._id]?.state === 'redeemed',
    ).length
    return {
      total: volunteers.length,
      pending: volunteers.filter((v) => v.status === VolunteerStatus.PENDING)
        .length,
      approved: volunteers.filter(
        (v) =>
          v.status === VolunteerStatus.APPROVED ||
          v.status === VolunteerStatus.CONFIRMED,
      ).length,
      confirmed: volunteers.filter(
        (v) => v.status === VolunteerStatus.CONFIRMED,
      ).length,
      rejected: volunteers.filter((v) => v.status === VolunteerStatus.REJECTED)
        .length,
      claimed,
    }
  }, [volunteers, ticketStatuses])

  const logistics = useMemo(
    () => volunteerLogistics(volunteers ?? []),
    [volunteers],
  )

  // Same Blob download as SponsorContactActions' contact export.
  const exportCsv = () => {
    const url = URL.createObjectURL(
      new Blob([buildVolunteersCsv(filteredVolunteers, ticketStatuses)], {
        type: 'text/csv;charset=utf-8;',
      }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = volunteersCsvFilename(
      volunteers?.[0]?.conference.title ?? '',
    )
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Delayed revoke: revoking synchronously can truncate the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleStatusUpdate = async (status: VolunteerStatus) => {
    if (!selectedVolunteerId) return
    await updateStatus.mutateAsync({
      volunteerId: selectedVolunteerId,
      status,
      reviewNotes: reviewNotes || undefined,
    })
  }

  const handleOpenApprovalModal = (volunteer: VolunteerWithConference) => {
    setPendingApprovalReviewNotes(reviewNotes)
    setEmailModalVolunteer(volunteer)
    setEmailModalOpen(true)
  }

  const handleSaveVolunteerLinks = async (links: {
    ticketUrl: string
    slackInviteUrl: string
  }) => {
    try {
      await updateVolunteerLinks.mutateAsync({
        volunteerRegistrationLink: links.ticketUrl.trim() || null,
        volunteerSlackInviteUrl: links.slackInviteUrl.trim() || null,
      })
      notify?.showNotification({
        type: 'success',
        title: 'Volunteer links saved to conference',
      })
    } catch (err) {
      notify?.showNotification({
        type: 'error',
        title: 'Failed to save volunteer links',
        message: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  const handleSendApprovalEmail = async (data: {
    subject: string
    message: string
    ticketUrl?: string
    slackInviteUrl?: string
  }) => {
    if (!emailModalVolunteer) return

    // Auto-persist links (including cleared links -> null) to the conference record if changed
    const conf = emailModalVolunteer.conference
    const nextTicket = data.ticketUrl?.trim() ?? ''
    const nextSlack = data.slackInviteUrl?.trim() ?? ''
    const shouldSaveTicket =
      data.ticketUrl !== undefined &&
      nextTicket !== (conf?.volunteerRegistrationLink ?? '')
    const shouldSaveSlack =
      data.slackInviteUrl !== undefined &&
      nextSlack !== (conf?.volunteerSlackInviteUrl ?? '')

    if (shouldSaveTicket || shouldSaveSlack) {
      try {
        await updateVolunteerLinks.mutateAsync({
          ...(shouldSaveTicket
            ? { volunteerRegistrationLink: nextTicket || null }
            : {}),
          ...(shouldSaveSlack
            ? { volunteerSlackInviteUrl: nextSlack || null }
            : {}),
        })
      } catch {
        // Best-effort auto-save; do not block sending the approval email
      }
    }

    // If volunteer is not yet approved or confirmed (pending or rejected), approve them first
    if (
      emailModalVolunteer.status !== VolunteerStatus.APPROVED &&
      emailModalVolunteer.status !== VolunteerStatus.CONFIRMED
    ) {
      await updateStatus.mutateAsync({
        volunteerId: emailModalVolunteer._id,
        status: VolunteerStatus.APPROVED,
        reviewNotes: pendingApprovalReviewNotes || undefined,
      })
      setEmailModalVolunteer((prev) =>
        prev ? { ...prev, status: VolunteerStatus.APPROVED } : null,
      )
    }

    // Send the email with ticket & slack links
    await sendEmail.mutateAsync({
      volunteerId: emailModalVolunteer._id,
      subject: data.subject,
      message: data.message,
      ticketUrl: data.ticketUrl,
      slackInviteUrl: data.slackInviteUrl,
    })
  }

  const confirmDelete = async () => {
    if (!deleteVolunteerId) return
    await deleteVolunteer.mutateAsync({ volunteerId: deleteVolunteerId })
  }

  const selectedTicketStatus = selectedVolunteer
    ? ticketStatuses[selectedVolunteer._id]
    : undefined

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<UserGroupIcon />}
        title="Volunteer Management"
        description="Review and coordinate volunteer applications for the conference"
        actionItems={[
          {
            label: 'Email Volunteers',
            onClick: () => setBulkEmailOpen(true),
            icon: <EnvelopeIcon className="size-4" />,
            variant: 'secondary',
            disabled: filteredEmails.length === 0,
          },
          {
            label: `Remind to Register Ticket (${reminderEligibleIds.length})`,
            onClick: () => setReminderTargets(reminderEligibleIds),
            icon: <TicketIcon className="size-4" />,
            variant: 'secondary',
            disabled: reminderEligibleIds.length === 0,
          },
          {
            label: 'Export CSV',
            onClick: exportCsv,
            icon: <ArrowDownTrayIcon className="size-4" />,
            variant: 'secondary',
            disabled: filteredVolunteers.length === 0,
          },
        ]}
        stats={[
          {
            value: stats.total,
            label: 'Total Applications',
            color: 'slate',
          },
          {
            value: stats.pending,
            label: 'Pending Review',
            color: 'yellow',
          },
          {
            value: stats.approved,
            label: 'Approved',
            color: 'green',
          },
          {
            value: stats.confirmed,
            label: 'Confirmed',
            color: 'blue',
          },
          {
            value: ticketStatusQuery.isLoading
              ? '…'
              : ticketStatusQuery.isError ||
                  !ticketStatusQuery.data ||
                  ticketStatusQuery.data.available === false ||
                  ticketStatusQuery.data.statuses.some(
                    (s) => s.state === 'unknown',
                  )
                ? '—'
                : stats.claimed,
            label: 'Tickets Claimed',
            color: 'blue',
          },
          {
            value: stats.rejected,
            label: 'Rejected',
            color: 'red',
          },
        ]}
      />

      {logistics.count > 0 && (
        <details className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-gray-900 dark:text-white">
            Logistics: approved + confirmed volunteers ({logistics.count})
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                T-shirt sizes
              </h3>
              <dl className="mt-2 flex flex-wrap gap-2">
                {[
                  ...logistics.sizes,
                  ...(logistics.noSize
                    ? [['Not set', logistics.noSize] as const]
                    : []),
                ].map(([size, count]) => (
                  <div
                    key={size}
                    className="rounded-md bg-gray-100 px-3 py-1.5 text-sm dark:bg-gray-700"
                  >
                    <dt className="inline text-gray-600 dark:text-gray-300">
                      {size}:{' '}
                    </dt>
                    <dd className="inline font-semibold text-gray-900 dark:text-white">
                      {count}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h3 className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                Dietary restrictions ({logistics.dietary.length})
              </h3>
              {logistics.dietary.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  None reported.
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                  {logistics.dietary.map((d, i) => (
                    <li key={i}>
                      <span className="font-medium">{d.name}:</span>{' '}
                      {d.restriction}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </details>
      )}

      <TableToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search volunteers by name, email, task..."
        showClearButton={Boolean(
          searchQuery || !statusFilterIsDefault || ticketFilter !== 'all',
        )}
        onClear={() => {
          setSearchQuery('')
          setStatusFilter(new Set(DEFAULT_STATUS_FILTER))
          setTicketFilter('all')
        }}
        resultCount={filteredVolunteers.length}
        totalCount={volunteers?.length}
        resultLabel="applications"
      >
        <FilterDropdown
          label="Status"
          activeCount={statusFilterIsDefault ? 0 : statusFilter.size}
        >
          {Object.values(VolunteerStatus).map((status) => (
            <FilterOption
              key={status}
              checked={statusFilter.has(status)}
              onClick={() => {
                const newFilter = new Set(statusFilter)
                if (statusFilter.has(status)) {
                  newFilter.delete(status)
                } else {
                  newFilter.add(status)
                }
                setStatusFilter(newFilter)
              }}
            >
              {VOLUNTEER_STATUS_LABELS[status]}
            </FilterOption>
          ))}
        </FilterDropdown>

        <FilterDropdown
          label="Ticket"
          activeCount={ticketFilter !== 'all' ? 1 : 0}
        >
          {(Object.keys(TICKET_FILTER_LABELS) as TicketFilterState[]).map(
            (state) => (
              <FilterOption
                key={state}
                type="radio"
                checked={ticketFilter === state}
                onClick={() => setTicketFilter(state)}
              >
                {TICKET_FILTER_LABELS[state]}
              </FilterOption>
            ),
          )}
        </FilterDropdown>
      </TableToolbar>

      {/* Main Responsive Grid Layout */}
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        {/* Left Column: Applications List (Master) */}
        <div
          className={`space-y-2 lg:col-span-5 xl:col-span-4 ${
            selectedVolunteerId ? 'hidden lg:block' : 'block'
          } ${selectedIds.length > 0 ? 'pb-24' : ''}`}
        >
          <div className="flex items-center justify-between pb-1">
            <h2
              ref={listHeadingRef}
              tabIndex={-1}
              className="text-base font-semibold text-gray-900 focus:outline-none dark:text-white"
            >
              Applications
            </h2>
            <div className="flex items-center gap-1.5">
              {visiblePendingIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCheckedIds(new Set(visiblePendingIds))}
                  className="-my-3 inline-flex min-h-11 cursor-pointer items-center px-1 text-xs font-medium text-brand-cloud-blue hover:underline dark:text-blue-400"
                >
                  Select all visible pending
                </button>
              )}
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {filteredVolunteers.length} showing
              </span>
              {filteredEmails.length > 0 && (
                <button
                  type="button"
                  onClick={() => copyAllEmails(filteredEmails.join(', '))}
                  className="-my-3 -mr-3.5 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  title={
                    copiedAllEmails
                      ? `Copied ${emailCountLabel}!`
                      : `Copy all ${emailCountLabel}`
                  }
                  aria-label={`Copy all ${emailCountLabel}`}
                >
                  {copiedAllEmails ? (
                    <CheckIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  ) : (
                    <ClipboardIcon className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>

          {listError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-300">
                Error loading volunteers: {listError.message}
              </p>
            </div>
          ) : loadingList ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredVolunteers.length === 0 ? (
                <EmptyState
                  icon={UserGroupIcon}
                  title={
                    allRejectedHidden
                      ? 'No active applications'
                      : volunteers && volunteers.length > 0
                        ? 'No matching volunteers'
                        : 'No applications yet'
                  }
                  description={
                    allRejectedHidden
                      ? volunteers.length === 1
                        ? 'The only application is rejected.'
                        : `All ${volunteers.length} applications are rejected.`
                      : volunteers && volunteers.length > 0
                        ? 'Try clearing or modifying your search and status filters.'
                        : 'No volunteer applications have been submitted for this conference.'
                  }
                  action={
                    allRejectedHidden ? (
                      <AdminButton
                        onClick={() =>
                          setStatusFilter(
                            new Set([
                              ...DEFAULT_STATUS_FILTER,
                              VolunteerStatus.REJECTED,
                            ]),
                          )
                        }
                        size="sm"
                      >
                        Show Rejected
                      </AdminButton>
                    ) : volunteers &&
                      volunteers.length > 0 &&
                      (!statusFilterIsDefault ||
                        ticketFilter !== 'all' ||
                        searchQuery) ? (
                      <AdminButton
                        onClick={() => {
                          setSearchQuery('')
                          setStatusFilter(new Set(DEFAULT_STATUS_FILTER))
                          setTicketFilter('all')
                        }}
                        size="sm"
                      >
                        Clear Filters
                      </AdminButton>
                    ) : undefined
                  }
                  className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-8 dark:border-gray-700 dark:bg-gray-800/50"
                />
              ) : (
                filteredVolunteers.map((volunteer) => {
                  const isSelected = selectedVolunteerId === volunteer._id
                  const statusConf = volunteerStatusConfig[volunteer.status]
                  const ticketStatus = ticketStatuses[volunteer._id]
                  const showTicketBadge =
                    ticketStatus &&
                    (volunteer.status === VolunteerStatus.APPROVED ||
                      volunteer.status === VolunteerStatus.CONFIRMED ||
                      ticketStatus.state === 'redeemed' ||
                      ticketStatus.state === 'invited')
                  const ticketConf = showTicketBadge
                    ? ticketStatusConfig[ticketStatus.state]
                    : null

                  const isPending = volunteer.status === VolunteerStatus.PENDING
                  return (
                    <div key={volunteer._id} className="flex items-start gap-1">
                      {isPending ? (
                        <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={checkedIds.has(volunteer._id)}
                            onChange={() => toggleChecked(volunteer._id)}
                            aria-label={`Select ${volunteer.name}`}
                            className="h-4 w-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600"
                          />
                        </label>
                      ) : (
                        visiblePendingIds.length > 0 && (
                          <span className="w-11 shrink-0" />
                        )
                      )}
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) cardRefs.current.set(volunteer._id, el)
                          else cardRefs.current.delete(volunteer._id)
                        }}
                        aria-pressed={isSelected}
                        onClick={() => selectVolunteer(volunteer._id)}
                        className={`block w-full cursor-pointer rounded-lg border p-4 text-left transition-all ${
                          isSelected
                            ? 'border-brand-cloud-blue bg-blue-50/70 shadow-xs dark:border-blue-500 dark:bg-blue-950/30'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-2xs dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                        }`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-gray-900 dark:text-white">
                              {volunteer.name}
                            </span>
                            <span className="mt-1 flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
                              <span className="flex items-center gap-1.5 truncate">
                                <EnvelopeIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                <span className="truncate">
                                  {volunteer.email}
                                </span>
                              </span>
                              {volunteer.phone && (
                                <span className="flex items-center gap-1.5 truncate">
                                  <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                  <span className="truncate">
                                    {volunteer.phone}
                                  </span>
                                </span>
                              )}
                            </span>
                          </span>

                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <StatusBadge
                              label={VOLUNTEER_STATUS_LABELS[volunteer.status]}
                              color={statusConf.color}
                              icon={statusConf.icon}
                            />
                            {ticketConf && (
                              <StatusBadge
                                label={ticketConf.label}
                                color={ticketConf.color}
                                icon={ticketConf.icon}
                                className={ticketConf.className}
                              />
                            )}
                          </span>
                        </span>

                        {(volunteer.assignedTasks?.length ?? 0) > 0 && (
                          <span className="mt-2 flex flex-wrap gap-1">
                            {volunteer.assignedTasks!.map((task, i) => (
                              <span
                                key={`${i}-${task}`}
                                className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300"
                              >
                                {task}
                              </span>
                            ))}
                          </span>
                        )}
                        <span className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs text-gray-500 dark:border-gray-700/50 dark:text-gray-400">
                          <span className="font-medium text-gray-700 capitalize dark:text-gray-300">
                            {volunteer.occupation || 'Volunteer'}
                          </span>
                          <span>
                            {volunteer.submittedAt
                              ? formatDateTimeSafe(volunteer.submittedAt)
                              : ''}
                          </span>
                        </span>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Right Column: Volunteer Details Panel (Detail) */}
        <div
          className={`lg:col-span-7 xl:col-span-8 ${
            selectedVolunteerId ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Mobile Back Button */}
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <button
              ref={backButtonRef}
              type="button"
              onClick={() => selectVolunteer(null)}
              className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-brand-cloud-blue hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to applications
            </button>
          </div>

          {detailsError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-300">
                Error loading volunteer details: {detailsError.message}
              </p>
            </div>
          ) : loadingDetails ? (
            <div className="h-96 animate-pulse rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800" />
          ) : selectedVolunteer ? (
            <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-2xs dark:border-gray-700 dark:bg-gray-800">
              {/* Header & Main Actions */}
              <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-gray-700">
                <div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold break-words text-gray-900 dark:text-white">
                      {selectedVolunteer.name}
                    </h2>
                    <StatusBadge
                      label={VOLUNTEER_STATUS_LABELS[selectedVolunteer.status]}
                      color={
                        volunteerStatusConfig[selectedVolunteer.status].color
                      }
                      icon={
                        volunteerStatusConfig[selectedVolunteer.status].icon
                      }
                    />
                    {selectedTicketStatus &&
                      (selectedVolunteer.status === VolunteerStatus.APPROVED ||
                        selectedVolunteer.status ===
                          VolunteerStatus.CONFIRMED ||
                        selectedTicketStatus.state === 'redeemed' ||
                        selectedTicketStatus.state === 'invited') && (
                        <StatusBadge
                          label={
                            ticketStatusConfig[selectedTicketStatus.state].label
                          }
                          color={
                            ticketStatusConfig[selectedTicketStatus.state].color
                          }
                          icon={
                            ticketStatusConfig[selectedTicketStatus.state].icon
                          }
                          className={
                            ticketStatusConfig[selectedTicketStatus.state]
                              .className
                          }
                        />
                      )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500 capitalize dark:text-gray-400">
                    {selectedVolunteer.occupation || 'Volunteer application'}
                    {selectedVolunteer.submittedAt && (
                      <>
                        {' '}
                        • Submitted{' '}
                        {formatDateTimeSafe(selectedVolunteer.submittedAt)}
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <AdminButton
                    className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                    onClick={() => setEditModalOpen(true)}
                    variant="secondary"
                    size="sm"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    Edit Details
                  </AdminButton>
                  <AdminButton
                    className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                    onClick={() => setDeleteVolunteerId(selectedVolunteer._id)}
                    variant="primary"
                    color="red"
                    size="sm"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Delete
                  </AdminButton>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h3 className="mb-3 text-sm font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-4 sm:grid-cols-2 dark:bg-gray-900/50">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Email Address
                    </span>
                    <div className="mt-0.5">
                      <a
                        href={`mailto:${selectedVolunteer.email}`}
                        className="text-sm font-medium break-all text-brand-cloud-blue hover:underline dark:text-blue-400"
                      >
                        {selectedVolunteer.email}
                      </a>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Phone Number
                    </span>
                    <div className="mt-0.5">
                      {selectedVolunteer.phone ? (
                        <a
                          href={`tel:${selectedVolunteer.phone}`}
                          className="text-sm font-medium text-gray-900 hover:underline dark:text-white"
                        >
                          {selectedVolunteer.phone}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400">
                          None provided
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Volunteer Preferences & Details */}
              <div>
                <h3 className="mb-3 text-sm font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Application Details
                </h3>
                <div className="space-y-4">
                  {/* Preferred Tasks */}
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Preferred Tasks
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {Array.isArray(selectedVolunteer.preferredTasks) &&
                      selectedVolunteer.preferredTasks.length > 0 ? (
                        selectedVolunteer.preferredTasks.map((task, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-700/10 ring-inset dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-400/20"
                          >
                            {task}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-gray-500 italic">
                          No specific tasks selected
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Assigned Tasks */}
                  {(selectedVolunteer.assignedTasks?.length ?? 0) > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Assigned Tasks
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {selectedVolunteer.assignedTasks!.map((task, i) => (
                          <span
                            key={`${i}-${task}`}
                            className="inline-flex items-center rounded-md bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-700/10 ring-inset dark:bg-green-900/30 dark:text-green-300 dark:ring-green-400/20"
                          >
                            {task}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Availability */}
                  {selectedVolunteer.availability && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Availability
                      </span>
                      <p className="mt-1 text-sm text-gray-900 dark:text-gray-200">
                        {selectedVolunteer.availability}
                      </p>
                    </div>
                  )}

                  {/* T-Shirt Size & Dietary Restrictions */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        T-Shirt Size
                      </span>
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                        {selectedVolunteer.tshirtSize || 'Not specified'}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Dietary Restrictions / Allergies
                      </span>
                      <p className="mt-1 text-sm text-gray-900 dark:text-gray-200">
                        {selectedVolunteer.dietaryRestrictions ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                            {selectedVolunteer.dietaryRestrictions}
                          </span>
                        ) : (
                          'None'
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Other Info */}
                  {selectedVolunteer.otherInfo && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Additional Information
                      </span>
                      <p className="mt-1 rounded-md bg-gray-50 p-3 text-sm text-gray-800 dark:bg-gray-900/40 dark:text-gray-300">
                        {selectedVolunteer.otherInfo}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Review History / Status Banner */}
              {selectedVolunteer.status !== VolunteerStatus.PENDING && (
                <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                  <h4 className="text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    Review Information
                  </h4>
                  <div className="mt-2 space-y-1 text-sm">
                    {selectedVolunteer.reviewedBy && (
                      <p className="text-gray-700 dark:text-gray-300">
                        Reviewed by{' '}
                        <span className="font-medium text-gray-900 dark:text-white">
                          {selectedVolunteer.reviewedBy.name}
                        </span>{' '}
                        on{' '}
                        {selectedVolunteer.reviewedAt &&
                          formatDateTimeSafe(selectedVolunteer.reviewedAt)}
                      </p>
                    )}
                    {selectedVolunteer.reviewNotes && (
                      <p className="mt-1 text-gray-600 italic dark:text-gray-400">
                        &quot;{selectedVolunteer.reviewNotes}&quot;
                      </p>
                    )}
                    {(selectedVolunteer.status === VolunteerStatus.APPROVED ||
                      selectedVolunteer.status ===
                        VolunteerStatus.CONFIRMED) && (
                      <div className="space-y-1.5 pt-2">
                        <div>
                          {selectedVolunteer.approvalEmailSentAt ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                              <CheckCircleIcon className="h-4 w-4" />
                              Approval email sent on{' '}
                              {formatDateTimeSafe(
                                selectedVolunteer.approvalEmailSentAt,
                              )}
                              {selectedVolunteer.approvalEmailSentBy && (
                                <>
                                  {' '}
                                  by{' '}
                                  {selectedVolunteer.approvalEmailSentBy.name}
                                </>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                              <ClockIcon className="h-4 w-4" />
                              Approval email has not been sent yet
                            </span>
                          )}
                        </div>
                        {selectedVolunteer.ticketReminderSentAt && (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                              <TicketIcon className="h-4 w-4" />
                              Ticket reminder last sent on{' '}
                              {formatDateTimeSafe(
                                selectedVolunteer.ticketReminderSentAt,
                              )}
                            </span>
                          </div>
                        )}
                        {selectedVolunteer.confirmedAt && (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
                              <CheckBadgeIcon className="h-4 w-4" />
                              Confirmed attendance on{' '}
                              {formatDateTimeSafe(
                                selectedVolunteer.confirmedAt,
                              )}
                            </span>
                          </div>
                        )}
                        {selectedTicketStatus && (
                          <div className="flex flex-wrap items-center gap-2">
                            {selectedTicketStatus.state === 'redeemed' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                                <TicketIcon className="h-4 w-4" />
                                Volunteer ticket claimed
                                {selectedTicketStatus.category
                                  ? ` (${selectedTicketStatus.category})`
                                  : ''}
                              </span>
                            ) : selectedTicketStatus.state === 'unknown' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                                <QuestionMarkCircleIcon className="h-4 w-4" />
                                Ticket claim status unavailable
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                                <TicketIcon className="h-4 w-4" />
                                Volunteer ticket not yet claimed
                              </span>
                            )}
                            {selectedTicketStatus.manageUrl && (
                              <a
                                href={selectedTicketStatus.manageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-brand-cloud-blue hover:underline dark:text-blue-400"
                              >
                                View Ticket Order
                                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Review / Approval Actions Section */}
              <div className="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-700">
                {selectedVolunteer.status === VolunteerStatus.PENDING && (
                  <>
                    <div>
                      <label
                        htmlFor="review-notes"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Review Notes (optional)
                      </label>
                      <textarea
                        id="review-notes"
                        className="mt-1.5 w-full rounded-md border border-gray-300 bg-white p-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-2xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
                        rows={2}
                        placeholder="Internal notes about this applicant..."
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                      {/* Primary Approve Action: Opens Approval Email Dialog */}
                      <AdminButton
                        className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                        onClick={() =>
                          handleOpenApprovalModal(selectedVolunteer)
                        }
                        disabled={updateStatus.isPending}
                        variant="primary"
                        color="green"
                      >
                        <PaperAirplaneIcon className="h-4 w-4" />
                        Approve & Send Email
                      </AdminButton>

                      {/* Secondary: Approve without sending email */}
                      <AdminButton
                        className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                        onClick={() =>
                          handleStatusUpdate(VolunteerStatus.APPROVED)
                        }
                        disabled={updateStatus.isPending}
                        variant="secondary"
                      >
                        Approve without Email
                      </AdminButton>

                      {/* Reject */}
                      <AdminButton
                        className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                        onClick={() => setRejectConfirmOpen(true)}
                        disabled={updateStatus.isPending}
                        variant="primary"
                        color="red"
                      >
                        Reject
                      </AdminButton>
                    </div>
                  </>
                )}

                {(selectedVolunteer.status === VolunteerStatus.APPROVED ||
                  selectedVolunteer.status === VolunteerStatus.CONFIRMED) && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <AdminButton
                      className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                      onClick={() => handleOpenApprovalModal(selectedVolunteer)}
                      variant="primary"
                      color="brand"
                    >
                      <PaperAirplaneIcon className="h-4 w-4" />
                      {selectedVolunteer.approvalEmailSentAt
                        ? 'Resend Approval Email'
                        : 'Send Approval Email'}
                    </AdminButton>

                    {isReminderEligible(selectedVolunteer) && (
                      <AdminButton
                        className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                        onClick={() =>
                          setReminderTargets([selectedVolunteer._id])
                        }
                        variant="secondary"
                      >
                        <TicketIcon className="h-4 w-4" />
                        Remind to Register Ticket
                      </AdminButton>
                    )}

                    {/* For volunteers who confirmed in person instead of via the email link */}
                    {selectedVolunteer.status === VolunteerStatus.APPROVED && (
                      <AdminButton
                        className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                        onClick={() =>
                          handleStatusUpdate(VolunteerStatus.CONFIRMED)
                        }
                        disabled={updateStatus.isPending}
                        variant="secondary"
                      >
                        <CheckBadgeIcon className="h-4 w-4" />
                        Mark Confirmed
                      </AdminButton>
                    )}

                    {selectedVolunteer.status === VolunteerStatus.CONFIRMED && (
                      <AdminButton
                        className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                        onClick={() =>
                          handleStatusUpdate(VolunteerStatus.APPROVED)
                        }
                        disabled={updateStatus.isPending}
                        variant="secondary"
                      >
                        Revert to Approved
                      </AdminButton>
                    )}

                    <AdminButton
                      className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                      onClick={() => setRejectConfirmOpen(true)}
                      disabled={updateStatus.isPending}
                      variant="secondary"
                    >
                      Change to Rejected
                    </AdminButton>
                  </div>
                )}

                {selectedVolunteer.status === VolunteerStatus.REJECTED && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <AdminButton
                      className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                      onClick={() =>
                        handleStatusUpdate(VolunteerStatus.PENDING)
                      }
                      disabled={updateStatus.isPending}
                      variant="secondary"
                    >
                      Reopen as Pending
                    </AdminButton>
                    <AdminButton
                      className="min-h-11 w-full sm:min-h-0 sm:w-auto"
                      onClick={() => handleOpenApprovalModal(selectedVolunteer)}
                      disabled={updateStatus.isPending}
                      variant="primary"
                    >
                      Approve Volunteer
                    </AdminButton>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center dark:border-gray-700 dark:bg-gray-800">
              <UserGroupIcon className="mx-auto h-10 w-10 text-gray-400" />
              <p className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                Select a volunteer from the list to view their application
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Volunteer Approval & Email Modal */}
      {emailModalVolunteer && (
        <VolunteerApprovalModal
          isOpen={emailModalOpen}
          onClose={() => {
            setEmailModalOpen(false)
            setEmailModalVolunteer(null)
          }}
          volunteer={emailModalVolunteer}
          onSend={handleSendApprovalEmail}
          onSaveLinks={handleSaveVolunteerLinks}
          isSavingLinks={updateVolunteerLinks.isPending}
        />
      )}

      {bulkEmailOpen && (
        <VolunteerBulkEmailModal
          isOpen
          onClose={() => setBulkEmailOpen(false)}
          volunteers={filteredVolunteers}
          onSend={(data) =>
            sendBulkEmail.mutateAsync(data).catch(async (e: unknown) => {
              // A deleted volunteer fails the whole chunk; the refetch drops it
              // from the list so a retry goes through.
              await utils.volunteer.admin.list.invalidate()
              throw e
            })
          }
          onComplete={(sent) =>
            notify?.showNotification({
              type: 'success',
              title: 'Volunteer email sent',
              message: `Sent to ${sent} ${sent === 1 ? 'volunteer' : 'volunteers'}`,
            })
          }
        />
      )}

      {/* Edit Volunteer Details Modal */}
      {selectedVolunteer && (
        <VolunteerEditModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          volunteer={selectedVolunteer}
          taskSuggestions={taskSuggestions}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteVolunteerId}
        onClose={() => setDeleteVolunteerId(null)}
        onConfirm={confirmDelete}
        isLoading={deleteVolunteer.isPending}
        title="Delete Volunteer Application"
        message="Are you sure you want to delete this volunteer application? This action cannot be undone."
        confirmButtonText="Delete Application"
        variant="danger"
      />

      <ConfirmationModal
        isOpen={rejectConfirmOpen && !!selectedVolunteer}
        onClose={() => setRejectConfirmOpen(false)}
        onConfirm={async () => {
          try {
            await handleStatusUpdate(VolunteerStatus.REJECTED)
          } finally {
            setRejectConfirmOpen(false)
          }
        }}
        isLoading={updateStatus.isPending}
        title="Reject Volunteer Application"
        message={`Reject the application from ${selectedVolunteer?.name ?? 'this volunteer'}?`}
        confirmButtonText="Reject Application"
        variant="danger"
      />

      {selectedIds.length > 0 && (
        // Hidden below lg while a volunteer's details cover the list.
        <div
          className={`fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 justify-center px-4 ${
            selectedVolunteerId ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div
            role="region"
            aria-label="Bulk actions"
            className="flex w-full max-w-md items-center justify-between gap-2 rounded-full border border-gray-200 bg-white/90 p-1.5 pl-5 shadow-2xl backdrop-blur-md dark:border-gray-700 dark:bg-gray-900/90"
          >
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {selectedIds.length} selected
            </span>
            <div className="flex items-center gap-1">
              <AdminButton
                size="sm"
                color="green"
                onClick={() =>
                  void runBulkStatus(VolunteerStatus.APPROVED, selectedIds)
                }
                disabled={bulkUpdateStatus.isPending}
                className="min-h-11"
              >
                Approve
              </AdminButton>
              <AdminButton
                size="sm"
                color="red"
                onClick={() => setBulkRejectOpen(true)}
                disabled={bulkUpdateStatus.isPending}
                className="min-h-11"
              >
                Reject
              </AdminButton>
              <AdminButton
                size="sm"
                variant="secondary"
                onClick={() => setCheckedIds(new Set())}
                disabled={bulkUpdateStatus.isPending}
                className="min-h-11"
              >
                Clear
              </AdminButton>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={bulkRejectOpen}
        onClose={() => setBulkRejectOpen(false)}
        onConfirm={async () => {
          try {
            await runBulkStatus(VolunteerStatus.REJECTED, selectedIds)
          } finally {
            setBulkRejectOpen(false)
          }
        }}
        isLoading={bulkUpdateStatus.isPending}
        title="Reject Volunteer Applications"
        message={`Reject ${selectedIds.length} pending ${selectedIds.length === 1 ? 'application' : 'applications'}? No email is sent.`}
        confirmButtonText="Reject Applications"
        variant="danger"
      />

      <ConfirmationModal
        isOpen={!!reminderTargets}
        onClose={() => setReminderTargets(null)}
        onConfirm={() => {
          if (reminderTargets) void runTicketReminder(reminderTargets)
        }}
        isLoading={reminderProgress !== null}
        title="Remind to Register Ticket"
        message={
          reminderProgress ??
          `Send a ticket registration reminder to ${reminderTargets?.length ?? 0} ${reminderTargets?.length === 1 ? 'volunteer' : 'volunteers'} who have not registered their ticket? Anyone reminded in the last 24 hours is skipped.`
        }
        confirmButtonText="Send Reminder"
        variant="warning"
      />

      <ConfirmationModal
        isOpen={!!pendingSelection}
        onClose={() => setPendingSelection(null)}
        onConfirm={() => {
          confirmedSelection.current = pendingSelection
          setPendingSelection(null)
        }}
        afterLeave={() => {
          const target = confirmedSelection.current
          confirmedSelection.current = null
          if (target) switchVolunteer(target.id)
        }}
        title="Discard Review Notes"
        message="You have unsaved review notes for this volunteer. Leave and discard them?"
        confirmButtonText="Discard Notes"
        variant="warning"
      />
    </div>
  )
}
