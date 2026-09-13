'use client'

import { useState, useEffect, useRef } from 'react'
import {
  UserIcon,
  XMarkIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import type { Speaker } from '@/lib/speaker/types'
import { SearchInput } from '@/components/SearchInput'
import { api } from '@/lib/trpc/client'

// Define minimal speaker type for admin selection
type AdminSpeakerPick = {
  _id: string
  name: string
  title?: string | null
  email?: string | null
  image?: string | null
  slug?: string | null
}

interface SpeakerMultiSelectProps {
  selectedSpeakerIds: string[]
  onChange: (speakerIds: string[]) => void
  /**
   * The talk format's total speaker limit (1 primary + its co-speaker
   * allowance). This is a CFP-SUBMISSION rule, not an invariant of the data:
   * organizers may deliberately exceed it, so the limit is ADVISORY here — it
   * never blocks adding, it only surfaces an over-limit notice. The limit is
   * still enforced on the invitation path (`proposal.invitation.send`), where
   * a speaker invites a co-speaker.
   */
  maxSpeakers?: number
  label?: string
  required?: boolean
  error?: string
}

export function SpeakerMultiSelect({
  selectedSpeakerIds,
  onChange,
  maxSpeakers = 5,
  label = 'Speakers',
  required = false,
  error,
}: SpeakerMultiSelectProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    data: speakers = [],
    isLoading,
    error: fetchError,
  } = api.speaker.admin.list.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }, // Cache for 5 minutes
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  // Helper functions
  const getSelectedSpeakers = () => {
    return selectedSpeakerIds
      .map((id) => speakers.find((s) => s._id === id))
      .filter(Boolean) as AdminSpeakerPick[]
  }

  const getAvailableSpeakers = () => {
    const filtered = speakers.filter((s) => !selectedSpeakerIds.includes(s._id))

    if (searchQuery) {
      return filtered.filter(
        (s) =>
          s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.email?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    }

    return filtered
  }

  const handleAddSpeaker = (speakerId: string) => {
    // No limit guard: the format limit is a submission rule an organizer is
    // allowed to override. Going over is reported by the notice below.
    if (!selectedSpeakerIds.includes(speakerId)) {
      onChange([...selectedSpeakerIds, speakerId])
      setIsDropdownOpen(false)
      setSearchQuery('')
    }
  }

  const handleRemoveSpeaker = (speakerId: string) => {
    onChange(selectedSpeakerIds.filter((id) => id !== speakerId))
  }

  const toggleDropdown = () => {
    if (!isLoading) {
      setIsDropdownOpen(!isDropdownOpen)
      if (!isDropdownOpen) {
        setSearchQuery('')
      }
    }
  }

  const selectedSpeakers = getSelectedSpeakers()
  const availableSpeakers = getAvailableSpeakers()
  const overLimitBy = selectedSpeakerIds.length - maxSpeakers

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-medium text-gray-900 dark:text-white">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Select speakers for this proposal. The format allows {maxSpeakers}{' '}
        {maxSpeakers === 1 ? 'speaker' : 'speakers'} at submission; as an
        organizer you can add more.
      </p>

      {overLimitBy > 0 && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            {overLimitBy} over the format limit: {selectedSpeakerIds.length}{' '}
            selected, {maxSpeakers} allowed at submission. Saving keeps all of
            them. Co-speaker invitations still stop at the format limit.
          </p>
        </div>
      )}

      {/* Selected Speakers Display */}
      <div className="space-y-2 rounded-lg border border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-800">
        {selectedSpeakers.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No speakers selected
          </p>
        ) : (
          <div className="space-y-2">
            {selectedSpeakers.map((speaker) => (
              <div
                key={speaker._id}
                className="flex items-center justify-between rounded-md bg-gray-50 p-3 dark:bg-gray-700"
              >
                <div className="flex items-center gap-3">
                  <SpeakerAvatars
                    speakers={[speaker as unknown as Speaker]}
                    size="sm"
                  />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {speaker.name}
                    </p>
                    {speaker.title && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {speaker.title}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSpeaker(speaker._id)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-300"
                  aria-label={`Remove ${speaker.name}`}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Speaker Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={toggleDropdown}
            disabled={isLoading}
            className="mt-2 flex w-full items-center justify-between rounded-md bg-brand-cloud-blue px-4 py-2 text-white hover:bg-brand-cloud-blue/90 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600"
          >
            <span className="flex items-center gap-2">
              <UserIcon className="h-4 w-4" />+ Add Speaker
            </span>
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute z-10 mt-2 w-full rounded-md bg-white shadow-lg dark:bg-gray-800">
              <div className="p-2">
                <div className="relative">
                  <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search speakers..."
                    autoFocus
                    inputClassName="w-full rounded-md border border-gray-300 bg-white py-2 pr-3 pl-10 text-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto">
                {availableSpeakers.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {searchQuery
                      ? 'No speakers found matching your search'
                      : 'No more speakers available'}
                  </p>
                ) : (
                  <ul className="py-1">
                    {availableSpeakers.map((speaker) => (
                      <li key={speaker._id}>
                        <button
                          type="button"
                          onClick={() => handleAddSpeaker(speaker._id)}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <SpeakerAvatars
                            speakers={[speaker as unknown as Speaker]}
                            size="sm"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {speaker.name}
                            </p>
                            {speaker.title && (
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {speaker.title}
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-cloud-blue"></div>
          Loading speakers...
        </div>
      )}

      {/* Error Display */}
      {(fetchError || error) && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <XMarkIcon className="h-4 w-4" />
          {fetchError?.message || error}
        </div>
      )}
    </div>
  )
}
