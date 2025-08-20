'use client'

import { useState, useEffect, useCallback } from 'react'
import { Combobox } from '@headlessui/react'
import { ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/24/outline'
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

export function GalleryFilters({ filters, onFiltersChange }: GalleryFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  const [speakerQuery, setSpeakerQuery] = useState('')
  const [selectedSpeaker, setSelectedSpeaker] = useState<{ _id: string; name: string } | null>(null)
  const [localDateFrom, setLocalDateFrom] = useState(filters.dateFrom || '')
  const [localDateTo, setLocalDateTo] = useState(filters.dateTo || '')
  const [localPhotographer, setLocalPhotographer] = useState(filters.photographerSearch || '')
  const [localLocation, setLocalLocation] = useState(filters.locationSearch || '')
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
      featured: featured === 'true' ? true : featured === 'false' ? false : undefined,
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
    if (Object.values(urlFilters).some(v => v !== undefined)) {
      onFiltersChange(urlFilters)
      setLocalDateFrom(dateFrom || '')
      setLocalDateTo(dateTo || '')
      setLocalPhotographer(photographer || '')
      setLocalLocation(location || '')
    }
  }, []) // Only on mount
  
  // Update URL when filters change
  const updateURL = useCallback((newFilters: typeof filters) => {
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
  }, [router, pathname])

  const { data: searchResults } = api.speakers.search.useQuery(
    { query: debouncedQuery, includeFeatured: true },
    { 
      enabled: debouncedQuery.length > 0,
    }
  )

  const handleFeaturedChange = (value: string) => {
    const newFeatured = value === 'all' ? undefined : value === 'featured'
    const newFilters = { ...filters, featured: newFeatured }
    onFiltersChange(newFilters)
    updateURL(newFilters)
  }

  const handleSpeakerSelect = (speaker: { _id: string; name: string } | null) => {
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
      locationSearch: undefined
    }
    onFiltersChange(newFilters)
    updateURL(newFilters)
  }

  const hasActiveFilters = filters.featured !== undefined || 
    filters.speakerId !== undefined ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined ||
    filters.photographerSearch !== undefined ||
    filters.locationSearch !== undefined

  useEffect(() => {
    if (debouncedPhotographer !== filters.photographerSearch) {
      const newFilters = { ...filters, photographerSearch: debouncedPhotographer || undefined }
      onFiltersChange(newFilters)
      updateURL(newFilters)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPhotographer])

  useEffect(() => {
    if (debouncedLocation !== filters.locationSearch) {
      const newFilters = { ...filters, locationSearch: debouncedLocation || undefined }
      onFiltersChange(newFilters)
      updateURL(newFilters)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLocation])

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label htmlFor="featured-filter" className="block text-sm font-medium text-gray-700">
            Featured Status
          </label>
          <select
            id="featured-filter"
            value={filters.featured === undefined ? 'all' : filters.featured ? 'featured' : 'non-featured'}
            onChange={(e) => handleFeaturedChange(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          >
            <option value="all">All Images</option>
            <option value="featured">Featured Only</option>
            <option value="non-featured">Non-Featured</option>
          </select>
        </div>

        <div className="w-64">
          <label className="block text-sm font-medium text-gray-700">
            Speaker Filter
          </label>
          {selectedSpeaker ? (
            <div className="mt-1 flex items-center justify-between rounded-md border border-gray-300 bg-gray-50 px-3 py-2">
              <span className="text-sm">{selectedSpeaker.name}</span>
              <button
                onClick={clearSpeakerFilter}
                className="ml-2 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Combobox value={selectedSpeaker} onChange={handleSpeakerSelect}>
              <div className="relative mt-1">
                <Combobox.Input
                  className="w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                  displayValue={(speaker: { _id: string; name: string } | null) => speaker?.name || ''}
                  onChange={(event) => setSpeakerQuery(event.target.value)}
                  placeholder="Search speakers..."
                  value={speakerQuery}
                />
                <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                </Combobox.Button>
                {searchResults && searchResults.length > 0 && (
                  <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                    {searchResults.map((speaker) => (
                      <Combobox.Option
                        key={speaker._id}
                        value={speaker}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2 pl-3 pr-9 ${
                            active ? 'bg-indigo-600 text-white' : 'text-gray-900'
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
        </div>

        <div>
          <label htmlFor="date-from" className="block text-sm font-medium text-gray-700">
            Date From
          </label>
          <input
            type="date"
            id="date-from"
            value={localDateFrom}
            onChange={(e) => {
              setLocalDateFrom(e.target.value)
              const newFilters = { ...filters, dateFrom: e.target.value || undefined }
              onFiltersChange(newFilters)
              updateURL(newFilters)
            }}
            className="mt-1 block w-full rounded-md border-gray-300 py-2 px-3 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="date-to" className="block text-sm font-medium text-gray-700">
            Date To
          </label>
          <input
            type="date"
            id="date-to"
            value={localDateTo}
            onChange={(e) => {
              setLocalDateTo(e.target.value)
              const newFilters = { ...filters, dateTo: e.target.value || undefined }
              onFiltersChange(newFilters)
              updateURL(newFilters)
            }}
            className="mt-1 block w-full rounded-md border-gray-300 py-2 px-3 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="photographer" className="block text-sm font-medium text-gray-700">
            Photographer
          </label>
          <input
            type="text"
            id="photographer"
            value={localPhotographer}
            onChange={(e) => setLocalPhotographer(e.target.value)}
            placeholder="Search photographer..."
            className="mt-1 block w-full rounded-md border-gray-300 py-2 px-3 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-700">
            Location
          </label>
          <input
            type="text"
            id="location"
            value={localLocation}
            onChange={(e) => setLocalLocation(e.target.value)}
            placeholder="Search location..."
            className="mt-1 block w-full rounded-md border-gray-300 py-2 px-3 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="mt-6 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Clear All Filters
          </button>
        )}
      </div>

      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap gap-2">
          {filters.featured !== undefined && (
            <span className="inline-flex items-center gap-x-1 rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
              {filters.featured ? 'Featured' : 'Non-Featured'}
              <button
                onClick={() => {
                  const newFilters = { ...filters, featured: undefined }
                  onFiltersChange(newFilters)
                  updateURL(newFilters)
                }}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-200"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          )}
          {selectedSpeaker && (
            <span className="inline-flex items-center gap-x-1 rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
              Speaker: {selectedSpeaker?.name || 'Unknown'}
              <button
                onClick={clearSpeakerFilter}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-200"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.dateFrom && (
            <span className="inline-flex items-center gap-x-1 rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
              From: {filters.dateFrom}
              <button
                onClick={() => {
                  setLocalDateFrom('')
                  const newFilters = { ...filters, dateFrom: undefined }
                  onFiltersChange(newFilters)
                  updateURL(newFilters)
                }}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-200"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.dateTo && (
            <span className="inline-flex items-center gap-x-1 rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
              To: {filters.dateTo}
              <button
                onClick={() => {
                  setLocalDateTo('')
                  const newFilters = { ...filters, dateTo: undefined }
                  onFiltersChange(newFilters)
                  updateURL(newFilters)
                }}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-200"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.photographerSearch && (
            <span className="inline-flex items-center gap-x-1 rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
              Photographer: {filters.photographerSearch}
              <button
                onClick={() => {
                  setLocalPhotographer('')
                  const newFilters = { ...filters, photographerSearch: undefined }
                  onFiltersChange(newFilters)
                  updateURL(newFilters)
                }}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-200"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.locationSearch && (
            <span className="inline-flex items-center gap-x-1 rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">
              Location: {filters.locationSearch}
              <button
                onClick={() => {
                  setLocalLocation('')
                  const newFilters = { ...filters, locationSearch: undefined }
                  onFiltersChange(newFilters)
                  updateURL(newFilters)
                }}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-200"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}