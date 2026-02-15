'use client'

import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react'
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/20/solid'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import Image from 'next/image'
import { useState } from 'react'

interface Organizer {
  _id: string
  name: string
  email?: string
  avatar?: string | null
}

interface OrganizerComboboxProps {
  value: string
  onChange: (value: string) => void
  organizers: Organizer[]
}

function handleComboboxChange(
  onChange: (value: string) => void,
  value: string | null,
) {
  onChange(value || '')
}

export function OrganizerCombobox({
  value,
  onChange,
  organizers,
}: OrganizerComboboxProps) {
  const [query, setQuery] = useState('')

  const filteredOrganizers =
    query === ''
      ? organizers
      : organizers.filter((organizer) => {
          const searchTerm = query.toLowerCase()
          return (
            organizer.name.toLowerCase().includes(searchTerm) ||
            organizer.email?.toLowerCase().includes(searchTerm)
          )
        })
  return (
    <div>
      <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
        Assigned To
      </label>
      <Combobox
        value={value}
        onChange={(v) => handleComboboxChange(onChange, v)}
      >
        <div className="relative mt-1.5">
          <div className="relative">
            <ComboboxInput
              className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-20 pl-3 text-left text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10"
              displayValue={(id: string) =>
                organizers.find((o) => o._id === id)?.name || ''
              }
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Select organizer..."
            />
            <div className="absolute inset-y-0 right-0 flex items-center">
              {value && (
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="mr-1 rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title="Clear assignment"
                >
                  <XMarkIcon className="h-4 w-4 text-gray-400" />
                </button>
              )}
              <ComboboxButton className="pointer-events-none flex items-center pr-2">
                <ChevronUpDownIcon
                  className="h-5 w-5 text-gray-400 sm:h-4 sm:w-4"
                  aria-hidden="true"
                />
              </ComboboxButton>
            </div>
          </div>
          <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline-1 -outline-offset-1 outline-gray-300 focus:outline-none sm:text-sm dark:bg-gray-800 dark:outline-white/10">
            {filteredOrganizers.length === 0 ? (
              <div className="relative cursor-default px-3 py-2 text-gray-500 select-none dark:text-gray-400">
                {query ? 'No matching organizers found' : 'No organizers found'}
              </div>
            ) : (
              filteredOrganizers.map((org) => (
                <ComboboxOption
                  key={org._id}
                  value={org._id}
                  className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white dark:text-white"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                      {org.avatar ? (
                        <Image
                          src={org.avatar}
                          alt={org.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <MissingAvatar name={org.name} size={32} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-normal group-data-selected:font-semibold">
                        {org.name}
                      </span>
                      {org.email && (
                        <span className="block truncate text-xs text-gray-500 group-data-focus:text-indigo-200">
                          {org.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="absolute inset-y-0 right-0 hidden items-center pr-4 text-indigo-600 group-data-focus:text-white group-data-selected:flex">
                    <CheckIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                </ComboboxOption>
              ))
            )}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  )
}
