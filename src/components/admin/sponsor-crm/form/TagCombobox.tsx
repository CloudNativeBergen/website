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
import { useState } from 'react'
import { SponsorTag } from '@/lib/sponsor-crm/types'
import { TAGS } from './constants'

interface TagComboboxProps {
  value: SponsorTag[]
  onChange: (value: SponsorTag[]) => void
}

export function TagCombobox({ value, onChange }: TagComboboxProps) {
  const [query, setQuery] = useState('')

  const filteredTags =
    query === ''
      ? TAGS
      : TAGS.filter((tag) => {
          return tag.label.toLowerCase().includes(query.toLowerCase())
        })

  const removeTag = (tagToRemove: SponsorTag) => {
    onChange(value.filter((tag) => tag !== tagToRemove))
  }

  return (
    <div className="w-full">
      <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
        Tags
      </label>
      <Combobox value={value} onChange={onChange} multiple>
        <div className="relative mt-1.5">
          <div className="relative flex min-h-[38px] w-full flex-wrap gap-1 rounded-md bg-white py-1.5 pr-10 pl-3 text-left text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10">
            {value.map((tagValue) => {
              const tag = TAGS.find((t) => t.value === tagValue)
              return (
                <span
                  key={tagValue}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-700/10 ring-inset dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-400/20"
                >
                  {tag?.label || tagValue}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTag(tagValue)
                    }}
                    className="cursor-pointer rounded-full p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-900/50"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
            <ComboboxInput
              className="flex-1 border-none bg-transparent p-0 text-gray-900 focus:ring-0 dark:text-white"
              placeholder={value.length === 0 ? 'Select tags...' : ''}
              onChange={(event) => setQuery(event.target.value)}
              onBlur={() => setQuery('')}
            />
            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon
                className="h-5 w-5 text-gray-400 sm:h-4 sm:w-4"
                aria-hidden="true"
              />
            </ComboboxButton>
          </div>

          <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline-1 -outline-offset-1 outline-gray-300 focus:outline-none sm:text-sm dark:bg-gray-800 dark:outline-white/10">
            {filteredTags.length === 0 ? (
              <div className="relative cursor-default px-3 py-2 text-gray-500 select-none dark:text-gray-400">
                No matching tags found
              </div>
            ) : (
              filteredTags.map((tag) => (
                <ComboboxOption
                  key={tag.value}
                  value={tag.value}
                  className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white dark:text-white"
                >
                  <span className="block truncate font-normal group-data-selected:font-semibold">
                    {tag.label}
                  </span>
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
