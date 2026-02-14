'use client'

import React, { useState } from 'react'
import {
  PencilIcon,
  GlobeAltIcon,
  BuildingOffice2Icon,
  HashtagIcon,
} from '@heroicons/react/24/outline'

interface SponsorGlobalInfoFieldsProps {
  name: string
  website: string
  orgNumber?: string
  onNameChange: (value: string) => void
  onWebsiteChange: (value: string) => void
  onOrgNumberChange?: (value: string) => void
  disabled?: boolean
}

export function SponsorGlobalInfoFields({
  name,
  website,
  orgNumber = '',
  onNameChange,
  onWebsiteChange,
  onOrgNumberChange,
  disabled = false,
}: SponsorGlobalInfoFieldsProps) {
  const [editing, setEditing] = useState(false)

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
            <BuildingOffice2Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="truncate">{name}</span>
          </div>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
            >
              <GlobeAltIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {website.replace(/^https?:\/\//, '')}
              </span>
            </a>
          )}
          {orgNumber && (
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <HashtagIcon className="h-3 w-3 shrink-0" />
              {orgNumber}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={disabled}
          className="ml-3 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <PencilIcon className="h-3 w-3" />
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-4 dark:border-indigo-800/50 dark:bg-indigo-900/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
          Company Details
        </span>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="cursor-pointer text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Done
        </button>
      </div>
      <div>
        <label
          htmlFor="name"
          className="block text-sm/6 font-medium text-gray-900 dark:text-white"
        >
          Company Name *
        </label>
        <div className="mt-1">
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            required
            disabled={disabled}
            className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
            placeholder="Acme Corp"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="website"
            className="block text-sm/6 font-medium text-gray-900 dark:text-white"
          >
            Website *
          </label>
          <div className="mt-1">
            <input
              type="url"
              id="website"
              value={website}
              onChange={(e) => onWebsiteChange(e.target.value)}
              required
              disabled={disabled}
              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
              placeholder="https://example.com"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="orgNumber"
            className="block text-sm/6 font-medium text-gray-900 dark:text-white"
          >
            Org Number
          </label>
          <div className="mt-1">
            <input
              type="text"
              id="orgNumber"
              value={orgNumber}
              onChange={(e) => onOrgNumberChange?.(e.target.value)}
              disabled={disabled}
              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
              placeholder="123 456 789"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
