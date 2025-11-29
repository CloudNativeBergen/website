'use client'

import { useState } from 'react'
import {
  CalendarIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'

interface WorkshopRegistrationSettingsProps {
  conferenceId: string
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
}

export function WorkshopRegistrationSettings({
  conferenceId,
  workshopRegistrationStart,
  workshopRegistrationEnd,
}: WorkshopRegistrationSettingsProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(
    workshopRegistrationStart
      ? new Date(workshopRegistrationStart).toISOString().slice(0, 16)
      : '',
  )
  const [endDate, setEndDate] = useState(
    workshopRegistrationEnd
      ? new Date(workshopRegistrationEnd).toISOString().slice(0, 16)
      : '',
  )

  const updateRegistrationTimes =
    api.workshop.updateRegistrationTimes.useMutation({
      onSuccess: () => {
        setIsEditing(false)
        setError(null)
        window.location.reload()
      },
      onError: (error) => {
        setError(error.message || 'Failed to update')
      },
    })

  const handleSave = async () => {
    setError(null)
    updateRegistrationTimes.mutate({
      conferenceId,
      startDate: startDate || null,
      endDate: endDate || null,
    })
  }

  const handleCancel = () => {
    setStartDate(
      workshopRegistrationStart
        ? new Date(workshopRegistrationStart).toISOString().slice(0, 16)
        : '',
    )
    setEndDate(
      workshopRegistrationEnd
        ? new Date(workshopRegistrationEnd).toISOString().slice(0, 16)
        : '',
    )
    setIsEditing(false)
    setError(null)
  }

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Not set'
    return new Date(dateString).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  const getRegistrationStatus = () => {
    if (!workshopRegistrationStart || !workshopRegistrationEnd) {
      return { text: 'Not configured', color: 'text-gray-500' }
    }

    const now = new Date()
    const start = new Date(workshopRegistrationStart)
    const end = new Date(workshopRegistrationEnd)

    if (now < start) {
      return {
        text: 'Not yet open',
        color: 'text-yellow-600 dark:text-yellow-400',
      }
    }
    if (now > end) {
      return { text: 'Closed', color: 'text-red-600 dark:text-red-400' }
    }
    return {
      text: 'Currently open',
      color: 'text-green-600 dark:text-green-400',
    }
  }

  const status = getRegistrationStatus()

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center">
          <CalendarIcon className="mr-2 h-5 w-5 text-gray-400 dark:text-gray-500" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Workshop Registration
          </h3>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <PencilIcon className="h-4 w-4" />
            Edit
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Registration Opens
            </label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Registration Closes
            </label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={updateRegistrationTimes.isPending}
              className="flex items-center gap-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 dark:bg-green-500 dark:hover:bg-green-600"
            >
              <CheckIcon className="h-4 w-4" />
              {updateRegistrationTimes.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              disabled={updateRegistrationTimes.isPending}
              className="flex items-center gap-1 rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-between py-2">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Registration Opens
            </span>
            <span className="text-sm text-gray-900 dark:text-white">
              {formatDateTime(workshopRegistrationStart)}
            </span>
          </div>

          <div className="flex justify-between border-t border-gray-200 py-2 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Registration Closes
            </span>
            <span className="text-sm text-gray-900 dark:text-white">
              {formatDateTime(workshopRegistrationEnd)}
            </span>
          </div>

          <div className="flex justify-between border-t border-gray-200 py-2 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Status
            </span>
            <span className={`text-sm font-medium ${status.color}`}>
              {status.text}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
