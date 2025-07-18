import { useState, useEffect } from 'react'
import { Speaker } from '@/lib/speaker/types'
import { Format } from '@/lib/proposal/types'
import { searchSpeakers } from '@/lib/speaker/client'
import {
  UserIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { SpeakerAvatars } from './SpeakerAvatars'

// Constants for better maintainability
const DEFAULT_CO_SPEAKER_LIMIT = 1
const SEARCH_DEBOUNCE_MS = 300
const BLUR_DELAY_MS = 200

// Helper function to get co-speaker limits based on format
function getCoSpeakerLimit(format: Format): number {
  switch (format) {
    case Format.lightning_10:
      return 0 // No co-speakers for lightning talks
    case Format.presentation_20:
    case Format.presentation_25:
    case Format.presentation_40:
    case Format.presentation_45:
      return DEFAULT_CO_SPEAKER_LIMIT // One co-speaker for presentations
    case Format.workshop_120:
    case Format.workshop_240:
      return 3 // Three co-speakers for workshops
    default:
      return DEFAULT_CO_SPEAKER_LIMIT // Default to one co-speaker
  }
}

function getFormatDisplayName(format: Format): string {
  switch (format) {
    case Format.lightning_10:
      return 'Lightning Talk'
    case Format.presentation_20:
    case Format.presentation_25:
    case Format.presentation_40:
    case Format.presentation_45:
      return 'Presentation'
    case Format.workshop_120:
    case Format.workshop_240:
      return 'Workshop'
    default:
      return 'Talk'
  }
}

interface CoSpeakerSelectorProps {
  selectedSpeakers: Speaker[] // This should be just the co-speakers (not including current user)
  onSpeakersChange: (speakers: Speaker[]) => void
  currentUserSpeaker: Speaker
  format: Format
}

export function CoSpeakerSelector({
  selectedSpeakers,
  onSpeakersChange,
  currentUserSpeaker,
  format,
}: CoSpeakerSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Speaker[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [error, setError] = useState<string>('')

  const maxCoSpeakers = getCoSpeakerLimit(format)
  const formatName = getFormatDisplayName(format)
  const isLightningTalk = format === Format.lightning_10

  // Filter out the current user and already selected speakers from search results
  const filteredResults = searchResults.filter(
    (speaker) =>
      speaker._id !== currentUserSpeaker._id &&
      !selectedSpeakers.some((s) => s._id === speaker._id),
  )

  // selectedSpeakers already contains only co-speakers (current user is excluded by ProposalForm)
  const coSpeakers = selectedSpeakers

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true)
        setError('')

        try {
          const result = await searchSpeakers(searchQuery)

          if (result.error) {
            setError(result.error.message)
            setSearchResults([])
          } else {
            setSearchResults(result.speakers)
            setShowResults(true)
          }
        } catch {
          setError('Failed to search speakers')
          setSearchResults([])
        } finally {
          setIsSearching(false)
        }
      } else {
        setSearchResults([])
        setShowResults(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  const handleSelectSpeaker = (speaker: Speaker) => {
    // Check if we've reached the limit
    if (selectedSpeakers.length >= maxCoSpeakers) {
      return // Don't add if we've reached the limit
    }

    // Add the selected speaker to the list
    const newSpeakers = [...selectedSpeakers, speaker]
    onSpeakersChange(newSpeakers)
    setSearchQuery('')
    setShowResults(false)
  }

  const handleRemoveSpeaker = (speakerId: string) => {
    const newSpeakers = selectedSpeakers.filter((s) => s._id !== speakerId)
    onSpeakersChange(newSpeakers)
  }

  const handleSearchFocus = () => {
    if (searchQuery.trim().length >= 2) {
      setShowResults(true)
    }
  }

  const handleSearchBlur = () => {
    // Delay hiding results to allow for clicks
    setTimeout(() => setShowResults(false), BLUR_DELAY_MS)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="font-space-grotesk block text-sm leading-6 font-medium text-brand-slate-gray">
          Co-speakers
        </label>
        <p className="font-inter mt-1 text-sm leading-6 text-brand-cloud-gray">
          {isLightningTalk ? (
            <>
              Lightning talks are presented by a single speaker and cannot have
              co-speakers.
            </>
          ) : (
            <>
              Add co-speakers to your {formatName.toLowerCase()}. You can search
              for existing speakers in our database. Maximum {maxCoSpeakers}{' '}
              co-speaker{maxCoSpeakers > 1 ? 's' : ''} allowed.
            </>
          )}
        </p>
        <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                Adding existing speakers only
              </h3>
              <p className="mt-1 text-sm text-blue-700">
                You can currently only add existing speakers who have already
                registered. New speakers must create their own account and
                register before they can be added as co-speakers.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Warning for lightning talks */}
      {isLightningTalk && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-orange-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-orange-800">
                Co-speakers not available for lightning talks
              </h3>
              <p className="mt-1 text-sm text-orange-700">
                Lightning talks are designed as single-speaker presentations. If
                you need to present with co-speakers, please select a different
                talk format (20-minute, 25-minute, 40-minute, or 45-minute
                presentation).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Show co-speakers section only if not a lightning talk */}
      {!isLightningTalk && (
        <>
          {/* Co-speakers display */}
          <div className="space-y-3">
            {/* Co-speakers (can be removed) */}
            {coSpeakers.length > 0 && (
              <div>
                <div className="mt-1 space-y-2">
                  {coSpeakers.map((speaker) => (
                    <div
                      key={speaker._id}
                      className="flex items-center justify-between rounded-lg border bg-gray-50 p-3"
                    >
                      <div className="flex items-center space-x-3">
                        <SpeakerAvatars
                          speakers={[speaker]}
                          size="sm"
                          maxVisible={1}
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {speaker.name}
                          </p>
                          {speaker.title && (
                            <p className="text-xs text-gray-500">
                              {speaker.title}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSpeaker(speaker._id)}
                        className="text-red-500 transition-colors hover:text-red-700"
                        title="Remove co-speaker"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search input - only show if under the limit */}
          {selectedSpeakers.length < maxCoSpeakers && (
            <div className="relative">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={handleSearchFocus}
                  onBlur={handleSearchBlur}
                  placeholder="Search for speakers by name, email, or title..."
                  className="w-full rounded-lg border border-gray-300 py-2 pr-4 pl-10 focus:border-transparent focus:ring-2 focus:ring-brand-cloud-blue"
                />
              </div>

              {/* Search results dropdown */}
              {showResults && (
                <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
                  {isSearching && (
                    <div className="flex items-center justify-center p-4">
                      <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-brand-cloud-blue"></div>
                      <span className="ml-2 text-sm text-gray-600">
                        Searching...
                      </span>
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-50 p-4 text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  {!isSearching &&
                    !error &&
                    filteredResults.length === 0 &&
                    searchQuery.trim().length >= 2 && (
                      <div className="p-4 text-center">
                        <div className="mb-2">
                          <svg
                            className="mx-auto h-6 w-6 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                            />
                          </svg>
                        </div>
                        <p className="mb-2 text-sm text-gray-600">
                          No speakers found matching &quot;{searchQuery}&quot;
                        </p>
                        <p className="text-xs text-gray-500">
                          Only registered speakers can be added as co-speakers.
                          The person you&apos;re looking for may need to create
                          their own account first.
                        </p>
                      </div>
                    )}

                  {!isSearching && !error && filteredResults.length > 0 && (
                    <div className="py-2">
                      {filteredResults.map((speaker) => (
                        <button
                          key={speaker._id}
                          type="button"
                          onClick={() => handleSelectSpeaker(speaker)}
                          className="flex w-full items-center space-x-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                        >
                          <div className="flex-shrink-0">
                            {speaker.image ? (
                              <img
                                src={`${speaker.image}?w=32&h=32&fit=crop`}
                                alt={speaker.name}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                                <UserIcon className="h-5 w-5 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {speaker.name}
                            </p>
                            {speaker.title && (
                              <p className="truncate text-xs text-gray-500">
                                {speaker.title}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Show limit reached message */}
          {selectedSpeakers.length >= maxCoSpeakers && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-amber-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800">
                    Co-speaker limit reached
                  </h3>
                  <p className="mt-1 text-sm text-amber-700">
                    You have reached the maximum number of co-speakers (
                    {maxCoSpeakers}) for {formatName.toLowerCase()}s.
                    {maxCoSpeakers < 3 && (
                      <>
                        {' '}
                        If you need more co-speakers, consider changing to a
                        workshop format which allows up to 3 co-speakers.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
            <p className="text-xs text-gray-500">
              Type at least 2 characters to search for speakers
            </p>
          )}
        </>
      )}
    </div>
  )
}
