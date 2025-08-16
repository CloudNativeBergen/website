/**
 * Featured Talks Management Component
 * Provides UI for managing featured talks with search and add/remove functionality
 */

'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  StarIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'

interface FeaturedTalksManagerProps {
  className?: string
}

export function FeaturedTalksManager({
  className = '',
}: FeaturedTalksManagerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchStatus, setSearchStatus] = useState<'confirmed' | 'accepted'>(
    'confirmed',
  )

  const utils = api.useUtils()

  // Queries
  const {
    data: featuredTalks = [],
    isLoading: featuredLoading,
    refetch: refetchFeatured,
  } = api.featured.featuredTalks.useQuery()

  const { data: availableTalks = [], isLoading: searchLoading } =
    api.proposals.searchTalks.useQuery(
      {
        query: searchQuery,
        status: searchStatus,
      },
      { enabled: showSearch && searchQuery.length > 0 },
    )

  // Mutations
  const addTalkMutation = api.featured.addTalk.useMutation({
    onSuccess: () => {
      refetchFeatured()
      utils.proposals.searchTalks.invalidate()
      utils.featured.summary.invalidate()
      setSearchQuery('')
      setShowSearch(false)
    },
    onError: (err) => {
      console.error('Failed to add featured talk:', err)
    },
  })

  const removeTalkMutation = api.featured.removeTalk.useMutation({
    onSuccess: () => {
      refetchFeatured()
      utils.proposals.searchTalks.invalidate()
      utils.featured.summary.invalidate()
    },
    onError: (err) => {
      console.error('Failed to remove featured talk:', err)
    },
  })

  const handleAddTalk = async (talkId: string) => {
    try {
      await addTalkMutation.mutateAsync({ talkId })
    } catch {
      // Error handled in onError callback
    }
  }

  const handleRemoveTalk = async (talkId: string) => {
    try {
      await removeTalkMutation.mutateAsync({ talkId })
    } catch {
      // Error handled in onError callback
    }
  }

  const formatTalkFormat = (format: string) => {
    const formatMap: Record<string, string> = {
      presentation_45: '45min Talk',
      presentation_40: '40min Talk',
      presentation_25: '25min Talk',
      presentation_20: '20min Talk',
      lightning_10: '10min Lightning',
      workshop_90: '90min Workshop',
      workshop_180: '3hr Workshop',
    }
    return formatMap[format] || format
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800'
      case 'accepted':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (featuredLoading) {
    return (
      <div className={`rounded-lg bg-white p-6 shadow ${className}`}>
        <div className="animate-pulse">
          <div className="mb-4 h-6 w-1/3 rounded bg-gray-200"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded bg-gray-200"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg bg-white shadow ${className}`}>
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <StarIcon className="h-6 w-6 text-yellow-500" />
            <h3 className="text-lg font-medium text-gray-900">
              Featured Talks ({featuredTalks.length})
            </h3>
          </div>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="inline-flex items-center space-x-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Add Talk</span>
          </button>
        </div>
      </div>

      {/* Search Section */}
      {showSearch && (
        <div className="border-b border-gray-200 bg-gray-50 p-6">
          <div className="mb-4 space-y-3">
            <div>
              <label htmlFor="talk-search" className="sr-only">
                Search talks
              </label>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
                <input
                  id="talk-search"
                  type="text"
                  placeholder="Search talks by title or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white py-2 pr-3 pl-10 leading-5 placeholder-gray-500 focus:border-blue-500 focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="status-filter"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Status Filter
              </label>
              <select
                id="status-filter"
                value={searchStatus}
                onChange={(e) =>
                  setSearchStatus(e.target.value as 'confirmed' | 'accepted')
                }
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="confirmed">Confirmed talks only</option>
                <option value="accepted">Accepted talks only</option>
              </select>
            </div>
          </div>

          {searchLoading ? (
            <div className="animate-pulse space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded bg-gray-200"></div>
              ))}
            </div>
          ) : (
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {availableTalks.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">
                  {searchQuery
                    ? 'No talks found matching your search.'
                    : 'Start typing to search for talks...'}
                </p>
              ) : (
                availableTalks.map((talk) => (
                  <div
                    key={talk._id}
                    className="flex items-start justify-between rounded-md border border-gray-200 bg-white p-3 hover:border-gray-300"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-sm font-medium text-gray-900">
                            {talk.title}
                          </h4>
                          {talk.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                              {typeof talk.description === 'string'
                                ? talk.description
                                : 'Has description'}
                            </p>
                          )}
                        </div>
                        <div className="ml-3 flex flex-shrink-0 items-center space-x-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(talk.status)}`}
                          >
                            {talk.status}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                            {formatTalkFormat(talk.format)}
                          </span>
                        </div>
                      </div>

                      {talk.speakers && talk.speakers.length > 0 && (
                        <div className="mt-2 flex items-center space-x-1">
                          <UserIcon className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-500">
                            {talk.speakers
                              .map((speaker) =>
                                typeof speaker === 'object' && 'name' in speaker
                                  ? speaker.name
                                  : 'Unknown Speaker',
                              )
                              .join(', ')}
                          </span>
                        </div>
                      )}

                      {talk.topics && talk.topics.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {talk.topics.slice(0, 3).map(
                            (topic) =>
                              'title' in topic &&
                              'color' in topic && (
                                <span
                                  key={topic._id}
                                  className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                                  style={{
                                    backgroundColor: topic.color + '20',
                                    color: topic.color,
                                  }}
                                >
                                  {topic.title}
                                </span>
                              ),
                          )}
                          {talk.topics.length > 3 && (
                            <span className="text-xs text-gray-400">
                              +{talk.topics.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleAddTalk(talk._id)}
                      disabled={addTalkMutation.isPending}
                      className="ml-3 inline-flex items-center rounded border border-transparent bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
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

      {/* Featured Talks List */}
      <div className="p-6">
        {featuredTalks.length === 0 ? (
          <div className="py-8 text-center">
            <ChatBubbleLeftRightIcon className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No featured talks
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by adding your first featured talk.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {featuredTalks.map((talk) => (
              <div
                key={talk._id}
                className="rounded-lg border border-yellow-200 bg-yellow-50 p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between">
                      <h4 className="text-sm font-medium text-gray-900">
                        {talk.title}
                      </h4>
                      <button
                        onClick={() => handleRemoveTalk(talk._id)}
                        disabled={removeTalkMutation.isPending}
                        className="ml-2 inline-flex items-center rounded-full border border-transparent p-1 text-red-400 hover:bg-red-100 hover:text-red-600 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
                        title="Remove from featured"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>

                    {talk.description && (
                      <p className="mt-1 line-clamp-3 text-sm text-gray-600">
                        {typeof talk.description === 'string'
                          ? talk.description
                          : 'Has description'}
                      </p>
                    )}

                    <div className="mt-2 flex items-center space-x-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(talk.status)}`}
                      >
                        {talk.status}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                        {formatTalkFormat(talk.format)}
                      </span>
                    </div>

                    {talk.speakers && talk.speakers.length > 0 && (
                      <div className="mt-2 flex items-center space-x-1">
                        <UserIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {talk.speakers
                            .map((speaker) => speaker.name)
                            .join(', ')}
                        </span>
                      </div>
                    )}

                    {talk.topics && talk.topics.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {talk.topics.map(
                          (topic, index) =>
                            'title' in topic &&
                            'color' in topic && (
                              <span
                                key={topic._id || index}
                                className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium"
                                style={{
                                  backgroundColor: topic.color + '20',
                                  color: topic.color,
                                }}
                              >
                                {topic.title}
                              </span>
                            ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
