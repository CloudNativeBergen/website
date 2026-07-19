'use client'

import { useState } from 'react'
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react'
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/20/solid'
import { api } from '@/lib/trpc/client'

/** The minimal shape a recipient speaker is picked and submitted as. */
export interface SpeakerOption {
  _id: string
  name: string
  title?: string
}

export interface SpeakerComboboxProps {
  /** The chosen speaker, or `null` when none is selected yet. */
  value: SpeakerOption | null
  onChange: (speaker: SpeakerOption | null) => void
  /** Marks the control invalid (e.g. the recipient could not be resolved). */
  invalid?: boolean
  disabled?: boolean
  /** Ties the input to an external `<label>` for accessibility. */
  id?: string
}

/**
 * Organizer-only searchable speaker picker. Reuses the existing
 * `speaker.admin.search` procedure (confirmed/accepted speakers + organizers),
 * so no new server surface is introduced — the query is issued only once the
 * organizer has typed something.
 */
export function SpeakerCombobox({
  value,
  onChange,
  invalid = false,
  disabled = false,
  id,
}: SpeakerComboboxProps) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()

  const { data, isFetching } = api.speaker.admin.search.useQuery(
    { query: trimmed },
    { enabled: trimmed.length > 0, staleTime: 5_000 },
  )

  const options: SpeakerOption[] = (data ?? []).map((s) => ({
    _id: s._id,
    name: s.name,
    title: s.title ?? undefined,
  }))

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
          aria-invalid={invalid}
          className={`block w-full rounded-lg border bg-white py-2 pr-10 pl-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus-visible:ring-1 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500 ${
            invalid
              ? 'border-red-400 focus:border-red-500 focus-visible:ring-red-500 dark:border-red-500'
              : 'border-gray-300 focus:border-brand-cloud-blue focus-visible:ring-brand-cloud-blue dark:border-gray-600'
          }`}
          displayValue={(s: SpeakerOption | null) => s?.name ?? ''}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search speakers by name…"
        />
        <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
          <ChevronUpDownIcon
            className="h-5 w-5 text-gray-400"
            aria-hidden="true"
          />
        </ComboboxButton>

        <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-gray-200 focus:outline-none dark:bg-gray-800 dark:ring-white/10">
          {trimmed.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              Start typing to find a speaker
            </div>
          ) : isFetching && options.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              Searching…
            </div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              No speakers found
            </div>
          ) : (
            options.map((speaker) => (
              <ComboboxOption
                key={speaker._id}
                value={speaker}
                className="group relative cursor-default px-3 py-2 pr-9 text-gray-900 select-none data-focus:bg-brand-cloud-blue data-focus:text-white dark:text-white"
              >
                <span className="block truncate font-normal group-data-selected:font-semibold">
                  {speaker.name}
                </span>
                {speaker.title && (
                  <span className="block truncate text-xs text-gray-500 group-data-focus:text-blue-100 dark:text-gray-400">
                    {speaker.title}
                  </span>
                )}
                <span className="absolute inset-y-0 right-0 hidden items-center pr-3 text-brand-cloud-blue group-data-focus:text-white group-data-selected:flex">
                  <CheckIcon className="h-5 w-5" aria-hidden="true" />
                </span>
              </ComboboxOption>
            ))
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  )
}
