'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  UserIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  StarIcon,
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'

interface FeaturedSpeakersManagerProps {
  className?: string
}

export function FeaturedSpeakersManager({
  className = '',
}: FeaturedSpeakersManagerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const utils = api.useUtils()

  const {
    data: featuredSpeakers = [],
    isLoading: featuredLoading,
    refetch: refetchFeatured,
  } = api.featured.featuredSpeakers.useQuery()

  const { data: availableSpeakers = [], isLoading: searchLoading } =
    api.speakers.search.useQuery(
      { query: searchQuery },
      { enabled: showSearch && searchQuery.length > 0 },
    )

  const addSpeakerMutation = api.featured.addSpeaker.useMutation({
    onSuccess: () => {
      refetchFeatured()
      utils.speakers.search.invalidate()
      utils.featured.summary.invalidate()
      setSearchQuery('')
      setShowSearch(false)
    },
    onError: (err) => {
      console.error('Failed to add featured speaker:', err)
    },
  })

  const removeSpeakerMutation = api.featured.removeSpeaker.useMutation({
    onSuccess: () => {
      refetchFeatured()
      utils.speakers.search.invalidate()
      utils.featured.summary.invalidate()
    },
    onError: (err) => {
      console.error('Failed to remove featured speaker:', err)
    },
  })

  const handleAddSpeaker = async (speakerId: string) => {
    try {
      await addSpeakerMutation.mutateAsync({ speakerId })
    } catch {}
  }

  const handleRemoveSpeaker = async (speakerId: string) => {
    try {
      await removeSpeakerMutation.mutateAsync({ speakerId })
    } catch {}
  }

  if (featuredLoading) {
    return (
      <div
        className={`rounded-lg bg-white p-6 shadow dark:bg-gray-800 ${className}`}
      >
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-1/3 rounded bg-gray-200 dark:bg-gray-700"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-16 rounded bg-gray-200 dark:bg-gray-700"
              ></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg bg-white shadow dark:bg-gray-800 ${className}`}>
      <div className="border-b border-gray-200 p-6 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <StarIcon className="h-6 w-6 text-yellow-500 dark:text-yellow-400" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Featured Speakers ({featuredSpeakers.length})
            </h3>
          </div>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="inline-flex items-center space-x-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Add Speaker</span>
          </button>
        </div>
      </div>

      {/* Search Section */}
      {showSearch && (
        <div className="border-b border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4">
            <label htmlFor="speaker-search" className="sr-only">
              Search speakers
            </label>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400 dark:text-gray-500" />
              <input
                id="speaker-search"
                type="text"
                placeholder="Search speakers by name or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full rounded-md border border-gray-300 bg-white py-2 pr-3 pl-10 leading-5 placeholder-gray-500 focus:border-blue-500 focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
              />
            </div>
          </div>

          {searchLoading ? (
            <div className="animate-pulse space-y-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded bg-gray-200 dark:bg-gray-700"
                ></div>
              ))}
            </div>
          ) : (
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {availableSpeakers.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  {searchQuery
                    ? 'No speakers found matching your search.'
                    : 'Start typing to search for speakers...'}
                </p>
              ) : (
                availableSpeakers.map((speaker) => (
                  <div
                    key={speaker._id}
                    className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
                  >
                    <div className="flex items-center space-x-3">
                      {speaker.image ? (
                        <img
                          src={speaker.image}
                          alt={speaker.name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                          <UserIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {speaker.name}
                        </p>
                        {speaker.title && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {speaker.title}
                          </p>
                        )}
                        {speaker.proposals && speaker.proposals.length > 0 && (
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            {speaker.proposals.length} proposal
                            {speaker.proposals.length > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddSpeaker(speaker._id)}
                      disabled={addSpeakerMutation.isPending}
                      className="inline-flex items-center rounded border border-transparent bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-800/50"
                    >
                      <StarIconSolid className="mr-1 h-3 w-3" />
                      Feature
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Featured Speakers List */}
      <div className="p-6">
        {featuredSpeakers.length === 0 ? (
          <div className="py-8 text-center">
            <StarIcon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              No featured speakers
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Get started by adding your first featured speaker.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {featuredSpeakers.map((speaker) => (
              <div
                key={speaker._id}
                className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800/50 dark:bg-yellow-900/20"
              >
                <div className="flex items-center space-x-4">
                  {speaker.image ? (
                    <img
                      src={speaker.image}
                      alt={speaker.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                      <UserIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                      {speaker.name}
                    </h4>
                    {speaker.title && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {speaker.title}
                      </p>
                    )}
                    {speaker.talks && speaker.talks.length > 0 && (
                      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                        {speaker.talks.length} talk
                        {speaker.talks.length > 1 ? 's' : ''}:{' '}
                        {speaker.talks.map((talk) => talk.title).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveSpeaker(speaker._id)}
                  disabled={removeSpeakerMutation.isPending}
                  className="inline-flex items-center rounded-full border border-transparent p-1 text-red-400 hover:bg-red-100 hover:text-red-600 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/50 dark:hover:text-red-300"
                  title="Remove from featured"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
