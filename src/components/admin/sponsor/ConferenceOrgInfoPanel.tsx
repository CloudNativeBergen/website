'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  BuildingOffice2Icon,
  ExclamationTriangleIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import type { Conference } from '@/lib/conference/types'
import { formatOrgNumber } from '@/lib/format'

interface ConferenceOrgInfoPanelProps {
  conference: Conference
}

export function ConferenceOrgInfoPanel({
  conference,
}: ConferenceOrgInfoPanelProps) {
  const [editing, setEditing] = useState(false)
  const [orgNumber, setOrgNumber] = useState(
    conference.organizerOrgNumber || '',
  )
  const [address, setAddress] = useState(conference.organizerAddress || '')

  const updateMutation =
    api.sponsor.contractTemplates.updateConferenceOrgInfo.useMutation({
      onSuccess: () => {
        setEditing(false)
      },
    })

  const hasOrgNumber = !!orgNumber.trim()
  const hasAddress = !!address.trim()
  const isComplete = hasOrgNumber && hasAddress

  const handleSave = () => {
    updateMutation.mutate({
      conferenceId: conference._id,
      organizerOrgNumber: orgNumber,
      organizerAddress: address,
    })
  }

  const handleCancel = () => {
    setOrgNumber(conference.organizerOrgNumber || '')
    setAddress(conference.organizerAddress || '')
    setEditing(false)
  }

  if (!isComplete && !editing) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/50 dark:bg-amber-900/10">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Missing organizer details
            </p>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              {!hasOrgNumber && !hasAddress
                ? 'Organizer org. number and address are required for contract generation.'
                : !hasOrgNumber
                  ? 'Organizer org. number is required for contract generation.'
                  : 'Organizer address is required for contract generation.'}
            </p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
            >
              <PencilIcon className="h-3 w-3" />
              Configure now
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BuildingOffice2Icon className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
              Organizer Details
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              <CheckIcon className="h-3 w-3" />
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={updateMutation.isPending}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <XMarkIcon className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
        {updateMutation.isError && (
          <p className="mb-3 text-xs text-red-600 dark:text-red-400">
            {updateMutation.error.message}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="orgNumber"
              className="block text-sm/6 font-medium text-gray-900 dark:text-white"
            >
              Org. Number
            </label>
            <div className="mt-1">
              <input
                type="text"
                id="orgNumber"
                value={orgNumber}
                onChange={(e) => setOrgNumber(e.target.value)}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                placeholder="123 456 789"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="orgAddress"
              className="block text-sm/6 font-medium text-gray-900 dark:text-white"
            >
              Address
            </label>
            <div className="mt-1">
              <input
                type="text"
                id="orgAddress"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                placeholder="Street 1, 0000 City"
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Compact read-only view when all fields are set
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
          <BuildingOffice2Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="truncate">{conference.organizer}</span>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {conference.organizerOrgNumber
            ? formatOrgNumber(conference.organizerOrgNumber)
            : ''}
        </span>
        <span className="truncate text-xs text-gray-400 dark:text-gray-500">
          {conference.organizerAddress}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="ml-3 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      >
        <PencilIcon className="h-3 w-3" />
        Edit
      </button>
    </div>
  )
}
