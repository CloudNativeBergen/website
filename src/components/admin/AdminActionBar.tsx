'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckIcon,
  XMarkIcon,
  BellIcon,
  ClockIcon,
  StarIcon,
  UserPlusIcon,
  MapPinIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  EnvelopeIcon,
  PencilIcon,
  EyeIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
} from '@heroicons/react/20/solid'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import clsx from 'clsx'
import { ProposalExisting, Action } from '@/lib/proposal/types'
import { ProposalStatusBadge } from '@/lib/proposal/ui'
import { extractSpeakersFromProposal } from '@/lib/proposal/utils'
import { getSpeakerIndicators } from '@/lib/speaker/utils'
import { Speaker } from '@/lib/speaker/types'
import { SpeakerEmailModal } from './SpeakerEmailModal'
import { ProposalManagementModal } from './ProposalManagementModal'
import SpeakerProfilePreview from '@/components/SpeakerProfilePreview'
import { useRouter } from 'next/navigation'
import { AdminButton } from '@/components/admin/AdminButton'

import { Conference } from '@/lib/conference/types'

interface AdminActionBarProps {
  proposal: ProposalExisting
  domain?: string
  fromEmail: string
  conference: Conference
}

export function AdminActionBar({
  proposal,
  domain,
  fromEmail,
  conference,
}: AdminActionBarProps) {
  const router = useRouter()
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [speakersWithEmail, setSpeakersWithEmail] = useState<
    {
      id: string
      name: string
      email: string
    }[]
  >([])
  const [previewSpeaker, setPreviewSpeaker] = useState<Speaker | null>(null)

  const speakers = extractSpeakersFromProposal(proposal)
  const indicators = getSpeakerIndicators(speakers)

  const handleAction = (action: Action) => {
    const event = new CustomEvent('proposalAction', {
      detail: { action, proposal },
    })
    window.dispatchEvent(event)
  }

  const handleEmailSpeakers = useCallback(() => {
    const speakersWithValidEmail = speakers
      .filter((speaker) => speaker.email)
      .map((speaker) => ({
        id: speaker._id,
        name: speaker.name,
        email: speaker.email,
      }))

    if (speakersWithValidEmail.length > 0) {
      setSpeakersWithEmail(speakersWithValidEmail)
      setShowEmailModal(true)
    }
  }, [speakers])

  const handleEditProposal = () => {
    setShowEditModal(true)
  }

  const handlePreviewSpeaker = useCallback(() => {
    if (speakers.length > 0) {
      const speakerForPreview = speakers[0] as Speaker
      setPreviewSpeaker(speakerForPreview)
      setShowPreviewModal(true)
    }
  }, [speakers])

  const handleProposalUpdated = () => {
    router.refresh()
    setShowEditModal(false)
  }

  const canApprove =
    proposal.status === 'submitted' || proposal.status === 'waitlisted'
  const canWaitlist = proposal.status === 'submitted'
  const canConfirm = proposal.status === 'accepted'
  const canRemind = proposal.status === 'accepted'
  const canReject =
    proposal.status === 'submitted' ||
    proposal.status === 'accepted' ||
    proposal.status === 'waitlisted'
  const canWithdraw =
    proposal.status === 'accepted' || proposal.status === 'confirmed'

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if Cmd (Mac) or Ctrl (Windows/Linux) is pressed
      const isCmdOrCtrl = event.metaKey || event.ctrlKey

      if (!isCmdOrCtrl) return

      // Prevent default browser behavior
      switch (event.key.toLowerCase()) {
        case 'e':
          event.preventDefault()
          handleEditProposal()
          break
        case 'p':
          event.preventDefault()
          if (speakers.length > 0) {
            handlePreviewSpeaker()
          }
          break
        case 'm':
          event.preventDefault()
          if (
            speakers.length > 0 &&
            speakers.some((speaker) => speaker.email)
          ) {
            handleEmailSpeakers()
          }
          break
        case 's':
          // Note: CMD+S will trigger save in edit modal if it's open
          // This is handled by the ProposalManagementModal component
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [speakers, handleEmailSpeakers, handlePreviewSpeaker])
  const {
    isSeasonedSpeaker,
    isNewSpeaker,
    isLocalSpeaker,
    isUnderrepresentedSpeaker,
    requiresTravelSupport,
  } = indicators

  // Single source of truth for the available actions, rendered as an inline
  // button row on sm+ and as a compact dropdown menu on mobile (where the wide
  // colored buttons previously wrapped awkwardly across several rows).
  type ActionColor =
    'blue' | 'green' | 'orange' | 'red' | 'purple' | 'yellow' | undefined
  interface ActionItem {
    key: string
    label: string
    icon: typeof CheckIcon
    color?: ActionColor
    onClick: () => void
    title?: string
  }
  const actions: ActionItem[] = [
    {
      key: 'edit',
      label: 'Edit',
      icon: PencilIcon,
      onClick: handleEditProposal,
      title: 'Edit proposal (⌘E)',
    },
    ...(speakers.length > 0
      ? [
          {
            key: 'preview',
            label: 'Preview',
            icon: EyeIcon,
            color: 'purple' as const,
            onClick: handlePreviewSpeaker,
            title:
              speakers.length > 1
                ? `Preview first speaker profile of ${speakers.length} speakers (⌘P)`
                : 'Preview speaker profile (⌘P)',
          },
        ]
      : []),
    ...(speakers.length > 0 && speakers.some((speaker) => speaker.email)
      ? [
          {
            key: 'email',
            label: 'Email',
            icon: EnvelopeIcon,
            color: 'blue' as const,
            onClick: handleEmailSpeakers,
            title: 'Email speaker (⌘M)',
          },
        ]
      : []),
    ...(canApprove
      ? [
          {
            key: 'approve',
            label: 'Approve',
            icon: CheckIcon,
            color: 'green' as const,
            onClick: () => handleAction(Action.accept),
          },
        ]
      : []),
    ...(canConfirm
      ? [
          {
            key: 'confirm',
            label: 'Confirm',
            icon: CheckIcon,
            color: 'green' as const,
            onClick: () => handleAction(Action.confirm),
          },
        ]
      : []),
    ...(canWaitlist
      ? [
          {
            key: 'waitlist',
            label: 'Waitlist',
            icon: ClockIcon,
            color: 'orange' as const,
            onClick: () => handleAction(Action.waitlist),
          },
        ]
      : []),
    ...(canRemind
      ? [
          {
            key: 'remind',
            label: 'Remind',
            icon: BellIcon,
            color: 'yellow' as const,
            onClick: () => handleAction(Action.remind),
          },
        ]
      : []),
    ...(canReject
      ? [
          {
            key: 'reject',
            label: 'Reject',
            icon: XMarkIcon,
            color: 'red' as const,
            onClick: () => handleAction(Action.reject),
          },
        ]
      : []),
    ...(canWithdraw
      ? [
          {
            key: 'withdraw',
            label: 'Withdraw',
            icon: ArrowUturnLeftIcon,
            color: 'red' as const,
            onClick: () => handleAction(Action.withdraw),
          },
        ]
      : []),
  ]

  const menuAccent: Record<NonNullable<ActionColor>, string> = {
    blue: 'text-blue-500',
    green: 'text-green-500',
    orange: 'text-orange-500',
    red: 'text-red-500',
    purple: 'text-purple-500',
    yellow: 'text-yellow-500',
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Status:
            </span>
            <ProposalStatusBadge status={proposal.status} />
          </div>

          {proposal.reviews && proposal.reviews.length > 0 && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Reviews:
              </span>
              <span className="text-sm whitespace-nowrap text-gray-900 dark:text-white">
                {proposal.reviews.length} review
                {proposal.reviews.length !== 1 ? 's' : ''}
                {(() => {
                  const totalScore = proposal.reviews.reduce((sum, review) => {
                    const reviewScore =
                      (review.score.content +
                        review.score.relevance +
                        review.score.speaker) /
                      3
                    return sum + reviewScore
                  }, 0)
                  const averageScore = totalScore / proposal.reviews.length
                  return ` (${averageScore.toFixed(1)}/5)`
                })()}
              </span>
            </div>
          )}

          {speakers.length > 0 && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {speakers.length > 1 ? 'Speakers:' : 'Speaker:'}
              </span>
              {speakers.length > 1 && (
                <span className="text-xs whitespace-nowrap text-gray-500 dark:text-gray-400">
                  +{speakers.length - 1} co-speaker
                  {speakers.length > 2 ? 's' : ''}
                </span>
              )}
              <div className="flex items-center gap-1">
                {isSeasonedSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                    title="Seasoned speaker - has previous accepted talks"
                  >
                    <StarIcon className="h-3 w-3" />
                  </div>
                )}
                {isNewSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                    title="New speaker - no previous accepted talks"
                  >
                    <UserPlusIcon className="h-3 w-3" />
                  </div>
                )}
                {isLocalSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    title="Local speaker"
                  >
                    <MapPinIcon className="h-3 w-3" />
                  </div>
                )}
                {isUnderrepresentedSpeaker && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                    title="Underrepresented speaker"
                  >
                    <HeartIcon className="h-3 w-3" />
                  </div>
                )}
                {requiresTravelSupport && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                    title="Requires travel support"
                  >
                    <ExclamationTriangleIcon className="h-3 w-3" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop (sm+): inline button row. */}
        <div className="hidden flex-wrap items-center gap-1.5 sm:flex sm:shrink-0">
          {actions.map((action) => (
            <AdminButton
              key={action.key}
              color={action.color}
              size="xs"
              onClick={action.onClick}
              title={action.title}
            >
              <action.icon className="h-3 w-3" />
              {action.label}
            </AdminButton>
          ))}
        </div>

        {/* Mobile: a single "Actions" dropdown instead of wrapping buttons. */}
        {actions.length > 0 && (
          <Menu as="div" className="relative sm:hidden">
            <MenuButton className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800">
              Actions
              <ChevronDownIcon className="h-4 w-4" />
            </MenuButton>
            <MenuItems
              anchor="bottom end"
              className="z-50 mt-1 w-56 origin-top-right rounded-lg bg-white p-1 text-sm shadow-lg ring-1 ring-gray-900/5 focus:outline-none dark:bg-gray-800 dark:ring-white/10"
            >
              {actions.map((action) => (
                <MenuItem key={action.key}>
                  <button
                    type="button"
                    onClick={action.onClick}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left font-medium text-gray-700 transition-colors data-focus:bg-gray-100 dark:text-gray-200 dark:data-focus:bg-gray-700"
                  >
                    <action.icon
                      className={clsx(
                        'h-4 w-4 shrink-0',
                        action.color
                          ? menuAccent[action.color]
                          : 'text-gray-400 dark:text-gray-500',
                      )}
                    />
                    {action.label}
                  </button>
                </MenuItem>
              ))}
            </MenuItems>
          </Menu>
        )}
      </div>

      {showEmailModal && speakersWithEmail.length > 0 && (
        <SpeakerEmailModal
          isOpen={showEmailModal}
          onClose={() => {
            setShowEmailModal(false)
            setSpeakersWithEmail([])
          }}
          proposal={proposal}
          speakers={speakersWithEmail}
          domain={domain}
          fromEmail={fromEmail}
        />
      )}

      {showEditModal && (
        <ProposalManagementModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          editingProposal={proposal}
          conference={conference}
          onProposalUpdated={handleProposalUpdated}
        />
      )}

      {showPreviewModal && previewSpeaker && (
        <SpeakerProfilePreview
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false)
            setPreviewSpeaker(null)
          }}
          speaker={previewSpeaker}
          talks={[proposal]}
        />
      )}
    </div>
  )
}
