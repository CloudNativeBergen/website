'use client'

import { useEffect, useState } from 'react'
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type {
  MarketingAssetSubject,
  MarketingAssetSubjectType,
} from '@/lib/marketing-asset'
import { MIN_SEARCH_QUERY_LENGTH, SEARCH_DEBOUNCE_MS } from '@/lib/search/types'
import { api } from '@/lib/trpc/client'

export const SUBJECT_LABEL: Record<MarketingAssetSubjectType, string> = {
  speaker: 'Speaker',
  talk: 'Talk',
  sponsor: 'Sponsor',
}

/**
 * Pick who an asset is about: a speaker, a talk or a sponsor. Searches through
 * `search.unified`, the ⌘K palette's one org-scoped read, so no new read
 * surface is added; the server checks the pick again on save.
 */
export function SubjectCombobox({
  id,
  value,
  onChange,
  disabled = false,
  describedBy,
}: {
  id?: string
  value: MarketingAssetSubject | null
  onChange: (subject: MarketingAssetSubject | null) => void
  disabled?: boolean
  describedBy?: string
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(
      () => setDebounced(query.trim()),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [query])
  const enabled = debounced.length >= MIN_SEARCH_QUERY_LENGTH
  const { data, isFetching } = api.search.unified.useQuery(
    { query: debounced },
    { enabled, staleTime: 5_000 },
  )
  const options: MarketingAssetSubject[] = enabled
    ? [
        ...(data?.speakers ?? []).map((s) => ({
          _id: s._id,
          _type: 'speaker' as const,
          name: s.name,
        })),
        ...(data?.proposals ?? []).map((p) => ({
          _id: p._id,
          _type: 'talk' as const,
          name: p.title,
        })),
        ...(data?.sponsors ?? []).map((s) => ({
          _id: s._id,
          _type: 'sponsor' as const,
          name: s.name,
        })),
      ]
    : []

  return (
    <Combobox
      value={value}
      onChange={onChange}
      disabled={disabled}
      by="_id"
      immediate
    >
      <div className="relative mt-1">
        <ComboboxInput
          id={id}
          aria-describedby={describedBy}
          className="block min-h-[44px] w-full rounded-md border border-gray-300 bg-white py-2 pr-16 pl-3 text-sm text-gray-900 shadow-xs placeholder:text-gray-400 focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          displayValue={(subject: MarketingAssetSubject | null) =>
            subject ? `${subject.name} (${SUBJECT_LABEL[subject._type]})` : ''
          }
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search speakers, talks and sponsors…"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove the subject"
            className="absolute inset-y-0 right-8 flex items-center px-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <XMarkIcon className="size-4" aria-hidden />
          </button>
        )}
        <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
          <ChevronUpDownIcon className="size-5 text-gray-400" aria-hidden />
        </ComboboxButton>
        <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-gray-200 focus:outline-none dark:bg-gray-800 dark:ring-white/10">
          {!enabled ? (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              Type at least {MIN_SEARCH_QUERY_LENGTH} letters
            </div>
          ) : isFetching && options.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              Searching…
            </div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              Nothing found
            </div>
          ) : (
            options.map((subject) => (
              <ComboboxOption
                key={`${subject._type}:${subject._id}`}
                value={subject}
                className="group relative flex min-h-[44px] cursor-default items-center gap-2 px-3 py-2 pr-9 text-gray-900 select-none data-focus:bg-brand-cloud-blue data-focus:text-white dark:text-white"
              >
                <span className="min-w-0 flex-1 truncate group-data-selected:font-semibold">
                  {subject.name}
                </span>
                <span className="shrink-0 text-xs text-gray-500 group-data-focus:text-blue-100 dark:text-gray-400">
                  {SUBJECT_LABEL[subject._type]}
                </span>
                <span className="absolute inset-y-0 right-0 hidden items-center pr-3 group-data-selected:flex">
                  <CheckIcon className="size-5" aria-hidden />
                </span>
              </ComboboxOption>
            ))
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  )
}
