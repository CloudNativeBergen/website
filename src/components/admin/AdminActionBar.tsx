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
  ChatBubbleLeftRightIcon,
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
import { ProposalManagementModal } from './ProposalManagementModal'
import SpeakerProfilePreview from '@/components/SpeakerProfilePreview'
import { useRouter } from 'next/navigation'
import { AdminButton } from '@/components/admin/AdminButton'
import { proposalConversationId } from '@/lib/messaging/links'

import { Conference } from '@/lib/conference/types'

interface AdminActionBarProps {
  proposal: ProposalExisting
  conference: Conference
}

type ActionColor =
  'blue' | 'green' | 'orange' | 'red' | 'purple' | 'yellow' | undefined

/**
 * Where an action sits once the bar has room for an inline row (lg+).
 *
 * - `status` — a proposal STATE TRANSITION (approve, confirm, waitlist, reject,
 *   withdraw). These are the decisions an organizer is on this page to make, so
 *   they stay one click away.
 * - `more` — everything else (edit, preview, message, remind). Real but
 *   secondary; they live behind the overflow menu.
 */
type ActionGroup = 'status' | 'more'

interface ActionItem {
  key: string
  label: string
  icon: typeof CheckIcon
  color?: ActionColor
  onClick: () => void
  title?: string
  group: ActionGroup
}

/** Icon accent per action colour, for dropdown menu items. */
const MENU_ACCENT: Record<NonNullable<ActionColor>, string> = {
  blue: 'text-blue-500',
  green: 'text-green-500',
  orange: 'text-orange-500',
  red: 'text-red-500',
  purple: 'text-purple-500',
  yellow: 'text-yellow-500',
}

interface ActionsMenuProps {
  actions: ActionItem[]
  /** Trigger text — "Actions" for the full collapse, "More" for the overflow. */
  label: string
  className: string
  buttonClassName: string
  chevronClassName: string
}

/**
 * The dropdown half of the bar, shared by both collapse points so the two menus
 * cannot drift: the full "Actions" collapse below `lg`, and the "More" overflow
 * that holds the non-transition actions from `lg` up.
 */
