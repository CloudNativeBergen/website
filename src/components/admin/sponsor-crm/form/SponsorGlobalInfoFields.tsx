'use client'

import React from 'react'

interface SponsorGlobalInfoFieldsProps {
  name: string
  website: string
  onNameChange: (value: string) => void
  onWebsiteChange: (value: string) => void
  disabled?: boolean
}

export function SponsorGlobalInfoFields({
  name,
  website,
  onNameChange,
  onWebsiteChange,
  disabled = false,
}: SponsorGlobalInfoFieldsProps) {
  return (
    <>
      <div className="sm:col-span-2">
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
      <div className="sm:col-span-2">
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
    </>
  )
}
