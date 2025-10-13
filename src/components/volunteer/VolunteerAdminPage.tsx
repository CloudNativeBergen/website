'use client'

import { useState, useMemo } from 'react'
import { api } from '@/lib/trpc/client'
import {
  VolunteerStatus,
  VolunteerWithConference
} from '@/lib/volunteer/types'
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
import { EmailModal } from '@/components/admin/EmailModal'
import { PortableTextBlock } from '@sanity/types'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'

export default function VolunteerAdminPage() {
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<Set<VolunteerStatus>>(new Set())
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailModalVolunteer, setEmailModalVolunteer] = useState<VolunteerWithConference | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')

  const { data: volunteers, isLoading: loadingList, error: listError } = api.volunteer.list.useQuery({})

  const { data: selectedVolunteer, isLoading: loadingDetails, error: detailsError } = api.volunteer.getById.useQuery(
    { id: selectedVolunteerId! },
    { enabled: !!selectedVolunteerId }
  )

  const utils = api.useUtils()

  const updateStatus = api.volunteer.updateStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.volunteer.list.invalidate(),
        selectedVolunteerId ? utils.volunteer.getById.invalidate({ id: selectedVolunteerId }) : Promise.resolve(),
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
    return volunteers.filter(v => statusFilter.has(v.status))
  }, [volunteers, statusFilter])

  const stats = useMemo(() => {
    if (!volunteers) return { total: 0, pending: 0, approved: 0, rejected: 0 }
    return {
      total: volunteers.length,
      pending: volunteers.filter(v => v.status === VolunteerStatus.PENDING).length,
      approved: volunteers.filter(v => v.status === VolunteerStatus.APPROVED).length,
      rejected: volunteers.filter(v => v.status === VolunteerStatus.REJECTED).length,
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

  const handleSendEmail = async (data: { subject: string; message: PortableTextBlock[] }) => {
    if (!emailModalVolunteer) return
    const htmlMessage = portableTextToHTML(data.message as unknown as Parameters<typeof portableTextToHTML>[0])
    const plainTextMessage = htmlMessage.replace(/<[^>]*>/g, '')
    await sendEmail.mutateAsync({
      volunteerId: emailModalVolunteer._id,
      subject: data.subject,
      message: plainTextMessage,
    })
  }

  const handleDelete = async (volunteerId: string) => {
    if (!confirm('Are you sure you want to delete this volunteer? This action cannot be undone.')) {
      return
    }
    await deleteVolunteer.mutateAsync({ volunteerId })
  }

  const StatusBadge = ({ status }: { status: VolunteerStatus }) => {
    const config = {
      [VolunteerStatus.PENDING]: {
        icon: ClockIcon,
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      },
      [VolunteerStatus.APPROVED]: {
        icon: CheckCircleIcon,
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      },
      [VolunteerStatus.REJECTED]: {
        icon: XCircleIcon,
        className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      },
    }

    const { icon: Icon, className } = config[status]

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
        <Icon className="h-3.5 w-3.5" />
        {status}
      </span>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
        <div className="flex items-center gap-3 mb-2">
          <UserGroupIcon className="h-8 w-8 text-brand-cloud-blue dark:text-blue-400" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Volunteer Management</h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Review and manage volunteer applications for the conference
        </p>
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">{stats.total}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Applications</div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="text-2xl font-semibold text-yellow-800 dark:text-yellow-300">{stats.pending}</div>
            <div className="text-sm text-yellow-700 dark:text-yellow-400">Pending Review</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
            <div className="text-2xl font-semibold text-green-800 dark:text-green-300">{stats.approved}</div>
            <div className="text-sm text-green-700 dark:text-green-400">Approved</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
            <div className="text-2xl font-semibold text-red-800 dark:text-red-300">{stats.rejected}</div>
            <div className="text-sm text-red-700 dark:text-red-400">Rejected</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <FilterDropdown
          label="Status"
          activeCount={statusFilter.size}
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
              {status}
            </FilterOption>
          ))}
        </FilterDropdown>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Volunteer Applications</h2>
          {listError ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-800 dark:text-red-300 text-sm">Error loading volunteers: {listError.message}</p>
            </div>
          ) : loadingList ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-gray-100 dark:bg-gray-800 animate-pulse h-28 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredVolunteers.map((volunteer) => (
                <div
                  key={volunteer._id}
                  onClick={() => setSelectedVolunteerId(volunteer._id)}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedVolunteerId === volunteer._id
                      ? 'border-brand-cloud-blue bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white">{volunteer.name}</div>
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mt-1">
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
                    <StatusBadge status={volunteer.status} />
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {volunteer.occupation && <div>Occupation: {volunteer.occupation}</div>}
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {volunteer.conference?.title || 'No conference'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Volunteer Details</h2>
          {detailsError ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-800 dark:text-red-300 text-sm">Error loading volunteer details: {detailsError.message}</p>
            </div>
          ) : loadingDetails ? (
            <div className="bg-gray-100 dark:bg-gray-800 animate-pulse h-96 rounded-lg" />
          ) : selectedVolunteer ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Contact Information</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Name:</span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">{selectedVolunteer.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Email:</span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">{selectedVolunteer.email}</span>
                  </div>
                  {selectedVolunteer.phone && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Phone:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">{selectedVolunteer.phone}</span>
                    </div>
                  )}
                  {selectedVolunteer.occupation && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Occupation:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">{selectedVolunteer.occupation}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Volunteer Information</h3>
                <div className="space-y-2 text-sm">
                  {selectedVolunteer.availability && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Availability:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">{selectedVolunteer.availability}</span>
                    </div>
                  )}
                  {selectedVolunteer.preferredTasks && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Preferred Tasks:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">{selectedVolunteer.preferredTasks}</span>
                    </div>
                  )}
                  {selectedVolunteer.tshirtSize && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">T-Shirt Size:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">{selectedVolunteer.tshirtSize}</span>
                    </div>
                  )}
                  {selectedVolunteer.dietaryRestrictions && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Dietary Restrictions:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">{selectedVolunteer.dietaryRestrictions}</span>
                    </div>
                  )}
                  {selectedVolunteer.otherInfo && (
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Other Information:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">{selectedVolunteer.otherInfo}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Conference</h3>
                <div className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{selectedVolunteer.conference?.title || 'Not assigned'}</span>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Status</h3>
                <StatusBadge status={selectedVolunteer.status} />
              </div>

              {selectedVolunteer.status === VolunteerStatus.PENDING && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Review Application</h3>
                  <textarea
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                    rows={3}
                    placeholder="Add review notes (optional)"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleStatusUpdate(VolunteerStatus.APPROVED)}
                      disabled={updateStatus.isPending}
                      className="flex-1 bg-green-600 dark:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(VolunteerStatus.REJECTED)}
                      disabled={updateStatus.isPending}
                      className="flex-1 bg-red-600 dark:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {selectedVolunteer.reviewNotes && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Review Notes</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{selectedVolunteer.reviewNotes}</p>
                  {selectedVolunteer.reviewedBy && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      Reviewed by {selectedVolunteer.reviewedBy.name} on{' '}
                      {new Date(selectedVolunteer.reviewedAt!).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {selectedVolunteer.status === VolunteerStatus.APPROVED && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <button
                    onClick={() => {
                      setEmailModalVolunteer(selectedVolunteer)
                      setEmailModalOpen(true)
                    }}
                    className="w-full bg-brand-cloud-blue dark:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-500 transition-colors"
                  >
                    Send Approval Email
                  </button>
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <button
                  onClick={() => handleDelete(selectedVolunteer._id)}
                  disabled={deleteVolunteer.isPending}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 dark:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  <TrashIcon className="h-4 w-4" />
                  {deleteVolunteer.isPending ? 'Deleting...' : 'Delete Volunteer'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-12 text-center">
              <p className="text-gray-500 dark:text-gray-400">Select a volunteer to view details</p>
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
          fromAddress={emailModalVolunteer.conference?.contact_email || emailModalVolunteer.conference?.cfp_email || ''}
          onSend={handleSendEmail}
          placeholder={{
            subject: `Welcome to the ${emailModalVolunteer.conference?.title || 'Conference'} Volunteer Team`,
            message: `Dear ${emailModalVolunteer.name},\n\nWe are delighted to confirm that your application to volunteer at ${emailModalVolunteer.conference?.title || 'our conference'} has been approved!\n\nWe will be in touch soon with more details about volunteer orientation and your specific assignments.\n\nThank you for offering your time and support!`
          }}
        />
      )}
    </div>
  )
}