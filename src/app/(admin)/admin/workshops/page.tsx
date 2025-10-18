'use client'

import { useState, useMemo, useEffect, Fragment } from 'react'
import { ErrorDisplay, AdminPageHeader, SkeletonCard } from '@/components/admin'
import {
  AcademicCapIcon,
  UserGroupIcon,
  XMarkIcon,
  PlusCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { Dialog, Transition } from '@headlessui/react'
import { api } from '@/lib/trpc/client'
import type {
  WorkshopSignupStatus,
  ProposalWithWorkshopData,
} from '@/lib/workshop/types'
import { getWorkshopDuration } from '@/lib/workshop/utils'
import { useQueryClient } from '@tanstack/react-query'

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
  const queryClient = useQueryClient()
  const [conferenceId, setConferenceId] = useState<string>('')
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
    operatingSystem: 'macos',
  })
  const [newCapacity, setNewCapacity] = useState<number>(0)

  useEffect(() => {
    const storedConferenceId = localStorage.getItem('conferenceId')
    if (storedConferenceId) {
      setConferenceId(storedConferenceId)
    } else {
      setConferenceId('d02570e5-7fb6-46e0-a0a1-d27bbbb0a3b5')
    }
  }, [])

  const {
    data: workshopsData,
    isLoading: workshopsLoading,
    error: workshopsError,
    refetch: refetchWorkshops,
  } = api.workshop.listWorkshops.useQuery(
    {
      conferenceId,
      includeCapacity: true,
    },
    {
      enabled: !!conferenceId,
    },
  )

  const {
    data: signupsData,
    isLoading: signupsLoading,
    refetch: refetchSignups,
  } = api.workshop.getAllSignups.useQuery(
    {
      conferenceId,
      pageSize: 100,
    },
    {
      enabled: !!conferenceId,
    },
  )

  const confirmMutation = api.workshop.batchConfirmSignups.useMutation({
    onSuccess: () => {
      refetchSignups()
    },
  })

  const deleteMutation = api.workshop.deleteSignup.useMutation({
    onSuccess: () => {
      refetchSignups()
    },
  })

  const manualSignupMutation = api.workshop.manualSignupForWorkshop.useMutation(
    {
      onSuccess: () => {
        refetchSignups()
        setAddParticipantModal({
          isOpen: false,
          workshopId: '',
          workshopTitle: '',
        })
        setNewParticipant({
          userName: '',
          userEmail: '',
          userWorkOSId: '',
          experienceLevel: 'intermediate',
          operatingSystem: 'macos',
        })
      },
    },
  )

  const updateCapacityMutation =
    api.workshop.updateWorkshopCapacity.useMutation({
      onSuccess: (result) => {
        queryClient.invalidateQueries({
          queryKey: [['workshop', 'listWorkshops']],
        })

        refetchWorkshops()
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

  const {
    data: statsData,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = api.workshop.getWorkshopSummary.useQuery(
    {
      conferenceId,
    },
    {
      enabled: !!conferenceId,
    },
  )

  const workshops = (workshopsData?.data || []) as ProposalWithWorkshopData[]
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
    return (
      <ErrorDisplay
        title="Error Loading Workshops"
        message={workshopsError.message}
      />
    )
  }

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

      {/* Workshop Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {workshops.map((workshop) => {
          const workshopSignups = signupsByWorkshop.get(workshop._id) || []
          const confirmedCount = workshopSignups.filter(
            (s) => s.status === 'confirmed',
          ).length
          const waitlistCount = workshopSignups.filter(
            (s) => s.status === 'waitlist',
          ).length
          const capacityPercentage = (confirmedCount / workshop.capacity) * 100

          return (
            <div
              key={workshop._id}
              className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {workshop.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {getWorkshopDuration(workshop.format)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const capacity = workshop.capacity || 30
                        setEditCapacityModal({
                          isOpen: true,
                          workshopId: workshop._id,
                          workshopTitle: workshop.title,
                          currentCapacity: capacity,
                          currentSignups: confirmedCount,
                        })
                        setNewCapacity(capacity)
                      }}
                      className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-sm transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                      title="Edit capacity"
                    >
                      <UserGroupIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <span className="font-medium">
                        {confirmedCount}/{workshop.capacity}
                      </span>
                      <svg
                        className="h-3 w-3 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Capacity Bar */}
                <div className="mb-4">
                  <div className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Capacity</span>
                    <span>{capacityPercentage.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className={`h-full transition-all ${
                        capacityPercentage >= 90
                          ? 'bg-red-500'
                          : capacityPercentage >= 70
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(capacityPercentage, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Status Buttons */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      setSignupModal({
                        isOpen: true,
                        workshopId: workshop._id,
                        workshopTitle: workshop.title,
                        status: 'confirmed' as WorkshopSignupStatus,
                      })
                    }
                    className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 transition-colors hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30"
                  >
                    <span>Confirmed</span>
                    <span className="font-semibold">{confirmedCount}</span>
                  </button>
                  <button
                    onClick={() =>
                      setSignupModal({
                        isOpen: true,
                        workshopId: workshop._id,
                        workshopTitle: workshop.title,
                        status: 'waitlist' as WorkshopSignupStatus,
                      })
                    }
                    className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
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
                        workshopTitle: workshop.title,
                      })
                      setNewParticipant({
                        userName: '',
                        userEmail: '',
                        userWorkOSId: '',
                        experienceLevel: 'intermediate',
                        operatingSystem: 'macos',
                      })
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
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
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setSignupModal({ ...signupModal, isOpen: false })}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="bg-opacity-75 dark:bg-opacity-75 fixed inset-0 bg-gray-500 transition-opacity dark:bg-gray-900" />
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
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:p-6 dark:bg-gray-800">
                  <div className="absolute top-0 right-0 pt-4 pr-4">
                    <button
                      type="button"
                      className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none dark:bg-gray-800 dark:text-gray-500 dark:hover:text-gray-400"
                      onClick={() =>
                        setSignupModal({ ...signupModal, isOpen: false })
                      }
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="sm:flex sm:items-start">
                    <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">
                      <Dialog.Title
                        as="h3"
                        className="mb-4 text-lg leading-6 font-semibold text-gray-900 dark:text-white"
                      >
                        {signupModal.workshopTitle} -{' '}
                        {signupModal.status
                          ? signupModal.status.charAt(0).toUpperCase() +
                            signupModal.status.slice(1)
                          : ''}{' '}
                        Signups
                      </Dialog.Title>

                      {signupModal.status && (
                        <div className="mt-4">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                                    Name
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                                    Email
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                                    Signup Date
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                                {signups
                                  .filter(
                                    (s) =>
                                      (s.workshop._ref || s.workshop._id) ===
                                        signupModal.workshopId &&
                                      s.status === signupModal.status,
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
                                      <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                                        {(() => {
                                          const dateStr =
                                            signup.signupDate ||
                                            signup._createdAt
                                          if (
                                            !dateStr ||
                                            typeof dateStr !== 'string'
                                          )
                                            return 'N/A'
                                          return new Date(
                                            dateStr,
                                          ).toLocaleDateString()
                                        })()}
                                      </td>
                                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                          {signup.status === 'waitlist' && (
                                            <button
                                              onClick={() => {
                                                confirmMutation.mutate(
                                                  {
                                                    signupIds: [signup._id],
                                                    sendEmails: true,
                                                  },
                                                  {
                                                    onSuccess: () => {
                                                      alert(
                                                        `✅ ${signup.userName} confirmed! Confirmation email sent.`,
                                                      )
                                                      setTimeout(
                                                        () => refetchSignups(),
                                                        500,
                                                      )
                                                    },
                                                  },
                                                )
                                              }}
                                              className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                                            >
                                              Move to Confirmed
                                            </button>
                                          )}
                                          <button
                                            onClick={() => {
                                              if (
                                                confirm(
                                                  `Are you sure you want to permanently delete ${signup.userName}'s signup?`,
                                                )
                                              ) {
                                                deleteMutation.mutate({
                                                  signupId: signup._id,
                                                })
                                                setTimeout(
                                                  () => refetchSignups(),
                                                  500,
                                                )
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
                            {signups.filter(
                              (s) =>
                                (s.workshop._ref || s.workshop._id) ===
                                  signupModal.workshopId &&
                                s.status === signupModal.status,
                            ).length === 0 && (
                              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                                No {signupModal.status} signups for this
                                workshop
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
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() =>
            setAddParticipantModal({ ...addParticipantModal, isOpen: false })
          }
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="bg-opacity-75 dark:bg-opacity-75 fixed inset-0 bg-gray-500 transition-opacity dark:bg-gray-900" />
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
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6 dark:bg-gray-800">
                  <div className="absolute top-0 right-0 pt-4 pr-4">
                    <button
                      type="button"
                      className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none dark:bg-gray-800 dark:text-gray-500 dark:hover:text-gray-400"
                      onClick={() =>
                        setAddParticipantModal({
                          ...addParticipantModal,
                          isOpen: false,
                        })
                      }
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  <div>
                    <Dialog.Title
                      as="h3"
                      className="mb-4 text-lg leading-6 font-semibold text-gray-900 dark:text-white"
                    >
                      Add Participant to {addParticipantModal.workshopTitle}
                    </Dialog.Title>

                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Name *
                        </label>
                        <input
                          type="text"
                          value={newParticipant.userName}
                          onChange={(e) =>
                            setNewParticipant({
                              ...newParticipant,
                              userName: e.target.value,
                            })
                          }
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          placeholder="John Doe"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Email *
                        </label>
                        <input
                          type="email"
                          value={newParticipant.userEmail}
                          onChange={(e) =>
                            setNewParticipant({
                              ...newParticipant,
                              userEmail: e.target.value,
                            })
                          }
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          placeholder="john@example.com"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          WorkOS ID (optional)
                        </label>
                        <input
                          type="text"
                          value={newParticipant.userWorkOSId}
                          onChange={(e) =>
                            setNewParticipant({
                              ...newParticipant,
                              userWorkOSId: e.target.value,
                            })
                          }
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                          placeholder="user_abc123"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Experience Level *
                        </label>
                        <select
                          value={newParticipant.experienceLevel}
                          onChange={(e) =>
                            setNewParticipant({
                              ...newParticipant,
                              experienceLevel: e.target.value as
                                | 'beginner'
                                | 'intermediate'
                                | 'advanced',
                            })
                          }
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Operating System *
                        </label>
                        <select
                          value={newParticipant.operatingSystem}
                          onChange={(e) =>
                            setNewParticipant({
                              ...newParticipant,
                              operatingSystem: e.target.value as
                                | 'windows'
                                | 'macos'
                                | 'linux',
                            })
                          }
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        >
                          <option value="windows">Windows</option>
                          <option value="macos">macOS</option>
                          <option value="linux">Linux</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        type="button"
                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        onClick={() =>
                          setAddParticipantModal({
                            ...addParticipantModal,
                            isOpen: false,
                          })
                        }
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        onClick={() => {
                          if (
                            !newParticipant.userName ||
                            !newParticipant.userEmail
                          ) {
                            alert('Please fill in all required fields')
                            return
                          }

                          manualSignupMutation.mutate({
                            userName: newParticipant.userName,
                            userEmail: newParticipant.userEmail,
                            userWorkOSId:
                              newParticipant.userWorkOSId ||
                              `manual_${Date.now()}`,
                            experienceLevel: newParticipant.experienceLevel,
                            operatingSystem: newParticipant.operatingSystem,
                            workshop: {
                              _type: 'reference',
                              _ref: addParticipantModal.workshopId,
                            },
                            conference: {
                              _type: 'reference',
                              _ref: conferenceId,
                            },
                          })
                        }}
                        disabled={manualSignupMutation.isPending}
                      >
                        {manualSignupMutation.isPending
                          ? 'Adding...'
                          : 'Add Participant'}
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
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() =>
            setEditCapacityModal({ ...editCapacityModal, isOpen: false })
          }
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="bg-opacity-75 dark:bg-opacity-75 fixed inset-0 bg-gray-500 transition-opacity dark:bg-gray-900" />
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
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md sm:p-6 dark:bg-gray-800">
                  <div className="absolute top-0 right-0 pt-4 pr-4">
                    <button
                      type="button"
                      className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none dark:bg-gray-800 dark:text-gray-500 dark:hover:text-gray-400"
                      onClick={() =>
                        setEditCapacityModal({
                          ...editCapacityModal,
                          isOpen: false,
                        })
                      }
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  <div>
                    <Dialog.Title
                      as="h3"
                      className="mb-4 text-lg leading-6 font-semibold text-gray-900 dark:text-white"
                    >
                      Edit Workshop Capacity
                    </Dialog.Title>

                    <div className="mb-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {editCapacityModal.workshopTitle}
                      </p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Currently {editCapacityModal.currentSignups} confirmed
                        participants
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Maximum Capacity
                        </label>
                        <input
                          type="number"
                          min={editCapacityModal.currentSignups}
                          value={newCapacity || 0}
                          onChange={(e) =>
                            setNewCapacity(parseInt(e.target.value) || 0)
                          }
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                        {newCapacity < editCapacityModal.currentSignups && (
                          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                            Capacity cannot be less than current signups (
                            {editCapacityModal.currentSignups})
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Available spots:{' '}
                          {Math.max(
                            0,
                            newCapacity - editCapacityModal.currentSignups,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        type="button"
                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        onClick={() =>
                          setEditCapacityModal({
                            ...editCapacityModal,
                            isOpen: false,
                          })
                        }
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          if (newCapacity < editCapacityModal.currentSignups) {
                            alert(
                              `Capacity cannot be less than current signups (${editCapacityModal.currentSignups})`,
                            )
                            return
                          }

                          updateCapacityMutation.mutate({
                            workshopId: editCapacityModal.workshopId,
                            capacity: newCapacity,
                          })
                        }}
                        disabled={
                          updateCapacityMutation.isPending ||
                          newCapacity < editCapacityModal.currentSignups
                        }
                      >
                        {updateCapacityMutation.isPending
                          ? 'Updating...'
                          : 'Update Capacity'}
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
