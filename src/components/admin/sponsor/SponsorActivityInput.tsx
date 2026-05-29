'use client'

import React, { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  ChatBubbleBottomCenterTextIcon,
  PhoneIcon,
  UserGroupIcon,
  EnvelopeIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

interface SponsorActivityInputProps {
  sponsorForConferenceId: string
}

const ACTIVITY_TYPES = [
  { id: 'note', label: 'Note', icon: ChatBubbleBottomCenterTextIcon },
  { id: 'call', label: 'Call', icon: PhoneIcon },
  { id: 'meeting', label: 'Meeting', icon: UserGroupIcon },
  { id: 'email', label: 'Email', icon: EnvelopeIcon },
] as const

export function SponsorActivityInput({
  sponsorForConferenceId,
}: SponsorActivityInputProps) {
  const [description, setDescription] = useState('')
  const [activityType, setActivityType] =
    useState<(typeof ACTIVITY_TYPES)[number]['id']>('note')
  const [isFocused, setIsFocused] = useState(false)

  const utils = api.useUtils()

  const { mutate: createActivity, isPending } =
    api.sponsor.crm.activities.create.useMutation({
      onSuccess: () => {
        setDescription('')
        utils.sponsor.crm.activities.list.invalidate({ sponsorForConferenceId })
      },
    })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim() || isPending) return

    createActivity({
      sponsorForConferenceId,
      activityType,
      description: description.trim(),
    })
  }

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setActivityType(type.id)}
              className={clsx(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                activityType === type.id
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600',
              )}
            >
              <type.icon className="h-3.5 w-3.5" />
              {type.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <textarea
            rows={isFocused || description ? 3 : 1}
            placeholder={`Log a ${activityType}...`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => !description && setIsFocused(false)}
            className="w-full rounded-md border-gray-300 bg-white py-2 pr-12 pl-3 text-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
          />
          <div className="absolute right-2 bottom-2">
            <button
              type="submit"
              disabled={!description.trim() || isPending}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              title="Post activity"
            >
              {isPending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <PaperAirplaneIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
