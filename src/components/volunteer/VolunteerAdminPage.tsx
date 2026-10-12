'use client'

import { useState, useMemo } from 'react'
import { api } from '@/lib/trpc/client'
import { formatDateTimeSafe } from '@/lib/time'
import {
  VolunteerStatus,
  VolunteerWithConference,
} from '@/lib/volunteer/types'
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
} from '@heroicons/react/24/outline'
import {
  FilterDropdown,
  FilterOption,
} from '@/components/admin/FilterDropdown'
import { AdminPageHeader } from '@/components/admin'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { VolunteerEditModal } from '@/components/volunteer/VolunteerEditModal'
import { VolunteerApprovalModal } from '@/components/volunteer/VolunteerApprovalModal'
import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { AdminButton } from '@/components/admin/AdminButton'
import { TableToolbar } from '@/components/DataTable/TableToolbar'
import { useNotificationSafe } from '@/components/admin/NotificationProvider'

const volunteerStatusConfig: Record<
  VolunteerStatus,
  {
    color: BadgeColor
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  }
> = {
  [VolunteerStatus.PENDING]: { color: 'yellow', icon: ClockIcon },
  [VolunteerStatus.APPROVED]: { color: 'green', icon: CheckCircleIcon },
  [VolunteerStatus.REJECTED]: { color: 'red', icon: XCircleIcon },
}

