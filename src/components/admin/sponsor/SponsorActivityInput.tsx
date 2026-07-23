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

  const handleSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault()
    if (!description.trim() || isPending) return

    createActivity({
      sponsorForConferenceId,
      activityType,
      description: description.trim(),
    })
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/5">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setActivityType(type.id)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
                activityType === type.id
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10',
              )}
            >
              <type.icon className="size-3.5" />
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
            className="block w-full rounded-md bg-white px-3 py-2 pr-12 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
          />
          <div className="absolute right-2 bottom-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!description.trim() || isPending}
              className="flex size-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              title="Post activity"
            >
              {isPending ? (
                <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <PaperAirplaneIcon className="size-4" />
              )}
            </button>
          </div>
        </div>
        </div>
    </div>
  )
}
