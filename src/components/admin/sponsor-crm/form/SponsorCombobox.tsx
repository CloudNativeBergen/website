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
import { useNotification } from '@/components/admin/NotificationProvider'

interface Sponsor {
  _id: string
  name: string
}

interface SponsorComboboxProps {
  value: string
  onChange: (value: string) => void
  availableSponsors: Sponsor[]
  disabled?: boolean
  onSponsorCreated?: (sponsorId: string) => void
}

function handleComboboxChange(
  onChange: (value: string) => void,
  value: string | null,
) {
  onChange(value || '')
}

export function SponsorCombobox({
  value,
  onChange,
  availableSponsors,
  disabled = false,
  onSponsorCreated,
}: SponsorComboboxProps) {
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newSponsorData, setNewSponsorData] = useState({
    name: '',
    website: '',
  })

  const { showNotification } = useNotification()
  const utils = api.useUtils()

  const createSponsorMutation = api.sponsor.create.useMutation({
    onSuccess: (data) => {
      if (data) {
        onChange(data._id)
        onSponsorCreated?.(data._id)
      }
      setIsCreatingNew(false)
      setNewSponsorData({ name: '', website: '' })
      utils.sponsor.list.invalidate()
      showNotification({
        type: 'success',
        title: 'Sponsor created',
        message: 'The new sponsor has been added to the database.',
      })
    },
    onError: (error) => {
      const message = error.message.includes('validationErrors')
        ? 'Please check that all fields are valid.'
        : error.message

      showNotification({
        type: 'error',
        title: 'Failed to create sponsor',
        message,
      })
    },
  })

  const handleCreateNewSponsor = async () => {
    if (!newSponsorData.name.trim() || !newSponsorData.website.trim()) return

    await createSponsorMutation.mutateAsync({
      name: newSponsorData.name,
      website: newSponsorData.website,
      logo: '',
    })
  }

  return (
    <div>
      <label className="block text-left text-sm/6 font-medium text-gray-900 dark:text-white">
        Sponsor *
      </label>
      <Combobox
        value={value}
        onChange={(v) => handleComboboxChange(onChange, v)}
        disabled={disabled}
      >
        <div className="relative mt-1.5">
          <ComboboxInput
            className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-8 pl-3 text-left text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 disabled:outline-gray-200 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:disabled:bg-white/5 dark:disabled:text-gray-400 dark:disabled:outline-white/10"
            displayValue={(id: string) =>
              availableSponsors.find((s) => s._id === id)?.name || ''
            }
            placeholder="Select a sponsor..."
          />
          <ComboboxButton className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon
              className="h-5 w-5 text-gray-400 sm:h-4 sm:w-4"
              aria-hidden="true"
            />
          </ComboboxButton>
          <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline-1 -outline-offset-1 outline-gray-300 focus:outline-none sm:text-sm dark:bg-gray-800 dark:outline-white/10">
            {availableSponsors.length === 0 ? (
              <div className="relative cursor-default px-3 py-2 text-gray-500 select-none dark:text-gray-400">
                No sponsors available
              </div>
            ) : (
              availableSponsors.map((s) => (
                <ComboboxOption
                  key={s._id}
                  value={s._id}
                  className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white dark:text-white"
                >
                  <span className="block truncate font-normal group-data-selected:font-semibold">
                    {s.name}
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

      {!disabled && !isCreatingNew && (
        <button
          type="button"
          onClick={() => setIsCreatingNew(true)}
          className="mt-2 cursor-pointer text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          + Create new sponsor
        </button>
      )}

      {isCreatingNew && (
        <div className="mt-3 space-y-2 rounded-md border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
          <div>
            <label className="block text-left text-sm font-medium text-gray-900 dark:text-white">
              Sponsor Name *
            </label>
            <input
              type="text"
              value={newSponsorData.name}
              onChange={(e) =>
                setNewSponsorData({
                  ...newSponsorData,
                  name: e.target.value,
                })
              }
              placeholder="Acme Corp"
              className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10"
            />
          </div>
          <div>
            <label className="block text-left text-sm font-medium text-gray-900 dark:text-white">
              Website *
            </label>
            <input
              type="url"
              value={newSponsorData.website}
              onChange={(e) =>
                setNewSponsorData({
                  ...newSponsorData,
                  website: e.target.value,
                })
              }
              placeholder="https://acme.com"
              className="mt-1 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreateNewSponsor}
              disabled={
                createSponsorMutation.isPending ||
                !newSponsorData.name.trim() ||
                !newSponsorData.website.trim()
              }
              className="inline-flex cursor-pointer items-center justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:bg-gray-400 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:disabled:bg-gray-600"
            >
              {createSponsorMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingNew(false)
                setNewSponsorData({ name: '', website: '' })
              }}
              className="inline-flex items-center justify-center rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
