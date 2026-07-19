'use client'

import { formatDateSafe } from '@/lib/time'

import { useState, useEffect } from 'react'
import { api } from '@/lib/trpc/client'
import { isLocalhostClient } from '@/lib/environment/localhost'
import type { BadgeType } from '@/lib/badge/types'
import {
  AcademicCapIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  ArrowDownTrayIcon,
  IdentificationIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { BadgePreviewModal } from '@/components/admin/BadgePreviewModal'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import BadgeValidator from '@/components/admin/BadgeValidator'
import { SearchInput } from '@/components/SearchInput'
import { StatusBadge } from '@/components/StatusBadge'
import type { BadgeRecord } from '@/lib/badge/types'
import { createLocalhostWarning } from '@/lib/localhost-warning'
import { useNotification } from './NotificationProvider'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import {
  ActionMenu,
  ActionMenuItem,
  ActionMenuDivider,
} from '@/components/ActionMenu'
import { DataTable, type Column } from '@/components/DataTable'
import type { Speaker } from '@/lib/speaker/types'
import type { ProposalExisting } from '@/lib/proposal/types'

type SpeakerWithProposals = Speaker & { proposals?: ProposalExisting[] }

interface BadgeManagementClientProps {
  conferenceTitle: string
  conferenceStartDate: string
  domain?: string
  initialSpeakers: SpeakerWithProposals[]
  initialBadges: BadgeRecord[]
}

type TabView = 'issue' | 'validate'

export function BadgeManagementClient({
  conferenceTitle,
  conferenceStartDate,
  domain,
  initialSpeakers,
  initialBadges,
}: BadgeManagementClientProps) {
  const { showNotification } = useNotification()
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
  const [sendEmail, setSendEmail] = useState(true)
  const [deleteBadgeInfo, setDeleteBadgeInfo] = useState<{
    badgeId: string
    speakerName: string
  } | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const { data: existingBadges, refetch: refetchBadges } =
    api.badge.admin.list.useQuery({}, { initialData: initialBadges })

  const issueMutation = api.badge.admin.issue.useMutation({
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

  const bulkIssueMutation = api.badge.admin.bulkIssue.useMutation({
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
        message: error.message || 'An error occurred during bulk issuance',
      })
    },
  })

  const deleteMutation = api.badge.admin.delete.useMutation({
    onSuccess: (data) => {
      refetchBadges()
      showNotification({
        type: 'success',
        title: 'Badge Deleted',
        message: data.message || 'Badge deleted successfully',
      })
    },
    onError: (error) => {
      console.error('Failed to delete badge:', error)
      showNotification({
        type: 'error',
        title: 'Failed to Delete Badge',
        message: error.message || 'An error occurred while deleting the badge',
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
        badgeType,
        sendEmail,
      })
    } else {
      bulkIssueMutation.mutate({
        speakerIds: Array.from(selectedSpeakers),
        badgeType,
        sendEmail,
      })
    }
  }

  const badges = existingBadges || []
  const localhostWarning = createLocalhostWarning(domain, 'badge recipients')

  const hasExistingBadge = (speakerId: string): boolean => {
    if (!badges) return false
    return badges.some(
      (badge) =>
        badge.speaker &&
        typeof badge.speaker === 'object' &&
        '_id' in badge.speaker &&
        badge.speaker._id === speakerId &&
        badge.badgeType === badgeType,
    )
  }

  const getBadgeForSpeaker = (speakerId: string): BadgeRecord | null => {
    if (!badges) return null
    return (
      badges.find(
        (badge) =>
          badge.speaker &&
          typeof badge.speaker === 'object' &&
          '_id' in badge.speaker &&
          badge.speaker._id === speakerId &&
          badge.badgeType === badgeType,
      ) || null
    )
  }

  const eligibleSpeakers = (() => {
    let filtered = initialSpeakers.filter((speaker: SpeakerWithProposals) => {
      if (badgeType === 'organizer') {
        return speaker.isOrganizer === true
      } else {
        return (
          !speaker.isOrganizer ||
          (speaker.isOrganizer &&
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
            badge.speaker &&
            typeof badge.speaker === 'object' &&
            '_id' in badge.speaker &&
            badge.speaker._id === speaker._id &&
            badge.badgeType === badgeType,
        )
      })
    }

    return filtered
  })()

  const handleViewBadge = (badge: BadgeRecord) => {
    setSelectedBadge(badge)
    setShowBadgePreview(true)
  }

  const handleCopyBadgeUrl = async (badgeId: string, speakerName: string) => {
    const badgeUrl = `${window.location.origin}/badge/${badgeId}`

    try {
      await navigator.clipboard.writeText(badgeUrl)
      showNotification({
        type: 'success',
        title: 'URL Copied',
        message: `Badge URL for ${speakerName} copied to clipboard`,
      })
    } catch (error) {
      console.error('Failed to copy URL:', error)
      showNotification({
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy badge URL to clipboard',
      })
    }
  }

  const handleDeleteBadge = async (badgeId: string, speakerName: string) => {
    setDeleteBadgeInfo({ badgeId, speakerName })
  }

  const confirmDeleteBadge = async () => {
    if (!deleteBadgeInfo) return
    try {
      await deleteMutation.mutateAsync({ badgeId: deleteBadgeInfo.badgeId })
    } catch (error) {
      console.error('Error deleting badge:', error)
    }
    setDeleteBadgeInfo(null)
  }

  const isDevelopment = isLocalhostClient()

  const columns: Column<SpeakerWithProposals>[] = [
    {
      key: 'speaker',
      header: 'Speaker',
      primary: true,
      render: (speaker) => {
        const isSelected = selectedSpeakers.has(speaker._id)
        const hasBadge = hasExistingBadge(speaker._id)
        return (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleSelectSpeaker(speaker._id)}
              disabled={hasBadge}
              className="text-brand-aqua focus:ring-brand-aqua rounded border-gray-300 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-brand-cloud-blue dark:focus:ring-brand-cloud-blue"
            />
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
        )
      },
    },
    {
      key: 'email',
      header: 'Email',
      render: (speaker) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {speaker.email}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Badge Status',
      width: '13rem',
      render: (speaker) => {
        const hasBadge = hasExistingBadge(speaker._id)
        const badge = getBadgeForSpeaker(speaker._id)
        const hasEmailError = badge && !badge.emailSent && badge.emailError
        return hasBadge && badge ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {hasEmailError ? (
                <StatusBadge
                  label="Email Failed"
                  color="red"
                  icon={ExclamationTriangleIcon}
                />
              ) : (
                <StatusBadge label="Issued" color="green" icon={CheckIcon} />
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {formatDateSafe(badge.issuedAt)}
            </div>
            {hasEmailError && badge.emailError && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {badge.emailError}
              </div>
            )}
          </div>
        ) : (
          <StatusBadge label="Not Issued" color="gray" />
        )
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: '11rem',
      render: (speaker) => {
        const hasBadge = hasExistingBadge(speaker._id)
        const badge = getBadgeForSpeaker(speaker._id)
        return hasBadge && badge ? (
          <ActionMenu ariaLabel="Badge actions">
            <ActionMenuItem
              onClick={() => handleViewBadge(badge)}
              icon={EyeIcon}
            >
              View Badge
            </ActionMenuItem>
            <ActionMenuItem
              onClick={() => handleCopyBadgeUrl(badge.badgeId, speaker.name)}
              icon={ClipboardDocumentIcon}
            >
              Copy URL
            </ActionMenuItem>
            <ActionMenuItem
              onClick={() => {}}
              icon={ArrowDownTrayIcon}
              href={`/api/badge/${badge.badgeId}/download`}
              download
            >
              Download
            </ActionMenuItem>
            {isDevelopment && (
              <>
                <ActionMenuDivider />
                <ActionMenuItem
                  onClick={() => handleDeleteBadge(badge.badgeId, speaker.name)}
                  icon={TrashIcon}
                  variant="danger"
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </ActionMenuItem>
              </>
            )}
          </ActionMenu>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
        )
      },
    },
  ]

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

              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search speakers..."
                className="flex-1 sm:max-w-xs"
              />

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
                activeCount={
                  (filterAlreadyIssued ? 1 : 0) + (sendEmail ? 0 : 1)
                }
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
                  <FilterOption
                    checked={sendEmail}
                    onClick={() => setSendEmail(!sendEmail)}
                    keepOpen
                  >
                    Send email notification
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

          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            {eligibleSpeakers.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={
                    eligibleSpeakers.length > 0 &&
                    selectedSpeakers.size === eligibleSpeakers.length
                  }
                  onChange={handleSelectAll}
                  className="text-brand-aqua focus:ring-brand-aqua rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-brand-cloud-blue dark:focus:ring-brand-cloud-blue"
                />
                Select all
              </label>
            )}
            <span>
              Showing {eligibleSpeakers.length} of {eligibleSpeakers.length}{' '}
              speakers
            </span>
          </div>

          {/* Speakers Table */}
          <DataTable<SpeakerWithProposals>
            data={eligibleSpeakers}
            columns={columns}
            keyExtractor={(speaker) => speaker._id}
            isRowSelected={(speaker) => selectedSpeakers.has(speaker._id)}
            emptyState={{
              title:
                badgeType === 'speaker'
                  ? 'No eligible speakers found'
                  : 'No organizers found',
              description:
                badgeType === 'speaker'
                  ? 'Speakers must have accepted or confirmed talks.'
                  : undefined,
            }}
          />

          {/* Badge Preview Modal */}
          <ModalShell
            isOpen={showPreview}
            onClose={() => setShowPreview(false)}
            size="2xl"
            title={`Badge Preview - ${badgeType === 'speaker' ? 'Speaker' : 'Organizer'}`}
            icon={<IdentificationIcon className="h-5 w-5" />}
          >
            <div className="max-h-[calc(85dvh-200px)] overflow-y-auto sm:max-h-[calc(90vh-200px)]">
              <div className="bg-brand-mist/50 mb-6 rounded-lg p-4 dark:bg-gray-800/50">
                <p className="text-sm text-brand-slate-gray dark:text-gray-400">
                  This preview shows how the badge will look. You can use this
                  to adjust the design in{' '}
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
          </ModalShell>

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

          <ConfirmationModal
            isOpen={!!deleteBadgeInfo}
            onClose={() => setDeleteBadgeInfo(null)}
            onConfirm={confirmDeleteBadge}
            title="Delete Badge"
            message={`Are you sure you want to delete the badge for ${deleteBadgeInfo?.speakerName}? This action cannot be undone.`}
            confirmButtonText="Delete"
            variant="danger"
          />
        </>
      )}
    </div>
  )
}
