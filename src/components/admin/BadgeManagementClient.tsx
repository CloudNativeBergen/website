'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { useTheme } from 'next-themes'
import { api } from '@/lib/trpc/client'
import type { BadgeType } from '@/lib/badge/types'
import {
  AcademicCapIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  UserGroupIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { BadgePreviewModal } from '@/components/admin/BadgePreviewModal'
import BadgeValidator from '@/components/admin/BadgeValidator'
import type { BadgeRecord } from '@/lib/badge/types'
import { createLocalhostWarning } from '@/lib/localhost-warning'
import { useNotification } from './NotificationProvider'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import type { Speaker } from '@/lib/speaker/types'
import type { ProposalExisting } from '@/lib/proposal/types'

type SpeakerWithProposals = Speaker & { proposals?: ProposalExisting[] }

interface BadgeManagementClientProps {
  conferenceId: string
  conferenceTitle: string
  conferenceStartDate: string
  domain?: string
  initialSpeakers: SpeakerWithProposals[]
  initialBadges: BadgeRecord[]
}

type TabView = 'issue' | 'validate'

export function BadgeManagementClient({
  conferenceId,
  conferenceTitle,
  conferenceStartDate,
  domain,
  initialSpeakers,
  initialBadges,
}: BadgeManagementClientProps) {
  const { showNotification } = useNotification()
  const { theme } = useTheme()
  const [activeTab, setActiveTab] = useState<TabView>('issue')
  const [badgeType, setBadgeType] = useState<BadgeType>('speaker')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [selectedSpeakers, setSelectedSpeakers] = useState<Set<string>>(
    new Set(),
  )
  const [isIssuing, setIsIssuing] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewSvg, setPreviewSvg] = useState<string | null>(null)
  const [selectedBadge, setSelectedBadge] = useState<BadgeRecord | null>(null)
  const [showBadgePreview, setShowBadgePreview] = useState(false)
  const [filterAlreadyIssued, setFilterAlreadyIssued] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data: existingBadges, refetch: refetchBadges } =
    api.badge.list.useQuery({ conferenceId }, { initialData: initialBadges })

  const issueMutation = api.badge.issue.useMutation({
    onSuccess: (data) => {
      refetchBadges()
      setSelectedSpeakers(new Set())
      setIsIssuing(false)
      showNotification({
        type: 'success',
        title: 'Badge Issued',
        message: data.message || 'Badge issued successfully',
      })
    },
    onError: (error) => {
      console.error('Failed to issue badge:', error)
      setIsIssuing(false)
      showNotification({
        type: 'error',
        title: 'Failed to Issue Badge',
        message: error.message || 'An error occurred while issuing the badge',
      })
    },
  })

  const bulkIssueMutation = api.badge.bulkIssue.useMutation({
    onSuccess: (data) => {
      refetchBadges()
      setSelectedSpeakers(new Set())
      setIsIssuing(false)
      const successful = data.summary?.successful || 0
      const failed = data.summary?.failed || 0
      showNotification({
        type: successful > 0 ? 'success' : 'error',
        title: 'Bulk Badge Issuance Complete',
        message: `Successfully issued ${successful} badge${successful !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}`,
      })

      // Show detailed errors for failed badges
      if (failed > 0 && data.results) {
        const errors = data.results
          .filter((r) => !r.success)
          .map((r) => r.error)
          .filter((e, i, arr) => arr.indexOf(e) === i) // Deduplicate
        console.error('Badge issuance errors:', errors)
      }
    },
    onError: (error) => {
      console.error('Failed to issue badges:', error)
      setIsIssuing(false)
      showNotification({
        type: 'error',
        title: 'Failed to Issue Badges',
        message: error.message || 'An error occurred while issuing badges',
      })
    },
  })

  const handleSelectSpeaker = (speakerId: string) => {
    const newSelection = new Set(selectedSpeakers)
    if (newSelection.has(speakerId)) {
      newSelection.delete(speakerId)
    } else {
      newSelection.add(speakerId)
    }
    setSelectedSpeakers(newSelection)
  }

  const handleSelectAll = () => {
    if (!eligibleSpeakers) return

    if (
      selectedSpeakers.size === eligibleSpeakers.length &&
      eligibleSpeakers.length > 0
    ) {
      setSelectedSpeakers(new Set())
    } else {
      setSelectedSpeakers(
        new Set(eligibleSpeakers.map((s: SpeakerWithProposals) => s._id)),
      )
    }
  }

  const handleBadgeTypeChange = (type: BadgeType) => {
    setBadgeType(type)
    setSelectedSpeakers(new Set())
  }

  const handlePreview = async () => {
    const { generateBadgeSVG } = await import('@/lib/badge/svg')
    const { formatConferenceDateForBadge } = await import('@/lib/time')

    const conferenceYear = conferenceStartDate
      ? new Date(conferenceStartDate).getFullYear().toString()
      : new Date().getFullYear().toString()

    const conferenceDate = conferenceStartDate
      ? formatConferenceDateForBadge(conferenceStartDate)
      : 'TBD'

    const svg = generateBadgeSVG({
      conferenceTitle,
      conferenceYear,
      conferenceDate,
      badgeType,
    })

    setPreviewSvg(svg)
    setShowPreview(true)
  }

  const handleIssueBadges = async () => {
    if (selectedSpeakers.size === 0) return

    setIsIssuing(true)

    if (selectedSpeakers.size === 1) {
      const speakerId = Array.from(selectedSpeakers)[0]
      issueMutation.mutate({
        speakerId,
        conferenceId,
        badgeType,
      })
    } else {
      bulkIssueMutation.mutate({
        speakerIds: Array.from(selectedSpeakers),
        conferenceId,
        badgeType,
      })
    }
  }

  const badges = useMemo(() => existingBadges || [], [existingBadges])
  const localhostWarning = createLocalhostWarning(domain, 'badge recipients')

  const hasExistingBadge = (speakerId: string): boolean => {
    if (!badges) return false
    return badges.some(
      (badge) =>
        typeof badge.speaker === 'object' &&
        '_id' in badge.speaker &&
        badge.speaker._id === speakerId &&
        badge.badge_type === badgeType,
    )
  }

  const getBadgeForSpeaker = (speakerId: string): BadgeRecord | null => {
    if (!badges) return null
    return (
      badges.find(
        (badge) =>
          typeof badge.speaker === 'object' &&
          '_id' in badge.speaker &&
          badge.speaker._id === speakerId &&
          badge.badge_type === badgeType,
      ) || null
    )
  }

  const eligibleSpeakers = useMemo(() => {
    let filtered = initialSpeakers.filter((speaker: SpeakerWithProposals) => {
      if (badgeType === 'organizer') {
        return speaker.is_organizer === true
      } else {
        return (
          !speaker.is_organizer ||
          (speaker.is_organizer &&
            speaker.proposals &&
            speaker.proposals.length > 0)
        )
      }
    })

    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase()
      filtered = filtered.filter(
        (speaker: SpeakerWithProposals) =>
          speaker.name.toLowerCase().includes(query) ||
          speaker.email.toLowerCase().includes(query) ||
          speaker.title?.toLowerCase().includes(query),
      )
    }

    if (filterAlreadyIssued) {
      filtered = filtered.filter((speaker: SpeakerWithProposals) => {
        if (!badges) return true
        return !badges.some(
          (badge) =>
            typeof badge.speaker === 'object' &&
            '_id' in badge.speaker &&
            badge.speaker._id === speaker._id &&
            badge.badge_type === badgeType,
        )
      })
    }

    return filtered
  }, [
    initialSpeakers,
    badgeType,
    debouncedSearchQuery,
    filterAlreadyIssued,
    badges,
  ])

  const handleViewBadge = (badge: BadgeRecord) => {
    setSelectedBadge(badge)
    setShowBadgePreview(true)
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('issue')}
            className={`flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'issue'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <AcademicCapIcon className="h-5 w-5" />
            Issue Badges
          </button>
          <button
            onClick={() => setActiveTab('validate')}
            className={`flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
              activeTab === 'validate'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <ShieldCheckIcon className="h-5 w-5" />
            Validate Badge
          </button>
        </nav>
      </div>

      {/* Validator Tab Content */}
      {activeTab === 'validate' && <BadgeValidator />}

      {/* Issue Badges Tab Content */}
      {activeTab === 'issue' && (
        <>
          {/* Development Mode Warning */}
          {localhostWarning && (
            <div className="rounded-lg">
              {localhostWarning}
              <div className="mt-3 rounded-md bg-blue-50 p-4 dark:bg-blue-900/30">
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium">Development Mode Restrictions:</p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    <li>You can only issue badges to yourself</li>
                    <li>Badge emails will contain localhost URLs</li>
                    <li>
                      Recipients cannot access verification links from other
                      devices
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Controls Bar - Badge Type, Search, and Filters */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {/* Badge Type Selector */}
              <span className="isolate inline-flex rounded-md">
                <button
                  type="button"
                  onClick={() => handleBadgeTypeChange('speaker')}
                  className={`relative inline-flex items-center gap-2 rounded-l-md px-3 py-2 text-sm font-semibold inset-ring-1 focus:z-10 ${
                    badgeType === 'speaker'
                      ? 'bg-brand-aqua inset-ring-brand-aqua/50 text-white dark:bg-brand-cloud-blue dark:inset-ring-brand-cloud-blue/50'
                      : 'bg-white/10 text-gray-700 inset-ring-gray-300 hover:bg-gray-50 dark:bg-gray-800/50 dark:text-gray-300 dark:inset-ring-gray-600 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <AcademicCapIcon className="h-4 w-4" />
                  Speaker
                </button>
                <button
                  type="button"
                  onClick={() => handleBadgeTypeChange('organizer')}
                  className={`relative -ml-px inline-flex items-center gap-2 rounded-r-md px-3 py-2 text-sm font-semibold inset-ring-1 focus:z-10 ${
                    badgeType === 'organizer'
                      ? 'bg-brand-aqua inset-ring-brand-aqua/50 text-white dark:bg-brand-cloud-blue dark:inset-ring-brand-cloud-blue/50'
                      : 'bg-white/10 text-gray-700 inset-ring-gray-300 hover:bg-gray-50 dark:bg-gray-800/50 dark:text-gray-300 dark:inset-ring-gray-600 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <UserGroupIcon className="h-4 w-4" />
                  Organizer
                </button>
              </span>

              {/* Search */}
              <div className="relative flex-1 sm:max-w-xs">
                <div className="-mr-px grid grow grid-cols-1 focus-within:relative">
                  <input
                    type="text"
                    placeholder="Search speakers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="col-start-1 row-start-1 block w-full rounded-md bg-white py-2 pr-3 pl-10 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-blue-600 sm:pl-9 sm:text-sm/6 dark:bg-gray-700 dark:text-white dark:outline-gray-600 dark:placeholder:text-gray-300 dark:focus:outline-blue-500"
                  />
                  <MagnifyingGlassIcon
                    aria-hidden="true"
                    className="pointer-events-none col-start-1 row-start-1 ml-3 size-5 self-center text-gray-400 sm:size-4"
                  />
                </div>
              </div>

              {filterAlreadyIssued && (
                <button
                  onClick={() => setFilterAlreadyIssued(false)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Clear
                </button>
              )}
            </div>

            {/* Right side: Filters, Preview, and Issue Badges */}
            <div className="flex items-center gap-2">
              {selectedSpeakers.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedSpeakers.size} selected
                  </span>
                  <button
                    onClick={() => setSelectedSpeakers(new Set())}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleIssueBadges}
                    disabled={isIssuing}
                    className="bg-brand-aqua dark:hover:bg-brand-aqua flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white hover:bg-brand-cloud-blue disabled:opacity-50 dark:bg-brand-cloud-blue"
                  >
                    {isIssuing ? (
                      <>Issuing...</>
                    ) : (
                      <>
                        <CheckIcon className="h-5 w-5" />
                        Issue {selectedSpeakers.size} Badge
                        {selectedSpeakers.size > 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                </div>
              )}
              <FilterDropdown
                label="Filters"
                activeCount={filterAlreadyIssued ? 1 : 0}
                position="right"
              >
                <div className="p-1.5">
                  <FilterOption
                    checked={filterAlreadyIssued}
                    onClick={() => setFilterAlreadyIssued(!filterAlreadyIssued)}
                    keepOpen
                  >
                    Hide already issued
                  </FilterOption>
                  <div className="mt-2 px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                    {badgeType === 'speaker' ? (
                      <span>
                        Issue badges to speakers with accepted or confirmed
                        talks
                      </span>
                    ) : (
                      <span>Issue badges to conference organizers</span>
                    )}
                  </div>
                </div>
              </FilterDropdown>
              <button
                onClick={handlePreview}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <EyeIcon className="h-4 w-4" />
                Preview
              </button>
            </div>
          </div>

          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {eligibleSpeakers.length} of {eligibleSpeakers.length}{' '}
            speakers
          </div>

          {/* Speakers Table */}
          <div className="overflow-x-auto">
            <div className="overflow-hidden shadow-sm ring-1 ring-gray-200 md:rounded-lg dark:ring-gray-700">
              <table className="w-full table-fixed divide-y divide-gray-300 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th scope="col" className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={
                          eligibleSpeakers.length > 0 &&
                          selectedSpeakers.size === eligibleSpeakers.length
                        }
                        onChange={handleSelectAll}
                        className="text-brand-aqua focus:ring-brand-aqua rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-brand-cloud-blue dark:focus:ring-brand-cloud-blue"
                      />
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                    >
                      Speaker
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                    >
                      Email
                    </th>
                    <th
                      scope="col"
                      className="w-52 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                    >
                      Badge Status
                    </th>
                    <th
                      scope="col"
                      className="w-44 px-4 py-3 text-right text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                  {eligibleSpeakers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <div className="text-gray-500 dark:text-gray-400">
                          {badgeType === 'speaker' ? (
                            <p>
                              No eligible speakers found. Speakers must have
                              accepted or confirmed talks.
                            </p>
                          ) : (
                            <p>No organizers found.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    eligibleSpeakers.map((speaker: SpeakerWithProposals) => {
                      const isSelected = selectedSpeakers.has(speaker._id)
                      const hasBadge = hasExistingBadge(speaker._id)
                      const badge = getBadgeForSpeaker(speaker._id)
                      const hasEmailError =
                        badge && !badge.email_sent && badge.email_error

                      return (
                        <tr
                          key={speaker._id}
                          className={`${
                            isSelected
                              ? 'bg-brand-sky-mist dark:bg-brand-cloud-blue/10'
                              : hasBadge
                                ? 'bg-gray-50 dark:bg-gray-900/50'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-900/50'
                          } transition-colors`}
                        >
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectSpeaker(speaker._id)}
                              disabled={hasBadge}
                              className="text-brand-aqua focus:ring-brand-aqua rounded border-gray-300 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-brand-cloud-blue dark:focus:ring-brand-cloud-blue"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              {speaker.image && (
                                <img
                                  src={`${speaker.image}?w=80&h=80&q=85&auto=format&fit=crop`}
                                  alt={speaker.name}
                                  className="h-10 w-10 rounded-full object-cover"
                                />
                              )}
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {speaker.name}
                                </div>
                                {speaker.title && (
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {speaker.title}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                            {speaker.email}
                          </td>
                          <td className="px-4 py-4">
                            {hasBadge && badge ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                      hasEmailError
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                        : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    }`}
                                  >
                                    {hasEmailError ? (
                                      <>
                                        <ExclamationTriangleIcon className="h-3 w-3" />
                                        Email Failed
                                      </>
                                    ) : (
                                      <>
                                        <CheckIcon className="h-3 w-3" />
                                        Issued
                                      </>
                                    )}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(
                                    badge.issued_at,
                                  ).toLocaleDateString()}
                                </div>
                                {hasEmailError && badge.email_error && (
                                  <div className="text-xs text-red-600 dark:text-red-400">
                                    {badge.email_error}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                Not Issued
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right">
                            {hasBadge && badge ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => handleViewBadge(badge)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                                >
                                  <EyeIcon className="h-4 w-4" />
                                  View
                                </button>
                                <a
                                  href={`/api/badge/${badge.badge_id}/download`}
                                  download
                                  className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                                >
                                  Download
                                </a>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Badge Preview Modal */}
          <Transition appear show={showPreview}>
            <Dialog
              as="div"
              className={`relative z-10 ${theme === 'dark' ? 'dark' : ''}`}
              onClose={() => setShowPreview(false)}
            >
              <TransitionChild
                enter="ease-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <div className="bg-opacity-25 fixed inset-0 bg-black" />
              </TransitionChild>

              <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                  <TransitionChild
                    enter="ease-out duration-300"
                    enterFrom="opacity-0 scale-95"
                    enterTo="opacity-100 scale-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100 scale-100"
                    leaveTo="opacity-0 scale-95"
                  >
                    <DialogPanel className="max-h-[90vh] w-full max-w-2xl transform overflow-hidden rounded-2xl border border-brand-frosted-steel bg-brand-glacier-white p-6 shadow-2xl transition-all dark:border-gray-700 dark:bg-gray-900">
                      <div className="mb-6 flex items-start justify-between">
                        <DialogTitle className="font-space-grotesk text-xl font-semibold text-brand-slate-gray dark:text-white">
                          Badge Preview -{' '}
                          {badgeType === 'speaker' ? 'Speaker' : 'Organizer'}
                        </DialogTitle>
                        <button
                          type="button"
                          className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                          onClick={() => setShowPreview(false)}
                          aria-label="Close"
                        >
                          <XMarkIcon className="h-6 w-6" />
                        </button>
                      </div>

                      <div className="max-h-[calc(90vh-200px)] overflow-y-auto">
                        <div className="bg-brand-mist/50 mb-6 rounded-lg p-4 dark:bg-gray-800/50">
                          <p className="text-sm text-brand-slate-gray dark:text-gray-400">
                            This preview shows how the badge will look. You can
                            use this to adjust the design in{' '}
                            <code className="bg-brand-mist rounded px-2 py-1 font-mono text-xs dark:bg-gray-700">
                              /src/lib/badge/svg.ts
                            </code>{' '}
                            before issuing badges.
                          </p>
                        </div>

                        <div className="flex justify-center">
                          <div
                            className="inline-block rounded-xl border border-brand-frosted-steel bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                            style={{ width: '100%', maxWidth: '400px' }}
                          >
                            <div
                              style={{
                                width: '100%',
                                height: 'auto',
                                aspectRatio: '1/1',
                              }}
                              dangerouslySetInnerHTML={{
                                __html: previewSvg || '',
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 flex justify-end gap-3 border-t border-brand-frosted-steel pt-4 dark:border-gray-700">
                        <button
                          onClick={() => {
                            if (!previewSvg) return
                            const blob = new Blob([previewSvg], {
                              type: 'image/svg+xml',
                            })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `badge-preview-${badgeType}.svg`
                            a.click()
                            URL.revokeObjectURL(url)
                          }}
                          className="bg-brand-mist rounded-lg px-4 py-2 text-sm font-medium text-brand-slate-gray transition-colors hover:bg-brand-frosted-steel dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        >
                          Download Preview
                        </button>
                        <button
                          onClick={() => setShowPreview(false)}
                          className="bg-brand-aqua dark:hover:bg-brand-aqua rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue dark:bg-brand-cloud-blue"
                        >
                          Close
                        </button>
                      </div>
                    </DialogPanel>
                  </TransitionChild>
                </div>
              </div>
            </Dialog>
          </Transition>

          {/* Badge Preview Modal */}
          {selectedBadge && (
            <BadgePreviewModal
              isOpen={showBadgePreview}
              onClose={() => {
                setShowBadgePreview(false)
                setSelectedBadge(null)
              }}
              badge={selectedBadge}
            />
          )}
        </>
      )}
    </div>
  )
}
