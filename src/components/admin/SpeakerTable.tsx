'use client'

import { Speaker, Flags } from '@/lib/speaker/types'
import {
  ProposalExisting,
  Status,
  Format,
  languages,
  formats,
} from '@/lib/proposal/types'
import {
  EnvelopeIcon,
  UserIcon,
  ClipboardIcon,
  XMarkIcon,
  PencilIcon,
  EyeIcon,
  ArrowRightCircleIcon,
} from '@heroicons/react/24/outline'
import { AppEnvironment } from '@/lib/environment/config'
import { CheckBadgeIcon, ClockIcon, CheckIcon } from '@heroicons/react/24/solid'
import { SpeakerIndicators } from '@/lib/proposal'
import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'
import { SearchInput } from '@/components/SearchInput'
import { FilterDropdown, FilterOption } from '@/components/admin'
import {
  ActionMenu,
  ActionMenuItem,
  ActionMenuDivider,
} from '@/components/ActionMenu'
import { useState, useMemo } from 'react'
import { iconForLink, titleForLink } from '@/components/SocialIcons'
import { hasBlueskySocial, extractHandleFromUrl } from '@/lib/bluesky/utils'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

const extractLinkedInLink = (links: string[] | undefined): string | null => {
  if (!links) return null
  return (
    links.find((link) => {
      try {
        const hostname = new URL(link).hostname
        return hostname === 'linkedin.com' || hostname === 'www.linkedin.com'
      } catch {
        return false
      }
    }) || null
  )
}

interface SpeakerWithProposals extends Speaker {
  proposals: ProposalExisting[]
}

interface SpeakerTableProps {
  speakers: SpeakerWithProposals[]
  currentConferenceId?: string
  onEditSpeaker: (speaker: SpeakerWithProposals) => void
  onPreviewSpeaker: (speaker: SpeakerWithProposals) => void
}

interface ColumnVisibility {
  email: boolean
  bluesky: boolean
  linkedin: boolean
  indicators: boolean
}

interface FilterOptions {
  status: string
  newSpeakers: boolean
  localSpeakers: boolean
  underrepresentedSpeakers: boolean
  travelSupportSpeakers: boolean
}

const getCompactFormat = (format: Format): string => {
  const fullFormat = formats.get(format)
  if (!fullFormat) return format

  if (fullFormat.includes('Lightning Talk')) return '10min Lightning'
  if (fullFormat.includes('Presentation')) {
    const match = fullFormat.match(/\((\d+) min\)/)
    return match ? `${match[1]}min Talk` : fullFormat
  }
  if (fullFormat.includes('Workshop')) {
    const match = fullFormat.match(/\((\d+) hours?\)/)
    return match ? `${match[1]}h Workshop` : fullFormat
  }

  return fullFormat
}

// Helper function to extract conference ID from proposal
const getProposalConferenceId = (proposal: ProposalExisting): string | null => {
  if (
    typeof proposal.conference === 'object' &&
    proposal.conference &&
    '_id' in proposal.conference
  ) {
    return proposal.conference._id
  }
  if (typeof proposal.conference === 'string') {
    return proposal.conference
  }
  return null
}

function getProposalBadgeColor(status: Status): BadgeColor {
  switch (status) {
    case Status.confirmed:
    case Status.accepted:
      return 'green'
    case Status.submitted:
      return 'blue'
    case Status.draft:
      return 'yellow'
    case Status.rejected:
      return 'red'
    case Status.withdrawn:
    default:
      return 'gray'
  }
}

const CopyEmailButton = ({ email }: { email: string }) => {
  const { copied, copyToClipboard } = useCopyToClipboard()

  return (
    <button
      onClick={() => copyToClipboard(email)}
      className="ml-2 cursor-pointer p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      title={copied ? 'Copied!' : 'Copy email'}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <ClipboardIcon className="h-4 w-4" />
      )}
    </button>
  )
}

