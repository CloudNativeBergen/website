'use client'

import { useState, useMemo, useEffect, Fragment } from 'react'
import {
  ErrorDisplay,
  AdminPageHeader,
  SkeletonCard,
} from '@/components/admin'
import { AcademicCapIcon, UserGroupIcon, CheckCircleIcon, XCircleIcon, ClockIcon, XMarkIcon, PlusCircleIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Dialog, Transition } from '@headlessui/react'
import { api } from '@/lib/trpc/client'
import type { WorkshopSignupStatus } from '@/lib/workshop/types'

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

export default function WorkshopAdminPage() {
  const [conferenceId, setConferenceId] = useState<string>('')
  const [signupModal, setSignupModal] = useState<SignupModalState>({
    isOpen: false,
    workshopId: '',
    workshopTitle: '',
    status: null
  })
  const [addParticipantModal, setAddParticipantModal] = useState<AddParticipantModalState>({
    isOpen: false,
    workshopId: '',
    workshopTitle: ''
  })
  const [editCapacityModal, setEditCapacityModal] = useState<EditCapacityModalState>({
    isOpen: false,
    workshopId: '',
    workshopTitle: '',
    currentCapacity: 0,
    currentSignups: 0
  })
  type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
  type OperatingSystem = 'windows' | 'macos' | 'linux'

  const [newParticipant, setNewParticipant] = useState<{
    userName: string
    userEmail: string
    userWorkOSId: string
    experienceLevel: ExperienceLevel
    operatingSystem: OperatingSystem
  }>({
    userName: '',
    userEmail: '',
    userWorkOSId: '',
    experienceLevel: 'intermediate',
    operatingSystem: 'macos'
  })
  const [newCapacity, setNewCapacity] = useState<number>(0)

  // Get conference ID from the domain
  useEffect(() => {
    // Get the conference ID from localStorage or from the API based on domain
    const storedConferenceId = localStorage.getItem('conferenceId')
    if (storedConferenceId) {
      setConferenceId(storedConferenceId)
    } else {
      // For now, use the default conference ID
      setConferenceId('d02570e5-7fb6-46e0-a0a1-d27bbbb0a3b5')
    }
  }, [])

  // Fetch all workshops
  const { data: workshopsData, isLoading: workshopsLoading, error: workshopsError, refetch: refetchWorkshops } =
    api.workshop.listWorkshops.useQuery({
      conferenceId,
      includeCapacity: true,
    }, {
      enabled: !!conferenceId
    })

  // Fetch signups for all workshops
  const { data: signupsData, isLoading: signupsLoading, refetch: refetchSignups } =
    api.workshop.getAllSignups.useQuery({
      conferenceId,
      pageSize: 100,
    }, {
      enabled: !!conferenceId
    })

  // Batch confirm mutation
  const confirmMutation = api.workshop.batchConfirmSignups.useMutation({
    onSuccess: () => {
      refetchSignups()
    },
  })

  // Batch cancel mutation
  const cancelMutation = api.workshop.batchCancelSignups.useMutation({
    onSuccess: () => {
      refetchSignups()
    },
  })

  // Delete mutation
  const deleteMutation = api.workshop.deleteSignup.useMutation({
    onSuccess: () => {
      refetchSignups()
    },
  })

  // Manual signup mutation
  const manualSignupMutation = api.workshop.manualSignupForWorkshop.useMutation({
    onSuccess: () => {
      refetchSignups()
      setAddParticipantModal({
        isOpen: false,
        workshopId: '',
        workshopTitle: ''
      })
      setNewParticipant({
        userName: '',
        userEmail: '',
        userWorkOSId: '',
        experienceLevel: 'intermediate',
        operatingSystem: 'macos'
      })
    },
  })

  // Update capacity mutation
  const updateCapacityMutation = api.workshop.updateWorkshopCapacity.useMutation({
    onSuccess: () => {
      // Refetch all data to show updated capacity
      refetchWorkshops()
      refetchSignups()
      refetchStats()
      setEditCapacityModal({
        isOpen: false,
        workshopId: '',
        workshopTitle: '',
        currentCapacity: 0,
        currentSignups: 0
      })
    },
  })

  // Get workshop statistics
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } =
    api.workshop.getWorkshopSummary.useQuery({
      conferenceId,
    }, {
      enabled: !!conferenceId
    })

  const workshops = workshopsData?.data || []
  const signups = signupsData?.data || []

  // Group signups by workshop
  const signupsByWorkshop = useMemo(() => {
    const grouped = new Map<string, typeof signups>()

    signups.forEach((signup) => {
      const workshopId = signup.workshop._ref || signup.workshop._id
      if (!grouped.has(workshopId)) {
        grouped.set(workshopId, [])
      }
      grouped.get(workshopId)?.push(signup)
    })

    return grouped
  }, [signups])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'waitlist':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircleIcon className="h-4 w-4 text-green-600" />
      case 'waitlist':
        return <ClockIcon className="h-4 w-4 text-blue-600" />
      default:
        return null
    }
  }

  if (!conferenceId || workshopsLoading || signupsLoading || statsLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Workshop Management"
          description="Loading workshop data..."
          icon={<AcademicCapIcon className="h-6 w-6" />}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={4} />
          <SkeletonCard rows={4} />
          <SkeletonCard rows={4} />
        </div>
      </div>
    )
  }

  if (workshopsError) {
    return <ErrorDisplay error={workshopsError} />
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Workshop Management"
        description="Manage workshop signups and capacity"
        icon={<AcademicCapIcon className="h-6 w-6" />}
        stats={statsData ? [
          {
            value: statsData.data.totals.totalWorkshops,
            label: 'Total Workshops',
            color: 'blue' as const,
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
        ] : []}
      />

      {/* Workshop Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {workshops.map((workshop) => {
          const workshopSignups = signupsByWorkshop.get(workshop._id) || []
          const confirmedCount = workshopSignups.filter(s => s.status === 'confirmed').length
          const waitlistCount = workshopSignups.filter(s => s.status === 'waitlist').length
          const capacityPercentage = (confirmedCount / workshop.capacity) * 100

          return (
            <div key={workshop._id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {workshop.title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {workshop.format === 'workshop_120' ? '2 hours' : '4 hours'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditCapacityModal({
                          isOpen: true,
                          workshopId: workshop._id,
                          workshopTitle: workshop.title,
                          currentCapacity: workshop.capacity,
                          currentSignups: confirmedCount
                        })
                        setNewCapacity(workshop.capacity)
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      title="Edit capacity"
                    >
                      <UserGroupIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <span className="font-medium">
                        {confirmedCount}/{workshop.capacity}
                      </span>
                      <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Capacity Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>Capacity</span>
                    <span>{capacityPercentage.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        capacityPercentage >= 90 ? 'bg-red-500' :
                        capacityPercentage >= 70 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(capacityPercentage, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Status Buttons */}
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    onClick={() => setSignupModal({
                      isOpen: true,
                      workshopId: workshop._id,
                      workshopTitle: workshop.title,
                      status: 'confirmed' as WorkshopSignupStatus
                    })}
                    className="flex items-center justify-between px-3 py-2 text-sm bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                  >
                    <span>Confirmed</span>
                    <span className="font-semibold">{confirmedCount}</span>
                  </button>
                  <button
                    onClick={() => setSignupModal({
                      isOpen: true,
                      workshopId: workshop._id,
                      workshopTitle: workshop.title,
                      status: 'waitlist' as WorkshopSignupStatus
                    })}
                    className="flex items-center justify-between px-3 py-2 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <span>Waitlist</span>
                    <span className="font-semibold">{waitlistCount}</span>
                  </button>
                </div>

                {/* Add Participant Button */}
                <div className="mt-4">
                  <button
                    onClick={() => {
                      setAddParticipantModal({
                        isOpen: true,
                        workshopId: workshop._id,
                        workshopTitle: workshop.title
                      })
                      setNewParticipant({
                        userName: '',
                        userEmail: '',
                        userWorkOSId: ''
                      })
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
                  >
                    <PlusCircleIcon className="h-5 w-5" />
                    Add Participant
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>


      {/* Signup Details Modal */}
      <Transition.Root show={signupModal.isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setSignupModal({ ...signupModal, isOpen: false })}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:p-6">
                  <div className="absolute right-0 top-0 pr-4 pt-4">
                    <button
                      type="button"
                      className="rounded-md bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 focus:outline-none"
                      onClick={() => setSignupModal({ ...signupModal, isOpen: false })}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="sm:flex sm:items-start">
                    <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                      <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900 dark:text-white mb-4">
                        {signupModal.workshopTitle} - {signupModal.status ? signupModal.status.charAt(0).toUpperCase() + signupModal.status.slice(1) : ''} Signups
                      </Dialog.Title>

                      {signupModal.status && (
                        <div className="mt-4">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Name
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Email
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Signup Date
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {signups
                                  .filter(s =>
                                    (s.workshop._ref || s.workshop._id) === signupModal.workshopId &&
                                    s.status === signupModal.status
                                  )
                                  .map((signup) => (
                                    <tr key={signup._id}>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                          {signup.userName}
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                          {signup.userEmail}
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(signup.signupDate || signup._createdAt).toLocaleDateString()}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className="flex items-center gap-2">
                                          {signup.status === 'waitlist' && (
                                            <button
                                              onClick={() => {
                                                confirmMutation.mutate({ signupIds: [signup._id], sendEmails: true })
                                                setTimeout(() => refetchSignups(), 500)
                                              }}
                                              className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                                            >
                                              Move to Confirmed
                                            </button>
                                          )}
                                          <button
                                            onClick={() => {
                                              if (confirm(`Are you sure you want to permanently delete ${signup.userName}'s signup?`)) {
                                                deleteMutation.mutate({ signupId: signup._id })
                                                setTimeout(() => refetchSignups(), 500)
                                              }
                                            }}
                                            className="text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                                            title="Delete participant"
                                          >
                                            <TrashIcon className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                            {signups.filter(s =>
                              (s.workshop._ref || s.workshop._id) === signupModal.workshopId &&
                              s.status === signupModal.status
                            ).length === 0 && (
                              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                No {signupModal.status} signups for this workshop
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Add Participant Modal */}
      <Transition.Root show={addParticipantModal.isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setAddParticipantModal({ ...addParticipantModal, isOpen: false })}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                  <div className="absolute right-0 top-0 pr-4 pt-4">
                    <button
                      type="button"
                      className="rounded-md bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 focus:outline-none"
                      onClick={() => setAddParticipantModal({ ...addParticipantModal, isOpen: false })}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  <div>
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900 dark:text-white mb-4">
                      Add Participant to {addParticipantModal.workshopTitle}
                    </Dialog.Title>

                    <div className="space-y-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Name *
                        </label>
                        <input
                          type="text"
                          value={newParticipant.userName}
                          onChange={(e) => setNewParticipant({ ...newParticipant, userName: e.target.value })}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder="John Doe"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Email *
                        </label>
                        <input
                          type="email"
                          value={newParticipant.userEmail}
                          onChange={(e) => setNewParticipant({ ...newParticipant, userEmail: e.target.value })}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder="john@example.com"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          WorkOS ID (optional)
                        </label>
                        <input
                          type="text"
                          value={newParticipant.userWorkOSId}
                          onChange={(e) => setNewParticipant({ ...newParticipant, userWorkOSId: e.target.value })}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder="user_abc123"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Experience Level *
                        </label>
                        <select
                          value={newParticipant.experienceLevel}
                          onChange={(e) => setNewParticipant({ ...newParticipant, experienceLevel: e.target.value as 'beginner' | 'intermediate' | 'advanced' })}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Operating System *
                        </label>
                        <select
                          value={newParticipant.operatingSystem}
                          onChange={(e) => setNewParticipant({ ...newParticipant, operatingSystem: e.target.value as 'windows' | 'macos' | 'linux' })}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                          <option value="windows">Windows</option>
                          <option value="macos">macOS</option>
                          <option value="linux">Linux</option>
                        </select>
                      </div>

                    </div>

                    <div className="mt-6 flex gap-3 justify-end">
                      <button
                        type="button"
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={() => setAddParticipantModal({ ...addParticipantModal, isOpen: false })}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={() => {
                          if (!newParticipant.userName || !newParticipant.userEmail) {
                            alert('Please fill in all required fields')
                            return
                          }

                          manualSignupMutation.mutate({
                            userName: newParticipant.userName,
                            userEmail: newParticipant.userEmail,
                            userWorkOSId: newParticipant.userWorkOSId || `manual_${Date.now()}`,
                            experienceLevel: newParticipant.experienceLevel,
                            operatingSystem: newParticipant.operatingSystem,
                            workshop: {
                              _type: 'reference',
                              _ref: addParticipantModal.workshopId
                            },
                            conference: {
                              _type: 'reference',
                              _ref: conferenceId
                            }
                          })
                        }}
                        disabled={manualSignupMutation.isPending}
                      >
                        {manualSignupMutation.isPending ? 'Adding...' : 'Add Participant'}
                      </button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Edit Capacity Modal */}
      <Transition.Root show={editCapacityModal.isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setEditCapacityModal({ ...editCapacityModal, isOpen: false })}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md sm:p-6">
                  <div className="absolute right-0 top-0 pr-4 pt-4">
                    <button
                      type="button"
                      className="rounded-md bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 focus:outline-none"
                      onClick={() => setEditCapacityModal({ ...editCapacityModal, isOpen: false })}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  <div>
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900 dark:text-white mb-4">
                      Edit Workshop Capacity
                    </Dialog.Title>

                    <div className="mb-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {editCapacityModal.workshopTitle}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Currently {editCapacityModal.currentSignups} confirmed participants
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Maximum Capacity
                        </label>
                        <input
                          type="number"
                          min={editCapacityModal.currentSignups}
                          value={newCapacity}
                          onChange={(e) => setNewCapacity(parseInt(e.target.value) || 0)}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                        {newCapacity < editCapacityModal.currentSignups && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                            Capacity cannot be less than current signups ({editCapacityModal.currentSignups})
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Available spots: {Math.max(0, newCapacity - editCapacityModal.currentSignups)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex gap-3 justify-end">
                      <button
                        type="button"
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={() => setEditCapacityModal({ ...editCapacityModal, isOpen: false })}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => {
                          if (newCapacity < editCapacityModal.currentSignups) {
                            alert(`Capacity cannot be less than current signups (${editCapacityModal.currentSignups})`)
                            return
                          }

                          updateCapacityMutation.mutate({
                            workshopId: editCapacityModal.workshopId,
                            capacity: newCapacity
                          })
                        }}
                        disabled={updateCapacityMutation.isPending || newCapacity < editCapacityModal.currentSignups}
                      >
                        {updateCapacityMutation.isPending ? 'Updating...' : 'Update Capacity'}
                      </button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </div>
  )
}