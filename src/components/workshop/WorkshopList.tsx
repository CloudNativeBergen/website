'use client'

import { useState, useEffect } from 'react'
import WorkshopCard from './WorkshopCard'
import type { ProposalWithWorkshopData, WorkshopSignupExisting, ExperienceLevel, OperatingSystem } from '@/lib/workshop/types'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'

interface WorkshopListProps {
  conferenceId: string
  userWorkOSId?: string
  userEmail?: string
  userName?: string
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
}

export default function WorkshopList({
  conferenceId,
  userWorkOSId,
  userEmail,
  userName,
  workshopRegistrationStart,
  workshopRegistrationEnd,
}: WorkshopListProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: workshopsData, isLoading: workshopsLoading, refetch: refetchWorkshops } =
    api.workshop.listWorkshops.useQuery({
      conferenceId,
      includeCapacity: true,
    })

  const { data: signupsData, isLoading: signupsLoading, refetch: refetchSignups } =
    api.workshop.getUserSignups.useQuery(
      {
        userWorkOSId: userWorkOSId || '',
        conferenceId,
      },
      {
        enabled: !!userWorkOSId,
      }
    )

  const signupMutation = api.workshop.signupForWorkshop.useMutation({
    onSuccess: (data) => {
      setSuccessMessage(data.message || 'Successfully signed up for the workshop!')
      setErrorMessage(null)
      setTimeout(() => setSuccessMessage(null), 5000)
      refetchWorkshops()
      refetchSignups()
    },
    onError: (error) => {
      setErrorMessage(error.message)
      setSuccessMessage(null)
      setTimeout(() => setErrorMessage(null), 5000)
    },
  })

  const cancelMutation = api.workshop.cancelSignup.useMutation({
    onSuccess: () => {
      setSuccessMessage('Successfully cancelled workshop signup')
      setErrorMessage(null)
      setTimeout(() => setSuccessMessage(null), 5000)
      refetchWorkshops()
      refetchSignups()
    },
    onError: (error) => {
      setErrorMessage(error.message)
      setSuccessMessage(null)
      setTimeout(() => setErrorMessage(null), 5000)
    },
  })

  const handleSignup = async (workshopId: string, experienceLevel: ExperienceLevel, operatingSystem: OperatingSystem) => {
    if (!userWorkOSId || !userEmail || !userName) {
      setErrorMessage('Please sign in to register for workshops')
      setTimeout(() => setErrorMessage(null), 5000)
      return { success: false, error: 'Not authenticated' }
    }

    // Check if user is already signed up
    if (userWorkshopIds.includes(workshopId)) {
      setErrorMessage('You are already signed up for this workshop')
      setTimeout(() => setErrorMessage(null), 5000)
      return { success: false, error: 'Already signed up' }
    }

    setSuccessMessage(null)
    setErrorMessage(null)

    const workshopToSignUp = workshops.find(w => w._id === workshopId)
    const workshopDate = workshopToSignUp?.date || workshopToSignUp?.scheduleInfo?.date
    const workshopStart = workshopToSignUp?.startTime || workshopToSignUp?.scheduleInfo?.timeSlot?.startTime
    const workshopEnd = workshopToSignUp?.endTime || workshopToSignUp?.scheduleInfo?.timeSlot?.endTime

    if (workshopDate && workshopStart && workshopEnd) {

      const conflictingWorkshop = userWorkshops.find(userWorkshop => {
        const existingDate = userWorkshop.date || userWorkshop.scheduleInfo?.date
        const existingStart = userWorkshop.startTime || userWorkshop.scheduleInfo?.timeSlot?.startTime
        const existingEnd = userWorkshop.endTime || userWorkshop.scheduleInfo?.timeSlot?.endTime

        if (!existingDate || !existingStart || !existingEnd) {
          return false
        }

        const isSameDay = existingDate === workshopDate
        if (!isSameDay) return false

        if (!workshopStart || !workshopEnd || !existingStart || !existingEnd) {
          return false
        }

        const newStartTime = workshopStart.replace(':', '')
        const newEndTime = workshopEnd.replace(':', '')
        const existingStartTime = existingStart.replace(':', '')
        const existingEndTime = existingEnd.replace(':', '')

        return (
          (newStartTime >= existingStartTime && newStartTime < existingEndTime) ||
          (newEndTime > existingStartTime && newEndTime <= existingEndTime) ||
          (newStartTime <= existingStartTime && newEndTime >= existingEndTime)
        )
      })

      if (conflictingWorkshop) {
        const errorMsg = `You are already registered for "${conflictingWorkshop.title}" which overlaps with this workshop's time slot`
        setErrorMessage(errorMsg)
        setTimeout(() => setErrorMessage(null), 7000)
        return { success: false, error: errorMsg }
      }
    }

    try {
      await signupMutation.mutateAsync({
        userEmail,
        userName,
        userWorkOSId,
        experienceLevel,
        operatingSystem,
        workshop: { _type: 'reference', _ref: workshopId },
        conference: { _type: 'reference', _ref: conferenceId },
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  const handleCancel = async (signupId: string) => {
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      await cancelMutation.mutateAsync({
        signupId,
        reason: 'User cancelled',
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  if (workshopsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600 dark:text-gray-400">Loading workshops...</div>
      </div>
    )
  }

  const workshops = (workshopsData?.data || []) as ProposalWithWorkshopData[]
  const userSignups = signupsData?.data || []

  // Check if registration is open
  const now = new Date()
  const registrationNotYetOpen = workshopRegistrationStart && new Date(workshopRegistrationStart) > now
  const registrationClosed = workshopRegistrationEnd && new Date(workshopRegistrationEnd) < now
  const registrationOpen = !registrationNotYetOpen && !registrationClosed

  // Get all workshop IDs that the user has signed up for (confirmed or waitlist)
  const userWorkshopIds = userSignups
    .filter(s => s.status === 'confirmed' || s.status === 'waitlist')
    .map(s => {
      // Try multiple ways to get the workshop ID
      return (s as any).workshopId ||
             s.workshop?._ref ||
             s.workshop?._id ||
             (s.workshop as any)?._id
    })
    .filter(Boolean)

  // Workshops the user is signed up for
  const userWorkshops = workshops.filter((w) =>
    userWorkshopIds.includes(w._id)
  )

  // Available workshops (not signed up)
  const availableWorkshops = workshops.filter((w) =>
    w.available > 0 && !userWorkshopIds.includes(w._id)
  )

  // Full workshops (not signed up)
  const fullWorkshops = workshops.filter((w) =>
    w.available === 0 && !userWorkshopIds.includes(w._id)
  )

  const checkTimeConflict = (workshop: ProposalWithWorkshopData) => {
    const workshopDate = workshop.date || workshop.scheduleInfo?.date
    const workshopStart = workshop.startTime || workshop.scheduleInfo?.timeSlot?.startTime
    const workshopEnd = workshop.endTime || workshop.scheduleInfo?.timeSlot?.endTime

    if (!workshopDate || !workshopStart || !workshopEnd) {
      return { hasConflict: false, conflictingWorkshop: null }
    }

    const conflictingWorkshop = userWorkshops.find(userWorkshop => {
      if (userWorkshop._id === workshop._id) return false

      const existingDate = userWorkshop.date || userWorkshop.scheduleInfo?.date
      const existingStart = userWorkshop.startTime || userWorkshop.scheduleInfo?.timeSlot?.startTime
      const existingEnd = userWorkshop.endTime || userWorkshop.scheduleInfo?.timeSlot?.endTime

      if (!existingDate || !existingStart || !existingEnd) {
        return false
      }

      const isSameDay = existingDate === workshopDate
      if (!isSameDay) return false

      if (!workshopStart || !workshopEnd || !existingStart || !existingEnd) {
        return false
      }

      const newStartTime = workshopStart.replace(':', '')
      const newEndTime = workshopEnd.replace(':', '')
      const existingStartTime = existingStart.replace(':', '')
      const existingEndTime = existingEnd.replace(':', '')

      return (
        (newStartTime >= existingStartTime && newStartTime < existingEndTime) ||
        (newEndTime > existingStartTime && newEndTime <= existingEndTime) ||
        (newStartTime <= existingStartTime && newEndTime >= existingEndTime)
      )
    })

    return {
      hasConflict: !!conflictingWorkshop,
      conflictingWorkshop
    }
  }

  if (workshops.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-8 text-center">
        <p className="text-gray-600 dark:text-gray-400">No workshops are available at this time.</p>
      </div>
    )
  }

  return (
    <div className="space-y-12">
      {successMessage && (
        <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800">
          {errorMessage}
        </div>
      )}

      {userWorkshops.length > 0 && (
        <div>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Your Workshops
          </h2>
          <div className="mb-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              You are registered for {userWorkshops.filter(w => {
                const signup = userSignups.find(s => (s.workshop?._ref || s.workshop?._id) === w._id)
                return signup?.status === 'confirmed'
              }).length} workshop{userWorkshops.filter(w => {
                const signup = userSignups.find(s => (s.workshop?._ref || s.workshop?._id) === w._id)
                return signup?.status === 'confirmed'
              }).length !== 1 ? 's' : ''}
              {userWorkshops.filter(w => {
                const signup = userSignups.find(s => (s.workshop?._ref || s.workshop?._id) === w._id)
                return signup?.status === 'waitlist'
              }).length > 0 && (
                <> and on the waitlist for {userWorkshops.filter(w => {
                  const signup = userSignups.find(s => (s.workshop?._ref || s.workshop?._id) === w._id)
                  return signup?.status === 'waitlist'
                }).length} workshop{userWorkshops.filter(w => {
                  const signup = userSignups.find(s => (s.workshop?._ref || s.workshop?._id) === w._id)
                  return signup?.status === 'waitlist'
                }).length !== 1 ? 's' : ''}</>
              )}.
            </p>
          </div>
          <div className="space-y-6">
            {userWorkshops.map((workshop) => {
              const userSignup = userSignups.find(s =>
                (s.workshop?._ref || s.workshop?._id || s.workshopId) === workshop._id
              )
              return (
                <WorkshopCard
                  key={workshop._id}
                  workshop={workshop}
                  userSignups={userSignups}
                  onSignup={handleSignup}
                  onCancel={userSignup ? () => handleCancel(userSignup._id) : undefined}
                  isSignedUp={true}
                />
              )
            })}
          </div>
        </div>
      )}

      {registrationOpen && availableWorkshops.length > 0 && (
        <div>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Available Workshops
          </h2>
          <div className="space-y-6">
            {availableWorkshops.map((workshop) => {
              const isSignedUp = userWorkshopIds.includes(workshop._id)
              const { hasConflict, conflictingWorkshop } = checkTimeConflict(workshop)
              return (
                <WorkshopCard
                  key={workshop._id}
                  workshop={workshop}
                  userSignups={userSignups}
                  onSignup={handleSignup}
                  isSignedUp={isSignedUp}
                  isLoading={signupMutation.isPending}
                  hasTimeConflict={hasConflict}
                  conflictingWorkshopTitle={conflictingWorkshop?.title}
                />
              )
            })}
          </div>
        </div>
      )}

      {registrationOpen && fullWorkshops.length > 0 && (
        <div>
          <h2 className="font-space-grotesk mb-6 text-2xl font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <ExclamationTriangleIcon className="h-6 w-6" />
            Full Workshops
          </h2>
          <div className="space-y-6 opacity-75">
            {fullWorkshops.map((workshop) => {
              const userSignup = userSignups.find(s =>
                (s.workshop?._ref || s.workshop?._id) === workshop._id
              )
              return (
                <WorkshopCard
                  key={workshop._id}
                  workshop={workshop}
                  userSignups={userSignups}
                  onSignup={handleSignup}
                  onCancel={userSignup ? () => handleCancel(userSignup._id) : undefined}
                  isFull={true}
                  isSignedUp={!!userSignup}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}