'use client'

import { useState, useEffect, useRef } from 'react'
// Speaker type is used by SpeakerAvatars but not directly here
import {
  UserIcon,
  XMarkIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import type { Speaker } from '@/lib/speaker/types'

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
  conferenceId?: string
  maxSpeakers?: number
  label?: string
  required?: boolean
  error?: string
}

export function SpeakerMultiSelect({
  selectedSpeakerIds,
  onChange,
  conferenceId,
  maxSpeakers = 5,
  label = 'Speakers',
  required = false,
  error,
}: SpeakerMultiSelectProps) {
  const [speakers, setSpeakers] = useState<AdminSpeakerPick[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch speakers on mount and when conferenceId changes
  useEffect(() => {
    const fetchSpeakers = async () => {
      setIsLoading(true)
      setFetchError(null)

      try {
        const url = `/api/admin/speakers${conferenceId ? `?conferenceId=${conferenceId}` : ''}`
        const response = await fetch(url)

        if (!response.ok) {
          throw new Error('Failed to fetch speakers')
        }

        const data = await response.json()
        setSpeakers(data.speakers || [])
      } catch (err) {
        console.error('Error fetching speakers:', err)
        setFetchError('Failed to load speakers')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSpeakers()
  }, [conferenceId])

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
    if (
      selectedSpeakerIds.length < maxSpeakers &&
      !selectedSpeakerIds.includes(speakerId)
    ) {
      onChange([...selectedSpeakerIds, speakerId])
      setIsDropdownOpen(false)
      setSearchQuery('')
    }
  }

  const handleRemoveSpeaker = (speakerId: string) => {
    onChange(selectedSpeakerIds.filter((id) => id !== speakerId))
  }

  const toggleDropdown = () => {
    if (!isLoading && selectedSpeakerIds.length < maxSpeakers) {
      setIsDropdownOpen(!isDropdownOpen)
      if (!isDropdownOpen) {
        setSearchQuery('')
      }
    }
  }

  const selectedSpeakers = getSelectedSpeakers()
  const availableSpeakers = getAvailableSpeakers()

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-medium text-gray-900 dark:text-white">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Select speakers for this proposal. The first speaker will be the primary
        speaker.
      </p>

      {/* Selected Speakers Display */}
      <div className="space-y-2 rounded-lg border border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-800">
        {selectedSpeakers.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No speakers selected
          </p>
        ) : (
          <div className="space-y-2">
            {selectedSpeakers.map((speaker, index) => (
              <div
                key={speaker._id}
                className="flex items-center justify-between rounded-md bg-gray-50 p-3 dark:bg-gray-700"
              >
                <div className="flex items-center gap-3">
                  <div className="text-gray-400">
                    {index === 0 && (
                      <span className="text-xs font-medium text-brand-cloud-blue">
                        Primary
                      </span>
                    )}
                  </div>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <SpeakerAvatars speakers={[speaker as any]} size="sm" />
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
            disabled={isLoading || selectedSpeakerIds.length >= maxSpeakers}
            className="mt-2 flex w-full items-center justify-between rounded-md bg-brand-cloud-blue px-4 py-2 text-white hover:bg-brand-cloud-blue/90 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600"
          >
            <span className="flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              {selectedSpeakerIds.length >= maxSpeakers
                ? `Maximum ${maxSpeakers} speakers`
                : '+ Add Speaker'}
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
                  <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search speakers..."
                    className="w-full rounded-md border border-gray-300 bg-white py-2 pr-3 pl-10 text-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    autoFocus
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
          {fetchError || error}
        </div>
      )}
    </div>
  )
}