const CopyBlueskyUsernameButton = ({
  blueskyLink,
}: {
  blueskyLink: string
}) => {
  const { copied, copyToClipboard } = useCopyToClipboard()

  const handleCopy = () => {
    const username = extractHandleFromUrl(blueskyLink) || blueskyLink
    copyToClipboard(username)
  }

  return (
    <button
      onClick={handleCopy}
      className="ml-2 cursor-pointer p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      title={copied ? 'Copied username!' : 'Copy username'}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <ClipboardIcon className="h-4 w-4" />
      )}
    </button>
  )
}

export function SpeakerTable({
  speakers,
  currentConferenceId,
  onEditSpeaker,
  onPreviewSpeaker,
}: SpeakerTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState<FilterOptions>({
    status: 'all',
    newSpeakers: false,
    localSpeakers: false,
    underrepresentedSpeakers: false,
    travelSupportSpeakers: false,
  })
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
    email: true,
    bluesky: false,
    linkedin: false,
    indicators: true,
  })

  const filteredSpeakers = useMemo(() => {
    return speakers.filter((speaker) => {
      const matchesSearch =
        searchTerm === '' ||
        speaker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (speaker.title &&
          speaker.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (speaker.email &&
          speaker.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (speaker.proposals &&
          speaker.proposals.some((proposal) =>
            proposal.title.toLowerCase().includes(searchTerm.toLowerCase()),
          ))

      const matchesStatus =
        filters.status === 'all' ||
        speaker.proposals.some((proposal) => {
          if (!currentConferenceId) return proposal.status === filters.status
          return (
            getProposalConferenceId(proposal) === currentConferenceId &&
            proposal.status === filters.status
          )
        })

      const isNewSpeaker =
        !currentConferenceId ||
        speaker.proposals.every(
          (proposal) =>
            getProposalConferenceId(proposal) === currentConferenceId,
        )
      const matchesNewSpeaker = !filters.newSpeakers || isNewSpeaker
      const matchesLocalSpeaker =
        !filters.localSpeakers ||
        (speaker.flags && speaker.flags.includes(Flags.localSpeaker))
      const matchesUnderrepresentedSpeaker =
        !filters.underrepresentedSpeakers ||
        (speaker.flags && speaker.flags.includes(Flags.diverseSpeaker))
      const matchesTravelSupportSpeaker =
        !filters.travelSupportSpeakers ||
        (speaker.flags && speaker.flags.includes(Flags.requiresTravelFunding))

      return (
        matchesSearch &&
        matchesStatus &&
        matchesNewSpeaker &&
        matchesLocalSpeaker &&
        matchesUnderrepresentedSpeaker &&
        matchesTravelSupportSpeaker
      )
    })
  }, [speakers, searchTerm, filters, currentConferenceId])

  const toggleColumnVisibility = (column: keyof ColumnVisibility) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [column]: !prev[column],
    }))
  }

  const resetFilters = () => {
    setSearchTerm('')
    setFilters({
      status: 'all',
      newSpeakers: false,
      localSpeakers: false,
      underrepresentedSpeakers: false,
      travelSupportSpeakers: false,
    })
  }

  const hasActiveFilters =
    searchTerm !== '' ||
    filters.status !== 'all' ||
    filters.newSpeakers ||
    filters.localSpeakers ||
    filters.underrepresentedSpeakers ||
    filters.travelSupportSpeakers

  const activeFilterCount = Object.values(filters).filter((value) =>
    typeof value === 'boolean' ? value : value !== 'all',
  ).length

  if (speakers.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
        <UserIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
          No speakers found
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          No speakers with accepted or confirmed talks were found for this
          conference.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search speakers..."
            className="flex-1 sm:max-w-xs"
          />

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <FilterDropdown
            label="Filters"
            activeCount={activeFilterCount}
            width="wider"
            position="right"
          >
            <div className="p-1.5">
              <div className="mb-2">
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Status
                </label>
                <div className="space-y-0.5">
                  <FilterOption
                    type="radio"
                    checked={filters.status === 'all'}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, status: 'all' }))
                    }
                    keepOpen
                  >
                    All
                  </FilterOption>
                  <FilterOption
                    type="radio"
                    checked={filters.status === 'confirmed'}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, status: 'confirmed' }))
                    }
                    keepOpen
                  >
                    Confirmed
                  </FilterOption>
                  <FilterOption
                    type="radio"
                    checked={filters.status === 'accepted'}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, status: 'accepted' }))
                    }
                    keepOpen
                  >
                    Accepted
                  </FilterOption>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-2 dark:border-gray-600">
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Speaker Type
                </label>
                <div className="space-y-0.5">
                  <FilterOption
                    checked={filters.newSpeakers}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        newSpeakers: !prev.newSpeakers,
                      }))
                    }
                    keepOpen
                  >
                    New speakers only
                  </FilterOption>
                  <FilterOption
                    checked={filters.localSpeakers}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        localSpeakers: !prev.localSpeakers,
                      }))
                    }
                    keepOpen
                  >
                    Local speakers only
                  </FilterOption>
                  <FilterOption
                    checked={filters.underrepresentedSpeakers}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        underrepresentedSpeakers:
                          !prev.underrepresentedSpeakers,
                      }))
                    }
                    keepOpen
                  >
                    Underrepresented speakers
                  </FilterOption>
                  <FilterOption
                    checked={filters.travelSupportSpeakers}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        travelSupportSpeakers: !prev.travelSupportSpeakers,
                      }))
                    }
                    keepOpen
                  >
                    Travel support needed
                  </FilterOption>
                </div>
              </div>
            </div>
          </FilterDropdown>

          <FilterDropdown
            label="Columns"
            activeCount={Object.values(columnVisibility).filter(Boolean).length}
            position="right"
          >
            {Object.entries(columnVisibility).map(([column, isVisible]) => (
              <FilterOption
                key={column}
                checked={isVisible}
                onClick={() =>
                  toggleColumnVisibility(column as keyof ColumnVisibility)
                }
                keepOpen
              >
                {column.charAt(0).toUpperCase() + column.slice(1)}
              </FilterOption>
            ))}
          </FilterDropdown>
        </div>
      </div>

      <div className="text-sm text-gray-500 dark:text-gray-400">
        Showing {filteredSpeakers.length} of {speakers.length} speakers
      </div>

      <div className="overflow-x-auto">
        <div className="overflow-hidden shadow-sm ring-1 ring-gray-200 md:rounded-lg dark:ring-gray-700">
          <table className="w-full table-fixed divide-y divide-gray-300 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th
                  scope="col"
                  className="w-44 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                >
                  Speaker
                </th>
                {columnVisibility.indicators && (
                  <th
                    scope="col"
                    className="hidden w-24 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:table-cell dark:text-gray-400"
                  >
                    Indicators
                  </th>
                )}
                {columnVisibility.email && (
                  <th
                    scope="col"
                    className="w-48 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                  >
                    Email
                  </th>
                )}
                {columnVisibility.linkedin && (
                  <th
                    scope="col"
                    className="w-32 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                  >
                    LinkedIn
                  </th>
                )}
                {columnVisibility.bluesky && (
                  <th
                    scope="col"
                    className="w-32 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                  >
                    Bluesky
                  </th>
                )}
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                >
                  Talks
                </th>
                <th
                  scope="col"
                  className="w-28 px-4 py-3 text-right text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {filteredSpeakers.map((speaker) => {
                const linkedinLink = extractLinkedInLink(speaker.links)
                const blueskyLink = hasBlueskySocial(speaker.links)

                return (
                  <tr
                    key={speaker._id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center">
                        <div className="h-8 w-8 shrink-0">
                          {speaker.image ? (
                            <img
                              className="h-8 w-8 rounded-full object-cover"
                              src={speaker.image}
                              alt={speaker.name}
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 dark:bg-gray-600">
                              <UserIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                            </div>
                          )}
                        </div>
                        <div className="ml-3 min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                            {speaker.name}
                          </div>
                          {speaker.title && (
                            <div className="max-w-[180px] truncate text-xs text-gray-500 dark:text-gray-400">
                              {speaker.title}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {columnVisibility.indicators && (
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <SpeakerIndicators
                          speakers={[speaker]}
                          size="md"
                          maxVisible={5}
                          className="justify-start"
                          currentConferenceId={currentConferenceId}
                        />
                      </td>
                    )}
                    {columnVisibility.email && (
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center text-sm text-gray-900 dark:text-white">
                          <EnvelopeIcon className="mr-2 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                          <a
                            href={`mailto:${speaker.email}`}
                            className="truncate hover:text-blue-600 dark:hover:text-blue-400"
                            title={speaker.email}
                          >
                            {speaker.email}
                          </a>
                          <CopyEmailButton email={speaker.email} />
                        </div>
                      </td>
                    )}
                    {columnVisibility.linkedin && (
                      <td className="px-4 py-3">
                        {linkedinLink ? (
                          <div className="flex min-w-0 items-center text-sm text-gray-900 dark:text-white">
                            <div className="mr-2 h-4 w-4 shrink-0">
                              {iconForLink(
                                linkedinLink,
                                'h-4 w-4 text-gray-400 dark:text-gray-500',
                              )}
                            </div>
                            <a
                              href={linkedinLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate hover:text-blue-600 dark:hover:text-blue-400"
                              title={titleForLink(linkedinLink)}
                            >
                              View Profile
                            </a>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">
                            -
                          </span>
                        )}
                      </td>
                    )}
                    {columnVisibility.bluesky && (
                      <td className="px-4 py-3">
                        {blueskyLink ? (
                          <div className="flex min-w-0 items-center text-sm text-gray-900 dark:text-white">
                            <div className="mr-2 h-4 w-4 shrink-0">
                              {iconForLink(
                                blueskyLink,
                                'h-4 w-4 text-gray-400 dark:text-gray-500',
                              )}
                            </div>
                            <a
                              href={blueskyLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate hover:text-blue-600 dark:hover:text-blue-400"
                              title={titleForLink(blueskyLink)}
                            >
                              View Profile
                            </a>
                            <CopyBlueskyUsernameButton
                              blueskyLink={blueskyLink}
                            />
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">
                            -
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {speaker.proposals
                          .filter((proposal) => {
                            if (!currentConferenceId) return true
                            return (
                              getProposalConferenceId(proposal) ===
                              currentConferenceId
                            )
                          })
                          .map((proposal) => (
                            <div
                              key={`${speaker._id}-${proposal._id}`}
                              className="flex items-center gap-2 text-xs"
                            >
                              <StatusBadge
                                label={
                                  proposal.status.charAt(0).toUpperCase() +
                                  proposal.status.slice(1)
                                }
                                color={getProposalBadgeColor(proposal.status)}
                                icon={
                                  proposal.status === Status.confirmed
                                    ? CheckBadgeIcon
                                    : ClockIcon
                                }
                              />
                              <span
                                className="min-w-0 flex-1 truncate text-gray-900 dark:text-white"
                                title={proposal.title}
                              >
                                {proposal.title}
                              </span>
                              <span
                                className="shrink-0 text-gray-500 dark:text-gray-400"
                                title={`${formats.get(proposal.format)} in ${languages.get(proposal.language)}`}
                              >
                                {getCompactFormat(proposal.format)} •{' '}
                                {languages.get(proposal.language)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </td>
                    <td className="w-20 px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center justify-end">
                        <ActionMenu ariaLabel={`Actions for ${speaker.name}`}>
                          <ActionMenuItem
                            onClick={() => onEditSpeaker(speaker)}
                            icon={PencilIcon}
                          >
                            Edit Speaker
                          </ActionMenuItem>
                          <ActionMenuItem
                            onClick={() => onPreviewSpeaker(speaker)}
                            icon={EyeIcon}
                          >
                            Preview Profile
                          </ActionMenuItem>
                          {AppEnvironment.isDevelopment && (
                            <>
                              <ActionMenuDivider />
                              <ActionMenuItem
                                onClick={async () => {
                                  const { addImpersonateParam } =
                                    await import('@/lib/impersonation')
                                  window.open(
                                    addImpersonateParam(
                                      '/cfp/list',
                                      speaker._id,
                                    ),
                                    '_blank',
                                  )
                                }}
                                icon={ArrowRightCircleIcon}
                              >
                                View as Speaker (dev)
                              </ActionMenuItem>
                            </>
                          )}
                        </ActionMenu>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