export default function VolunteerAdminPage() {
  const notify = useNotificationSafe()
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(
    null,
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<Set<VolunteerStatus>>(
    new Set(),
  )
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailModalVolunteer, setEmailModalVolunteer] =
    useState<VolunteerWithConference | null>(null)
  const [pendingApprovalReviewNotes, setPendingApprovalReviewNotes] =
    useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [deleteVolunteerId, setDeleteVolunteerId] = useState<string | null>(
    null,
  )
  const [editModalOpen, setEditModalOpen] = useState(false)

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

  const utils = api.useUtils()

  const updateStatus = api.volunteer.admin.updateStatus.useMutation({
    onSuccess: async (_, variables) => {
      await Promise.all([
        utils.volunteer.admin.list.invalidate(),
        selectedVolunteerId
          ? utils.volunteer.admin.getById.invalidate({
              id: selectedVolunteerId,
            })
          : Promise.resolve(),
      ])
      setReviewNotes('')
      notify?.showNotification({
        type: 'success',
        title: `Volunteer application marked as ${variables.status}`,
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

  const sendEmail = api.volunteer.admin.sendEmail.useMutation({
    onSuccess: async () => {
      setEmailModalOpen(false)
      setEmailModalVolunteer(null)
      await Promise.all([
        utils.volunteer.admin.list.invalidate(),
        selectedVolunteerId
          ? utils.volunteer.admin.getById.invalidate({
              id: selectedVolunteerId,
            })
          : Promise.resolve(),
      ])
      notify?.showNotification({
        type: 'success',
        title: 'Approval email sent successfully',
      })
    },
    onError: (err) => {
      notify?.showNotification({
        type: 'error',
        title: 'Failed to send approval email',
        message: err.message,
      })
    },
  })

  const deleteVolunteer = api.volunteer.admin.delete.useMutation({
    onSuccess: async () => {
      await utils.volunteer.admin.list.invalidate()
      setSelectedVolunteerId(null)
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

  const filteredVolunteers = useMemo(() => {
    if (!volunteers) return []
    return volunteers.filter((v) => {
      if (statusFilter.size > 0 && !statusFilter.has(v.status)) {
        return false
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesName = v.name.toLowerCase().includes(query)
        const matchesEmail = v.email.toLowerCase().includes(query)
        const matchesPhone = v.phone ? v.phone.toLowerCase().includes(query) : false
        const matchesOccupation = v.occupation
          ? v.occupation.toLowerCase().includes(query)
          : false
        const matchesTasks = Array.isArray(v.preferredTasks)
          ? v.preferredTasks.some((t) => t.toLowerCase().includes(query))
          : false

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
  }, [volunteers, statusFilter, searchQuery])

  const stats = useMemo(() => {
    if (!volunteers) return { total: 0, pending: 0, approved: 0, rejected: 0 }
    return {
      total: volunteers.length,
      pending: volunteers.filter((v) => v.status === VolunteerStatus.PENDING)
        .length,
      approved: volunteers.filter((v) => v.status === VolunteerStatus.APPROVED)
        .length,
      rejected: volunteers.filter((v) => v.status === VolunteerStatus.REJECTED)
        .length,
    }
  }, [volunteers])

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

  const handleSendApprovalEmail = async (data: {
    subject: string
    message: string
    ticketUrl?: string
    slackInviteUrl?: string
  }) => {
    if (!emailModalVolunteer) return

    // If volunteer is still pending, approve them first
    if (emailModalVolunteer.status === VolunteerStatus.PENDING) {
      await updateStatus.mutateAsync({
        volunteerId: emailModalVolunteer._id,
        status: VolunteerStatus.APPROVED,
        reviewNotes: pendingApprovalReviewNotes || undefined,
      })
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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<UserGroupIcon />}
        title="Volunteer Management"
        description="Review and coordinate volunteer applications for the conference"
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
            value: stats.rejected,
            label: 'Rejected',
            color: 'red',
          },
        ]}
      />

      <TableToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search volunteers by name, email, task..."
        showClearButton={Boolean(searchQuery || statusFilter.size > 0)}
        onClear={() => {
          setSearchQuery('')
          setStatusFilter(new Set())
        }}
        resultCount={filteredVolunteers.length}
        totalCount={volunteers?.length}
        resultLabel="applications"
      >
        <FilterDropdown label="Status" activeCount={statusFilter.size}>
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
              {status}
            </FilterOption>
          ))}
        </FilterDropdown>
      </TableToolbar>

      {/* Main Responsive Grid Layout */}
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        {/* Left Column: Applications List (Master) */}
        <div
          className={`space-y-2 lg:col-span-5 xl:col-span-4 ${
            selectedVolunteerId ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Applications
            </h2>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {filteredVolunteers.length} showing
            </span>
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
                    volunteers && volunteers.length > 0
                      ? 'No matching volunteers'
                      : 'No applications yet'
                  }
                  description={
                    volunteers && volunteers.length > 0
                      ? 'Try clearing or modifying your search and status filters.'
                      : 'No volunteer applications have been submitted for this conference.'
                  }
                  action={
                    volunteers &&
                    volunteers.length > 0 &&
                    (statusFilter.size > 0 || searchQuery) ? (
                      <AdminButton
                        onClick={() => {
                          setSearchQuery('')
                          setStatusFilter(new Set())
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

                  return (
                    <div
                      key={volunteer._id}
                      onClick={() => setSelectedVolunteerId(volunteer._id)}
                      className={`cursor-pointer rounded-lg border p-4 transition-all ${
                        isSelected
                          ? 'border-brand-cloud-blue bg-blue-50/70 shadow-xs dark:border-blue-500 dark:bg-blue-950/30'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-2xs dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold text-gray-900 dark:text-white">
                            {volunteer.name}
                          </h3>
                          <div className="mt-1 flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
                            <span className="flex items-center gap-1.5 truncate">
                              <EnvelopeIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                              <span className="truncate">{volunteer.email}</span>
                            </span>
                            {volunteer.phone && (
                              <span className="flex items-center gap-1.5 truncate">
                                <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                <span className="truncate">{volunteer.phone}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <StatusBadge
                          label={volunteer.status}
                          color={statusConf.color}
                          icon={statusConf.icon}
                        />
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs text-gray-500 dark:border-gray-700/50 dark:text-gray-400">
                        <span className="capitalize font-medium text-gray-700 dark:text-gray-300">
                          {volunteer.occupation || 'Volunteer'}
                        </span>
                        <span>
                          {volunteer.submittedAt
                            ? formatDateTimeSafe(volunteer.submittedAt)
                            : ''}
                        </span>
                      </div>
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
              type="button"
              onClick={() => setSelectedVolunteerId(null)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-cloud-blue hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
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
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {selectedVolunteer.name}
                    </h2>
                    <StatusBadge
                      label={selectedVolunteer.status}
                      color={
                        volunteerStatusConfig[selectedVolunteer.status].color
                      }
                      icon={
                        volunteerStatusConfig[selectedVolunteer.status].icon
                      }
                    />
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

                <div className="flex items-center gap-2">
                  <AdminButton
                    onClick={() => setEditModalOpen(true)}
                    variant="secondary"
                    size="sm"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                    Edit Details
                  </AdminButton>
                  <AdminButton
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
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
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
                        className="text-sm font-medium text-brand-cloud-blue hover:underline dark:text-blue-400"
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
                        <span className="text-sm text-gray-400">None provided</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Volunteer Preferences & Details */}
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
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
                            className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-400/20"
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
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
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
                    {selectedVolunteer.status === VolunteerStatus.APPROVED && (
                      <div className="pt-2">
                        {selectedVolunteer.approvalEmailSentAt ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                            <CheckCircleIcon className="h-4 w-4" />
                            Approval email sent on{' '}
                            {formatDateTimeSafe(
                              selectedVolunteer.approvalEmailSentAt,
                            )}
                            {selectedVolunteer.approvalEmailSentBy && (
                              <> by {selectedVolunteer.approvalEmailSentBy.name}</>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                            <ClockIcon className="h-4 w-4" />
                            Approval email has not been sent yet
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Review / Approval Actions Section */}
              <div className="border-t border-gray-200 pt-5 dark:border-gray-700">
                {selectedVolunteer.status === VolunteerStatus.PENDING && (
                  <div className="space-y-4">
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

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Primary Approve Action: Opens Approval Email Dialog */}
                      <AdminButton
                        onClick={() => handleOpenApprovalModal(selectedVolunteer)}
                        disabled={updateStatus.isPending}
                        variant="primary"
                        color="green"
                      >
                        <PaperAirplaneIcon className="h-4 w-4" />
                        Approve & Send Email
                      </AdminButton>

                      {/* Secondary: Approve without sending email */}
                      <AdminButton
                        onClick={() => handleStatusUpdate(VolunteerStatus.APPROVED)}
                        disabled={updateStatus.isPending}
                        variant="secondary"
                      >
                        Approve without Email
                      </AdminButton>

                      {/* Reject */}
                      <AdminButton
                        onClick={() => handleStatusUpdate(VolunteerStatus.REJECTED)}
                        disabled={updateStatus.isPending}
                        variant="primary"
                        color="red"
                      >
                        Reject
                      </AdminButton>
                    </div>
                  </div>
                )}

                {selectedVolunteer.status === VolunteerStatus.APPROVED && (
                  <div className="flex flex-wrap items-center gap-3">
                    <AdminButton
                      onClick={() => handleOpenApprovalModal(selectedVolunteer)}
                      variant="primary"
                      color="brand"
                    >
                      <PaperAirplaneIcon className="h-4 w-4" />
                      {selectedVolunteer.approvalEmailSentAt
                        ? 'Resend Approval Email'
                        : 'Send Approval Email'}
                    </AdminButton>

                    <AdminButton
                      onClick={() => handleStatusUpdate(VolunteerStatus.REJECTED)}
                      disabled={updateStatus.isPending}
                      variant="secondary"
                    >
                      Change to Rejected
                    </AdminButton>
                  </div>
                )}

                {selectedVolunteer.status === VolunteerStatus.REJECTED && (
                  <div className="flex flex-wrap items-center gap-3">
                    <AdminButton
                      onClick={() => handleStatusUpdate(VolunteerStatus.PENDING)}
                      disabled={updateStatus.isPending}
                      variant="secondary"
                    >
                      Reopen as Pending
                    </AdminButton>
                    <AdminButton
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
        />
      )}

      {/* Edit Volunteer Details Modal */}
      {selectedVolunteer && (
        <VolunteerEditModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          volunteer={selectedVolunteer}
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
    </div>
  )
}
