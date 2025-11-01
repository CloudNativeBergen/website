'use client'

import { useState, useRef, useEffect } from 'react'
import {
  ChatBubbleBottomCenterTextIcon,
  CheckIcon,
  XMarkIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import { AudienceFeedback } from '@/lib/proposal/types'

interface AudienceFeedbackPanelProps {
  proposalId: string
  currentFeedback?: AudienceFeedback | null
  status: string
  conferenceStartDate?: string
}

export function AudienceFeedbackPanel({
  proposalId,
  currentFeedback,
  status,
  conferenceStartDate,
}: AudienceFeedbackPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [greenCount, setGreenCount] = useState(currentFeedback?.greenCount ?? 0)
  const [yellowCount, setYellowCount] = useState(
    currentFeedback?.yellowCount ?? 0,
  )
  const [redCount, setRedCount] = useState(currentFeedback?.redCount ?? 0)
  const { showNotification } = useNotification()
  const greenInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && greenInputRef.current) {
      greenInputRef.current.focus()
      greenInputRef.current.select()
    }
  }, [isEditing])

  const utils = api.useUtils()

  const updateFeedbackMutation =
    api.proposal.admin.updateAudienceFeedback.useMutation({
      onSuccess: () => {
        showNotification({
          title: 'Feedback Updated',
          message: 'Audience feedback has been saved successfully.',
          type: 'success',
        })
        setIsEditing(false)
        utils.proposal.admin.getById.invalidate({ id: proposalId })
      },
      onError: (error) => {
        showNotification({
          title: 'Update Failed',
          message: error.message || 'Failed to update audience feedback.',
          type: 'error',
        })
      },
    })

  const handleSave = () => {
    updateFeedbackMutation.mutate({
      id: proposalId,
      feedback: {
        greenCount,
        yellowCount,
        redCount,
      },
    })
  }

  const handleCancel = () => {
    setGreenCount(currentFeedback?.greenCount ?? 0)
    setYellowCount(currentFeedback?.yellowCount ?? 0)
    setRedCount(currentFeedback?.redCount ?? 0)
    setIsEditing(false)
  }

  const totalCount = greenCount + yellowCount + redCount

  if (status !== 'accepted' && status !== 'confirmed') {
    return null
  }

  const conferenceHasStarted = conferenceStartDate
    ? new Date(conferenceStartDate) <= new Date()
    : false

  if (!conferenceHasStarted) {
    return null
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center text-lg font-semibold text-gray-900 dark:text-white">
          <ChatBubbleBottomCenterTextIcon className="mr-2 h-5 w-5" />
          Audience Feedback
        </h3>
        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            title="Edit feedback"
          >
            <PencilIcon className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="greenCount"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Green Cards
              </label>
              <input
                ref={greenInputRef}
                type="number"
                id="greenCount"
                min="0"
                value={greenCount}
                onChange={(e) =>
                  setGreenCount(Math.max(0, parseInt(e.target.value) || 0))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSave()
                  }
                }}
                className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
              />
            </div>
            <div>
              <label
                htmlFor="yellowCount"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Yellow Cards
              </label>
              <input
                type="number"
                id="yellowCount"
                min="0"
                value={yellowCount}
                onChange={(e) =>
                  setYellowCount(Math.max(0, parseInt(e.target.value) || 0))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSave()
                  }
                }}
                className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
              />
            </div>
            <div>
              <label
                htmlFor="redCount"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Red Cards
              </label>
              <input
                type="number"
                id="redCount"
                min="0"
                value={redCount}
                onChange={(e) =>
                  setRedCount(Math.max(0, parseInt(e.target.value) || 0))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSave()
                  }
                }}
                className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={updateFeedbackMutation.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              <CheckIcon className="h-3 w-3" />
              {updateFeedbackMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={updateFeedbackMutation.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            >
              <XMarkIcon className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {totalCount === 0 ? (
            <p className="text-sm text-gray-500 italic dark:text-gray-400">
              No feedback collected yet
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md bg-green-50 p-3 dark:bg-green-900/20">
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {greenCount}
                </div>
                <div className="text-xs text-green-600 dark:text-green-500">
                  Green Cards
                </div>
              </div>
              <div className="rounded-md bg-yellow-50 p-3 dark:bg-yellow-900/20">
                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                  {yellowCount}
                </div>
                <div className="text-xs text-yellow-600 dark:text-yellow-500">
                  Yellow Cards
                </div>
              </div>
              <div className="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {redCount}
                </div>
                <div className="text-xs text-red-600 dark:text-red-500">
                  Red Cards
                </div>
              </div>
            </div>
          )}
          {currentFeedback?.lastUpdatedAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Last updated:{' '}
              {new Date(currentFeedback.lastUpdatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