function ActionsMenu({
  actions,
  label,
  className,
  buttonClassName,
  chevronClassName,
}: ActionsMenuProps) {
  return (
    <Menu as="div" className={className}>
      <MenuButton className={buttonClassName}>
        {label}
        <ChevronDownIcon className={chevronClassName} />
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
              title={action.title}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left font-medium text-gray-700 transition-colors data-focus:bg-gray-100 dark:text-gray-200 dark:data-focus:bg-gray-700"
            >
              <action.icon
                className={clsx(
                  'h-4 w-4 shrink-0',
                  action.color
                    ? MENU_ACCENT[action.color]
                    : 'text-gray-400 dark:text-gray-500',
                )}
              />
              {action.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  )
}

export function AdminActionBar({ proposal, conference }: AdminActionBarProps) {
  const router = useRouter()
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewSpeaker, setPreviewSpeaker] = useState<Speaker | null>(null)

  const speakers = extractSpeakersFromProposal(proposal)
  const indicators = getSpeakerIndicators(speakers)

  const handleAction = (action: Action) => {
    const event = new CustomEvent('proposalAction', {
      detail: { action, proposal },
    })
    window.dispatchEvent(event)
  }

  // Navigates to the messages workspace with this proposal's thread selected.
  //
  // It used to add `?messageId=` to the CURRENT route, which popped the
  // layout-wide MessageSlideOver over the proposal. On THIS page that overlay
  // re-rendered the very proposal behind it in a 320px rail, and its close
  // button fought a `#messages` effect that kept reopening it. The workspace at
  // `/admin/messages/<conversationId>` is the canonical reading surface and
  // already shows proposal context beside the thread, so the proposal page
  // hands off to it instead of stacking a second reader on top of itself.
  const handleMessageSpeakers = useCallback(() => {
    router.push(`/admin/messages/${proposalConversationId(proposal._id)}`)
  }, [proposal._id, router])

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
  const anyModalOpen = showEditModal || showPreviewModal
  useEffect(() => {
    // Suppress the bar's global shortcuts while any of its modals is open, so
    // ⌘E/⌘P/⌘M can't stack a second focus-trapped modal on top of the first.
    if (anyModalOpen) return

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
          handleMessageSpeakers()
          break
        case 's':
          // Note: CMD+S will trigger save in edit modal if it's open
          // This is handled by the ProposalManagementModal component
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [speakers, handleMessageSpeakers, handlePreviewSpeaker, anyModalOpen])
  const {
    isSeasonedSpeaker,
    isNewSpeaker,
    isLocalSpeaker,
    isUnderrepresentedSpeaker,
    requiresTravelSupport,
  } = indicators

  // Single source of truth for the available actions. Declaration order is the
  // render order within each group.
  const actions: ActionItem[] = [
    {
      key: 'edit',
      label: 'Edit',
      icon: PencilIcon,
      onClick: handleEditProposal,
      title: 'Edit proposal (⌘E)',
      group: 'more',
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
            group: 'more' as const,
          },
        ]
      : []),
    {
      key: 'message',
      label: 'Message',
      icon: ChatBubbleLeftRightIcon,
      color: 'blue' as const,
      onClick: handleMessageSpeakers,
      title: 'Message speaker(s) in the messages workspace (⌘M)',
      group: 'more',
    },
    ...(canRemind
      ? [
          {
            key: 'remind',
            label: 'Remind',
            icon: BellIcon,
            color: 'yellow' as const,
            onClick: () => handleAction(Action.remind),
            group: 'more' as const,
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
            group: 'status' as const,
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
            group: 'status' as const,
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
            group: 'status' as const,
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
            group: 'status' as const,
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
            group: 'status' as const,
          },
        ]
      : []),
  ]

  const statusActions = actions.filter((action) => action.group === 'status')
  const moreActions = actions.filter((action) => action.group === 'more')

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      {/* `sm:flex-wrap xl:flex-nowrap` is load-bearing, not tidiness.
          `lg:` is a VIEWPORT query, but this bar lives in a column that loses
          384px to the proposal page's `lg:w-96` rail at that same breakpoint
          (plus 80px of admin sidebar). At a 1024px viewport the bar is only
          ~528px wide and the inline action row does not fit — and because the
          status/reviews block carries `min-w-0` it shrank BELOW its own content
          rather than pushing back, so "1 review (4.3/5)" was cut off behind the
          Confirm button. Wrapping drops the actions onto their own line in that
          band instead. From `xl` the column is always ≥784px, which fits on one
          line, so `flex-nowrap` there keeps the familiar single-row bar. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 xl:flex-nowrap">
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

        {/* lg+: the state transitions inline, everything else behind "More".
            The bar carries up to eight actions; an inline row of all of them
            wrapped into ragged rows against the status/reviews/speaker column
            at every width below a wide desktop. */}
        <div className="hidden items-center gap-1.5 lg:ml-auto lg:flex lg:shrink-0">
          {statusActions.map((action) => (
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
          {moreActions.length > 0 && (
            <ActionsMenu
              actions={moreActions}
              label="More"
              // `flex`, not the default block: a block wrapper around an
              // inline-flex button inherits line-height descender space, which
              // made the trigger sit 1px lower than the buttons beside it.
              className="relative flex shrink-0"
              buttonClassName="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 ring-inset transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-white/10 dark:text-gray-100 dark:ring-white/15 dark:hover:bg-white/20"
              chevronClassName="h-3 w-3"
            />
          )}
        </div>

        {/* Below lg: one "Actions" dropdown instead of wrapping buttons. */}
        {actions.length > 0 && (
          <ActionsMenu
            actions={actions}
            label="Actions"
            className="relative shrink-0 sm:ml-auto lg:hidden"
            buttonClassName="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:w-auto dark:focus-visible:ring-offset-gray-800"
            chevronClassName="h-4 w-4"
          />
        )}
      </div>

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
