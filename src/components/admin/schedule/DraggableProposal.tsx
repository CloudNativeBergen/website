'use client'

import { useDraggable } from '@dnd-kit/core'
import { useMemo } from 'react'
import { ProposalExisting, Status } from '@/lib/proposal/types'
import { formats, audiences } from '@/lib/proposal/types'
import { getProposalDurationMinutes } from '@/lib/schedule/types'
import { Topic } from '@/lib/topic/types'
import { LevelIndicator, getLevelConfig } from '@/lib/proposal'
import {
  ClockIcon,
  UserIcon,
  Bars3Icon,
  CodeBracketIcon,
  CubeIcon,
  CogIcon,
  UserGroupIcon,
  AcademicCapIcon,
  TagIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import './schedule.css'

interface DraggableProposalProps {
  proposal: ProposalExisting
  sourceTrackIndex?: number
  sourceTimeSlot?: string
  isDragging?: boolean
}

const TALK_THRESHOLDS = {
  VERY_SHORT: 10,
  SHORT: 20,
  MEDIUM: 45,
} as const

const MINUTES_TO_PIXELS = 2.4

const AUDIENCE_CONFIG = {
  developer: { abbr: 'DEV', icon: CodeBracketIcon },
  architect: { abbr: 'ARC', icon: CubeIcon },
  operator: { abbr: 'OPS', icon: CogIcon },
  manager: { abbr: 'MGR', icon: UserGroupIcon },
  dataEngineer: { abbr: 'DATA', icon: AcademicCapIcon },
  securityEngineer: { abbr: 'SEC', icon: CodeBracketIcon },
  qaEngineer: { abbr: 'QA', icon: CodeBracketIcon },
  devopsEngineer: { abbr: 'DEVOPS', icon: CogIcon },
} as const

const formatTopicColor = (color: string): string =>
  color.startsWith('#') ? color : `#${color}`

export function DraggableProposal({
  proposal,
  sourceTrackIndex,
  sourceTimeSlot,
  isDragging = false,
}: DraggableProposalProps) {
  const levelConfig = getLevelConfig(proposal.level)

  const { dragType, durationMinutes, talkSize, dragId, speakerInfo } =
    useMemo(() => {
      const duration = getProposalDurationMinutes(proposal)
      const type =
        sourceTrackIndex !== undefined ? 'scheduled-talk' : 'proposal'
      const id = `${type}-${proposal._id}-${sourceTimeSlot || 'unassigned'}`

      let size: 'very-short' | 'short' | 'medium' | 'long'
      if (duration <= TALK_THRESHOLDS.VERY_SHORT) size = 'very-short'
      else if (duration <= TALK_THRESHOLDS.SHORT) size = 'short'
      else if (duration <= TALK_THRESHOLDS.MEDIUM) size = 'medium'
      else size = 'long'

      const speaker =
        proposal.speakers &&
          Array.isArray(proposal.speakers) &&
          proposal.speakers.length > 0 &&
          proposal.speakers[0] &&
          typeof proposal.speakers[0] === 'object' &&
          'name' in proposal.speakers[0]
          ? proposal.speakers[0].name
          : null

      return {
        dragType: type,
        durationMinutes: duration,
        talkSize: size,
        dragId: id,
        speakerInfo: speaker,
      }
    }, [proposal, sourceTrackIndex, sourceTimeSlot])

  const topicStyling = useMemo(() => {
    const topics = proposal.topics as Topic[]
    if (!topics || topics.length === 0) return { styles: {}, className: '' }

    const color1 = formatTopicColor(topics[0].color)
    const color2 = topics.length >= 2 ? formatTopicColor(topics[1].color) : ''

    const styles: React.CSSProperties & Record<string, string> = {
      '--topic-1-color': color1,
      '--topic-2-color': color2,
      position: 'relative' as const,
    }

    const className =
      topics.length === 1 ? 'topic-border-single' : 'topic-border-gradient'

    return { styles, className }
  }, [proposal.topics])

  const backgroundStyle = useMemo(() => {
    const topics = proposal.topics as Topic[]
    const isAcceptedButNotConfirmed = proposal.status === Status.accepted
    const isWithdrawnOrRejected =
      proposal.status === Status.withdrawn ||
      proposal.status === Status.rejected

    if (isWithdrawnOrRejected) {
      return {}
    }

    if (isAcceptedButNotConfirmed) {
      return {}
    }

    if (topics && topics.length > 0) {
      const background =
        topics.length === 1
          ? `${topics[0].color}08`
          : `linear-gradient(135deg, ${topics[0].color}08 50%, ${topics[1].color}08 50%)`

      return { background }
    }

    return {}
  }, [proposal.topics, proposal.status])

  const { primaryAudience, audienceCount } = useMemo(() => {
    if (!proposal.audiences || proposal.audiences.length === 0) {
      return { primaryAudience: null, audienceCount: 0 }
    }
    return {
      primaryAudience: AUDIENCE_CONFIG[proposal.audiences[0]],
      audienceCount: proposal.audiences.length,
    }
  }, [proposal.audiences])

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: isBeingDragged,
  } = useDraggable({
    id: dragId,
    data: {
      type: dragType,
      proposal,
      sourceTrackIndex,
      sourceTimeSlot,
    },
  })

  const transformStyle = useMemo(() => {
    if (!transform || isBeingDragged) return undefined
    return {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    }
  }, [transform, isBeingDragged])

  const containerClasses = useMemo(() => {
    const isAcceptedButNotConfirmed = proposal.status === Status.accepted
    const isWithdrawnOrRejected =
      proposal.status === Status.withdrawn ||
      proposal.status === Status.rejected

    const baseClasses = isWithdrawnOrRejected
      ? 'relative max-w-full overflow-hidden rounded-lg border-2 border-red-500 bg-red-100 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-red-600 dark:bg-red-900'
      : isAcceptedButNotConfirmed
        ? 'relative max-w-full overflow-hidden rounded-lg border-2 border-amber-500 bg-amber-100 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-amber-400 dark:bg-stone-800'
        : 'relative max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800'

    const opacityClass = isBeingDragged
      ? 'opacity-30'
      : isDragging
        ? 'opacity-50'
        : ''

    const paddingClass =
      talkSize === 'short' || talkSize === 'very-short' ? 'p-1' : 'p-2'

    return `${baseClasses} ${opacityClass} ${topicStyling.className} ${paddingClass}`.trim()
  }, [
    isBeingDragged,
    isDragging,
    talkSize,
    topicStyling.className,
    proposal.status,
  ])
  const TitleComponent = useMemo(() => {
    const titleClasses = 'pr-1 text-gray-900 truncate dark:text-gray-100'
    const isWithdrawnOrRejected =
      proposal.status === Status.withdrawn ||
      proposal.status === Status.rejected
    const isAcceptedButNotConfirmed = proposal.status === Status.accepted

    const titleContent = isWithdrawnOrRejected ? (
      <span className="flex items-center gap-1">
        <ExclamationTriangleIcon className="h-3 w-3 shrink-0 text-red-500 dark:text-red-400" />
        <span className="truncate">{proposal.title}</span>
      </span>
    ) : isAcceptedButNotConfirmed ? (
      <span className="flex items-center gap-1">
        <ExclamationTriangleIcon className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-300" />
        <span className="truncate">{proposal.title}</span>
      </span>
    ) : (
      proposal.title
    )

    switch (talkSize) {
      case 'very-short':
        return (
          <h3
            className={`line-clamp-1 text-xs leading-tight font-medium ${titleClasses}`}
          >
            {titleContent}
          </h3>
        )
      case 'short':
        return (
          <h3
            className={`line-clamp-2 text-xs leading-tight font-medium ${titleClasses}`}
          >
            {titleContent}
          </h3>
        )
      default:
        return (
          <h3 className={`line-clamp-2 text-sm font-semibold ${titleClasses}`}>
            {titleContent}
          </h3>
        )
    }
  }, [talkSize, proposal.title, proposal.status])

  const SpeakerComponent = useMemo(() => {
    if (!speakerInfo) return null

    return (
      <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
        <UserIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{speakerInfo}</span>
      </div>
    )
  }, [speakerInfo])

  const AudienceIndicator = useMemo(() => {
    if (!primaryAudience) return null

    const countText = audienceCount > 1 ? ` +${audienceCount - 1}` : ''

    return (
      <div className="flex items-center gap-1">
        <UserGroupIcon className="h-3 w-3 shrink-0 text-gray-500 dark:text-gray-400" />
        <span
          className="text-xs font-medium text-gray-600 dark:text-gray-400"
          title={`Primary: ${audiences.get(proposal.audiences?.[0])}${audienceCount > 1 ? ` (${audienceCount} total)` : ''
            }`}
        >
          {primaryAudience.abbr}
          {countText}
        </span>
      </div>
    )
  }, [primaryAudience, audienceCount, proposal.audiences])

  const TopicsIndicator = useMemo(() => {
    if (!proposal.topics?.length) return null

    const topics = proposal.topics as Topic[]
    const displayTopics = topics.slice(0, 2)
    const remainingCount = topics.length - 2

    const formatColor = (color: string) =>
      color.startsWith('#') ? color : `#${color}`

    return (
      <div className="flex items-center gap-1">
        <TagIcon className="h-3 w-3 shrink-0 text-gray-500 dark:text-gray-400" />
        <div className="flex items-center gap-1">
          {displayTopics.map((topic, index) => (
            <span
              key={topic._id || index}
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: formatColor(topic.color) }}
              title={topic.title}
            />
          ))}
          {remainingCount > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              +{remainingCount}
            </span>
          )}
        </div>
      </div>
    )
  }, [proposal.topics])

  const formatDisplay = useMemo(() => {
    return formats.get(proposal.format) || proposal.format
  }, [proposal.format])

  const tooltipContent = useMemo(() => {
    const parts = []

    parts.push(`📋 ${proposal.title}`)
    if (speakerInfo) parts.push(`👤 ${speakerInfo}`)

    const statusEmoji =
      proposal.status === Status.withdrawn ||
        proposal.status === Status.rejected
        ? '🚫'
        : proposal.status === Status.accepted
          ? '⚠️'
          : '✅'
    const statusText =
      proposal.status === Status.withdrawn
        ? 'Withdrawn by speaker'
        : proposal.status === Status.rejected
          ? 'Rejected by organizers'
          : proposal.status === Status.accepted
            ? 'Accepted (not yet confirmed by speaker)'
            : 'Confirmed'
    parts.push(`${statusEmoji} Status: ${statusText}`)

    const levelEmoji =
      levelConfig?.label === 'Beginner'
        ? '🟢'
        : levelConfig?.label === 'Intermediate'
          ? '🟡'
          : '🔴'
    if (levelConfig) {
      parts.push(`${levelEmoji} Level: ${levelConfig.label}`)
    }

    if (proposal.audiences && proposal.audiences.length > 0) {
      const audienceNames = proposal.audiences
        .map((a) => audiences.get(a))
        .filter(Boolean)
      parts.push(`👥 Audience: ${audienceNames.join(', ')}`)
    }

    parts.push(`⏱️ ${formatDisplay} (${durationMinutes} min)`)

    if (proposal.topics && proposal.topics.length > 0) {
      const topics = proposal.topics as Topic[]
      const topicList = topics.map((t) => `${t.title} (${t.color})`).join(', ')
      parts.push(`🏷️ Topics: ${topicList}`)
    }

    return parts.join('\n')
  }, [proposal, levelConfig, formatDisplay, durationMinutes, speakerInfo])

  return (
    <>
      <div
        ref={setNodeRef}
        className={containerClasses}
        style={{
          ...transformStyle,
          ...topicStyling.styles,
          ...backgroundStyle,
          height: `${durationMinutes * MINUTES_TO_PIXELS}px`,
        }}
        title={tooltipContent}
        {...attributes}
      >
        <div className="flex min-h-4 items-center gap-1">
          <div
            className="shrink-0 cursor-grab rounded p-0.5 transition-colors hover:cursor-grabbing hover:bg-gray-100 dark:hover:bg-gray-700"
            {...listeners}
          >
            <Bars3Icon className="h-3 w-3 text-gray-400 dark:text-gray-500" />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1">
            <div className="min-w-0 flex-1">{TitleComponent}</div>
            {levelConfig && (
              <LevelIndicator
                level={proposal.level}
                className="shrink-0"
                size="xs"
              />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <ClockIcon
              className={
                talkSize === 'short' || talkSize === 'very-short'
                  ? 'h-2.5 w-2.5'
                  : 'h-3 w-3'
              }
            />
            <span className="tabular-nums">{durationMinutes}m</span>
          </div>
        </div>

        {(talkSize === 'short' || talkSize === 'very-short') && (
          <div className="mt-0.5 flex items-center gap-2 text-xs">
            {AudienceIndicator}
            {TopicsIndicator}
          </div>
        )}

        {(talkSize === 'medium' || talkSize === 'long') && (
          <div className="mt-1 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              {AudienceIndicator}
              {TopicsIndicator}
            </div>

            {SpeakerComponent}

            {talkSize === 'long' && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {formatDisplay}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
