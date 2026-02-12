'use client'

import { useState, useMemo } from 'react'
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
} from '@heroicons/react/24/outline'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import { AdminPageHeader } from '@/components/admin'
import { EmailModal } from '@/components/admin/EmailModal'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { PortableTextBlock } from '@sanity/types'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'

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
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(
    null,
  )
  const [statusFilter, setStatusFilter] = useState<Set<VolunteerStatus>>(
    new Set(),
  )
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailModalVolunteer, setEmailModalVolunteer] =
    useState<VolunteerWithConference | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [deleteVolunteerId, setDeleteVolunteerId] = useState<string | null>(
    null,
  )

  const {
    data: volunteers,
    isLoading: loadingList,
    error: listError,
  } = api.volunteer.list.useQuery({})

  const {
    data: selectedVolunteer,
    isLoading: loadingDetails,
    error: detailsError,
  } = api.volunteer.getById.useQuery(
    { id: selectedVolunteerId! },
    { enabled: !!selectedVolunteerId },
  )

  const utils = api.useUtils()

  const updateStatus = api.volunteer.updateStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.volunteer.list.invalidate(),
        selectedVolunteerId
          ? utils.volunteer.getById.invalidate({ id: selectedVolunteerId })
          : Promise.resolve(),
      ])
      setReviewNotes('')
    },
  })

  const sendEmail = api.volunteer.sendEmail.useMutation({
    onSuccess: () => {
      setEmailModalOpen(false)
      setEmailModalVolunteer(null)
    },
  })

  const deleteVolunteer = api.volunteer.delete.useMutation({
    onSuccess: async () => {
      await utils.volunteer.list.invalidate()
      setSelectedVolunteerId(null)
    },
  })

  const filteredVolunteers = useMemo(() => {
    if (!volunteers) return []
    if (statusFilter.size === 0) return volunteers
    return volunteers.filter((v) => statusFilter.has(v.status))
  }, [volunteers, statusFilter])

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

  const handleSendEmail = async (data: {
    subject: string
    message: PortableTextBlock[]
  }) => {
    if (!emailModalVolunteer) return
    const htmlMessage = portableTextToHTML(
      data.message as unknown as Parameters<typeof portableTextToHTML>[0],
    )
    const plainTextMessage = htmlMessage.replace(/<[^>]*>/g, '')
    await sendEmail.mutateAsync({
      volunteerId: emailModalVolunteer._id,
      subject: data.subject,
      message: plainTextMessage,
    })
  }

  const handleDelete = async (volunteerId: string) => {
    setDeleteVolunteerId(volunteerId)
  }

  const confirmDelete = async () => {
    if (!deleteVolunteerId) return
    await deleteVolunteer.mutateAsync({ volunteerId: deleteVolunteerId })
    setDeleteVolunteerId(null)
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<UserGroupIcon />}
        title="Volunteer Management"
        description="Review and manage volunteer applications for the conference"
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

      <div className="flex items-center gap-4">
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
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
            Volunteer Applications
          </h2>
          {listError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-300">
                Error loading volunteers: {listError.message}
              </p>
            </div>
          ) : loadingList ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredVolunteers.length === 0 ? (
                <div className="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
                  <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                    {volunteers && volunteers.length > 0
                      ? 'No volunteers match your filters'
                      : 'No volunteer applications'}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {volunteers && volunteers.length > 0
                      ? 'Try adjusting your filters to see more results.'
                      : 'No volunteer applications have been submitted yet.'}
                  </p>
                  {volunteers &&
                    volunteers.length > 0 &&
                    statusFilter.size > 0 && (
                      <div className="mt-6">
                        <button
                          onClick={() => setStatusFilter(new Set())}
                          className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        >
                          Clear All Filters
                        </button>
                      </div>
                    )}
                </div>
              ) : (
                filteredVolunteers.map((volunteer) => (
                  <div
                    key={volunteer._id}
                    onClick={() => setSelectedVolunteerId(volunteer._id)}
                    className={`cursor-pointer rounded-lg border p-4 transition-all ${
                      selectedVolunteerId === volunteer._id
                        ? 'border-brand-cloud-blue bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {volunteer.name}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <EnvelopeIcon className="h-3.5 w-3.5" />
                            {volunteer.email}
                          </span>
                          {volunteer.phone && (
                            <span className="flex items-center gap-1">
                              <PhoneIcon className="h-3.5 w-3.5" />
                              {volunteer.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <StatusBadge
                        label={volunteer.status}
                        color={volunteerStatusConfig[volunteer.status].color}
                        icon={volunteerStatusConfig[volunteer.status].icon}
                      />
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {volunteer.occupation && (
                        <div>Occupation: {volunteer.occupation}</div>
                      )}
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                        {volunteer.conference?.title || 'No conference'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
            Volunteer Details
          </h2>
          {detailsError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-300">
                Error loading volunteer details: {detailsError.message}
              </p>
            </div>
          ) : loadingDetails ? (
            <div className="h-96 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ) : selectedVolunteer ? (
            <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
                  Contact Information
                </h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Name:
                    </span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedVolunteer.name}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Email:
                    </span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedVolunteer.email}
                    </span>
                  </div>
                  {selectedVolunteer.phone && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        Phone:
                      </span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {selectedVolunteer.phone}
                      </span>
                    </div>
                  )}
                  {selectedVolunteer.occupation && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        Occupation:
                      </span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {selectedVolunteer.occupation}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
                  Volunteer Information
                </h3>
                <div className="space-y-2 text-sm">
                  {selectedVolunteer.availability && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        Availability:
                      </span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {selectedVolunteer.availability}
                      </span>
                    </div>
                  )}
                  {selectedVolunteer.preferredTasks && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        Preferred Tasks:
                      </span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {selectedVolunteer.preferredTasks}
                      </span>
                    </div>
                  )}
                  {selectedVolunteer.tshirtSize && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        T-Shirt Size:
                      </span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {selectedVolunteer.tshirtSize}
                      </span>
                    </div>
                  )}
                  {selectedVolunteer.dietaryRestrictions && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        Dietary Restrictions:
                      </span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {selectedVolunteer.dietaryRestrictions}
                      </span>
                    </div>
                  )}
                  {selectedVolunteer.otherInfo && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        Other Information:
                      </span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {selectedVolunteer.otherInfo}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
                  Conference
                </h3>
                <div className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {selectedVolunteer.conference?.title || 'Not assigned'}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
                  Status
                </h3>
                <StatusBadge
                  label={selectedVolunteer.status}
                  color={volunteerStatusConfig[selectedVolunteer.status].color}
                  icon={volunteerStatusConfig[selectedVolunteer.status].icon}
                />
              </div>

              {selectedVolunteer.status === VolunteerStatus.PENDING && (
                <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
                    Review Application
                  </h3>
                  <textarea
                    className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-900 placeholder-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                    rows={3}
                    placeholder="Add review notes (optional)"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() =>
                        handleStatusUpdate(VolunteerStatus.APPROVED)
                      }
                      disabled={updateStatus.isPending}
                      className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-600"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() =>
                        handleStatusUpdate(VolunteerStatus.REJECTED)
                      }
                      disabled={updateStatus.isPending}
                      className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {selectedVolunteer.reviewNotes && (
                <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
                    Review Notes
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedVolunteer.reviewNotes}
                  </p>
                  {selectedVolunteer.reviewedBy && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                      Reviewed by {selectedVolunteer.reviewedBy.name} on{' '}
                      {formatDateTimeSafe(selectedVolunteer.reviewedAt!)}
                    </p>
                  )}
                </div>
              )}

              {selectedVolunteer.status === VolunteerStatus.APPROVED && (
                <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    onClick={() => {
                      setEmailModalVolunteer(selectedVolunteer)
                      setEmailModalOpen(true)
                    }}
                    className="w-full rounded-md bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    Send Approval Email
                  </button>
                </div>
              )}

              <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  onClick={() => handleDelete(selectedVolunteer._id)}
                  disabled={deleteVolunteer.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                  {deleteVolunteer.isPending
                    ? 'Deleting...'
                    : 'Delete Volunteer'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center dark:border-gray-700 dark:bg-gray-800">
              <p className="text-gray-500 dark:text-gray-400">
                Select a volunteer to view details
              </p>
            </div>
          )}
        </div>
      </div>

      {emailModalVolunteer && (
        <EmailModal
          isOpen={emailModalOpen}
          onClose={() => {
            setEmailModalOpen(false)
            setEmailModalVolunteer(null)
          }}
          title="Send Approval Email"
          recipientInfo={emailModalVolunteer.email}
          fromAddress={
            emailModalVolunteer.conference?.contactEmail ||
            emailModalVolunteer.conference?.cfpEmail ||
            ''
          }
          onSend={handleSendEmail}
          placeholder={{
            subject: `Welcome to the ${emailModalVolunteer.conference?.title || 'Conference'} Volunteer Team`,
            message: `Dear ${emailModalVolunteer.name},\n\nWe are delighted to confirm that your application to volunteer at ${emailModalVolunteer.conference?.title || 'our conference'} has been approved!\n\nWe will be in touch soon with more details about volunteer orientation and your specific assignments.\n\nThank you for offering your time and support!`,
          }}
        />
      )}

      <ConfirmationModal
        isOpen={!!deleteVolunteerId}
        onClose={() => setDeleteVolunteerId(null)}
        onConfirm={confirmDelete}
        title="Delete Volunteer"
        message="Are you sure you want to delete this volunteer? This action cannot be undone."
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  )
}
