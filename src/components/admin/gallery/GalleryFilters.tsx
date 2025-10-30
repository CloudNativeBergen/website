'use client'

import { useState, useEffect, useCallback } from 'react'
import { Combobox } from '@headlessui/react'
import {
  ChevronUpDownIcon,
  StarIcon,
  UserIcon,
  CameraIcon,
  MapPinIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useDebounce } from '@/hooks/useDebounce'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

interface GalleryFiltersProps {
  filters: {
    featured?: boolean
    speakerId?: string
    dateFrom?: string
    dateTo?: string
    photographerSearch?: string
    locationSearch?: string
  }
  onFiltersChange: (filters: {
    featured?: boolean
    speakerId?: string
    dateFrom?: string
    dateTo?: string
    photographerSearch?: string
    locationSearch?: string
  }) => void
}

export function GalleryFilters({
  filters,
  onFiltersChange,
}: GalleryFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [speakerQuery, setSpeakerQuery] = useState('')
  const [selectedSpeaker, setSelectedSpeaker] = useState<{
    _id: string
    name: string
  } | null>(null)
  const [localDateFrom, setLocalDateFrom] = useState(filters.dateFrom || '')
  const [localDateTo, setLocalDateTo] = useState(filters.dateTo || '')
  const [localPhotographer, setLocalPhotographer] = useState(
    filters.photographerSearch || '',
  )
  const [localLocation, setLocalLocation] = useState(
    filters.locationSearch || '',
  )
  const debouncedQuery = useDebounce(speakerQuery, 300)
  const debouncedPhotographer = useDebounce(localPhotographer, 500)
  const debouncedLocation = useDebounce(localLocation, 500)

  // Initialize filters from URL on mount
  useEffect(() => {
    const featured = searchParams.get('featured')
    const speakerId = searchParams.get('speakerId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const photographer = searchParams.get('photographer')
    const location = searchParams.get('location')

    const urlFilters = {
      featured:
        featured === 'true' ? true : featured === 'false' ? false : undefined,
      speakerId: speakerId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      photographerSearch: photographer || undefined,
      locationSearch: location || undefined,
    }

    // Restore speaker filter from URL
    if (speakerId) {
      setSelectedSpeaker({ _id: speakerId, name: 'Selected speaker' })
    }

    // Only update if there are URL params
    if (Object.values(urlFilters).some((v) => v !== undefined)) {
      onFiltersChange(urlFilters)
      setLocalDateFrom(dateFrom || '')
      setLocalDateTo(dateTo || '')
      setLocalPhotographer(photographer || '')
      setLocalLocation(location || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only on mount - dependencies intentionally omitted  // Update URL when filters change
  const updateURL = useCallback(
    (newFilters: typeof filters) => {
      const params = new URLSearchParams()

      if (newFilters.featured !== undefined) {
        params.set('featured', String(newFilters.featured))
      }
      if (newFilters.speakerId) {
        params.set('speakerId', newFilters.speakerId)
      }
      if (newFilters.dateFrom) {
        params.set('dateFrom', newFilters.dateFrom)
      }
      if (newFilters.dateTo) {
        params.set('dateTo', newFilters.dateTo)
      }
      if (newFilters.photographerSearch) {
        params.set('photographer', newFilters.photographerSearch)
      }
      if (newFilters.locationSearch) {
        params.set('location', newFilters.locationSearch)
      }

      const queryString = params.toString()
      router.push(queryString ? `${pathname}?${queryString}` : pathname)
    },
    [router, pathname],
  )

  const { data: searchResults } = api.speakers.search.useQuery(
    { query: debouncedQuery, includeFeatured: true },
    {
      enabled: debouncedQuery.length > 0,
    },
  )

  const handleFeaturedChange = (value: string) => {
    const newFeatured = value === 'all' ? undefined : value === 'featured'
    const newFilters = { ...filters, featured: newFeatured }
    onFiltersChange(newFilters)
    updateURL(newFilters)
  }

  const handleSpeakerSelect = (
    speaker: { _id: string; name: string } | null,
  ) => {
    setSelectedSpeaker(speaker)
    const newFilters = { ...filters, speakerId: speaker?._id }
    onFiltersChange(newFilters)
    updateURL(newFilters)
    setSpeakerQuery('')
  }

  const clearSpeakerFilter = () => {
    setSelectedSpeaker(null)
    setSpeakerQuery('')
    const newFilters = { ...filters, speakerId: undefined }
    onFiltersChange(newFilters)
    updateURL(newFilters)
  }

  const clearAllFilters = () => {
    setSelectedSpeaker(null)
    setSpeakerQuery('')
    setLocalDateFrom('')
    setLocalDateTo('')
    setLocalPhotographer('')
    setLocalLocation('')
    const newFilters = {
      featured: undefined,
      speakerId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      photographerSearch: undefined,
      locationSearch: undefined,
    }
    onFiltersChange(newFilters)
    updateURL(newFilters)
  }

  const hasActiveFilters =
    filters.featured !== undefined ||
    filters.speakerId !== undefined ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined ||
    filters.photographerSearch !== undefined ||
    filters.locationSearch !== undefined

  useEffect(() => {
    if (debouncedPhotographer !== filters.photographerSearch) {
      const newFilters = {
        ...filters,
        photographerSearch: debouncedPhotographer || undefined,
      }
      onFiltersChange(newFilters)
      updateURL(newFilters)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPhotographer])

  useEffect(() => {
    if (debouncedLocation !== filters.locationSearch) {
      const newFilters = {
        ...filters,
        locationSearch: debouncedLocation || undefined,
      }
      onFiltersChange(newFilters)
      updateURL(newFilters)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLocation])

  return (
    <div className="rounded-lg bg-white p-3 shadow dark:bg-gray-900 dark:ring-1 dark:ring-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        {/* Featured Filter */}
        <div className="relative">
          <StarIcon className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            id="featured-filter"
            value={
              filters.featured === undefined
                ? 'all'
                : filters.featured
                  ? 'featured'
                  : 'non-featured'
            }
            onChange={(e) => handleFeaturedChange(e.target.value)}
            className="h-9 w-32 appearance-none rounded-md border-gray-300 py-1.5 pr-8 pl-8 text-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Featured filter"
          >
            <option value="all">All</option>
            <option value="featured">Featured</option>
            <option value="non-featured">Regular</option>
          </select>
          <ChevronUpDownIcon className="pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>

        {/* Speaker Filter */}
        {selectedSpeaker ? (
          <div className="flex h-9 items-center gap-1 rounded-md border border-gray-300 bg-gray-50 px-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white">
            <UserIcon className="h-4 w-4 text-gray-400" />
            <span className="max-w-32 truncate">{selectedSpeaker.name}</span>
            <button
              onClick={clearSpeakerFilter}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Clear speaker filter"
            >
              ×
            </button>
          </div>
        ) : (
          <Combobox value={selectedSpeaker} onChange={handleSpeakerSelect}>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Combobox.Input
                className="h-9 w-40 rounded-md border-gray-300 py-1.5 pr-8 pl-8 text-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                displayValue={(speaker: { _id: string; name: string } | null) =>
                  speaker?.name || ''
                }
                onChange={(event) => setSpeakerQuery(event.target.value)}
                placeholder="Speaker"
                value={speakerQuery}
              />
              <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon className="h-4 w-4 text-gray-400" />
              </Combobox.Button>
              {searchResults && searchResults.length > 0 && (
                <Combobox.Options className="ring-opacity-5 absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black focus:outline-none dark:bg-gray-800">
                  {searchResults.map((speaker) => (
                    <Combobox.Option
                      key={speaker._id}
                      value={speaker}
                      className={({ active }) =>
                        `relative cursor-default py-2 pr-4 pl-3 select-none ${
                          active
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-900 dark:text-gray-100'
                        }`
                      }
                    >
                      <span className="block truncate">{speaker.name}</span>
                    </Combobox.Option>
                  ))}
                </Combobox.Options>
              )}
            </div>
          </Combobox>
        )}

        {/* Photographer Filter */}
        <div className="relative">
          <CameraIcon className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            id="photographer"
            value={localPhotographer}
            onChange={(e) => setLocalPhotographer(e.target.value)}
            placeholder="Photographer"
            className="h-9 w-36 rounded-md border-gray-300 py-1.5 pr-3 pl-8 text-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            aria-label="Filter by photographer"
          />
        </div>

        {/* Location Filter */}
        <div className="relative">
          <MapPinIcon className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            id="location"
            value={localLocation}
            onChange={(e) => setLocalLocation(e.target.value)}
            placeholder="Location"
            className="h-9 w-32 rounded-md border-gray-300 py-1.5 pr-3 pl-8 text-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            aria-label="Filter by location"
          />
        </div>

        {/* Date From Filter */}
        <div className="relative">
          <CalendarIcon className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="date"
            id="date-from"
            value={localDateFrom}
            onChange={(e) => {
              setLocalDateFrom(e.target.value)
              const newFilters = {
                ...filters,
                dateFrom: e.target.value || undefined,
              }
              onFiltersChange(newFilters)
              updateURL(newFilters)
            }}
            className="h-9 w-36 rounded-md border-gray-300 py-1.5 pr-3 pl-8 text-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:[color-scheme:dark]"
            aria-label="Filter from date"
          />
        </div>

        {/* Date To Filter */}
        <div className="relative">
          <CalendarIcon className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="date"
            id="date-to"
            value={localDateTo}
            onChange={(e) => {
              setLocalDateTo(e.target.value)
              const newFilters = {
                ...filters,
                dateTo: e.target.value || undefined,
              }
              onFiltersChange(newFilters)
              updateURL(newFilters)
            }}
            className="h-9 w-36 rounded-md border-gray-300 py-1.5 pr-3 pl-8 text-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:[color-scheme:dark]"
            aria-label="Filter to date"
          />
        </div>

        {/* Clear All Button */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="h-9 rounded-md bg-gray-100 px-3 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            aria-label="Clear all filters"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
