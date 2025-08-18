import {
  CalendarIcon,
  MapPinIcon,
  ClockIcon,
  ArrowRightIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline'
import { ProposalExisting } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal'
import { memo, useMemo } from 'react'
import Link from 'next/link'
import { Speaker } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { ClickableSpeakerNames } from '@/components/ClickableSpeakerNames'
import { BookmarkButton } from '@/components/BookmarkButton'

/**
 * Props for the TalkPromotionCard component
 */
interface TalkPromotionCardProps {
  /** Full talk object (required) */
  talk: ProposalExisting
  /** Optional schedule slot meta */
  slot?: { date?: string; time?: string; location?: string }
  /** Call-to-action button text */
  ctaText?: string
  /** Call-to-action button URL */
  ctaUrl?: string
  /** Visual variant of the component */
  variant?: 'default' | 'featured' | 'compact'
  /** Additional CSS classes */
  className?: string
}

const levelConfig = {
  beginner: { label: 'Beginner', color: 'text-secondary-500' },
  intermediate: { label: 'Intermediate', color: 'text-accent-yellow' },
  advanced: { label: 'Advanced', color: 'text-primary-500' },
} as const

const variantConfig = {
  default: {
    containerClass:
      'group relative flex flex-col h-full overflow-hidden rounded-xl border border-gray-200 bg-white p-6 transition-all duration-300 hover:border-gray-300 hover:shadow-lg',
    titleClass:
      'font-space-grotesk text-xl font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue',
    showFeaturedBadge: false,
  },
  featured: {
    containerClass:
      'group relative flex flex-col h-full overflow-hidden rounded-xl border-2 border-brand-cloud-blue bg-white p-6 shadow-md transition-all duration-300 hover:shadow-lg',
    titleClass:
      'font-space-grotesk text-xl font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue',
    showFeaturedBadge: true,
  },
  compact: {
    containerClass:
      'group relative flex flex-col h-full overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all duration-300 hover:border-gray-300 hover:shadow-lg',
    titleClass:
      'font-space-grotesk text-lg font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue',
    showFeaturedBadge: false,
  },
} as const

/**
 * TalkPromotionCard component with clear header-body-footer structure
 * Footer is always positioned at the bottom using flexbox layout
 *
 * @param props - TalkPromotionCardProps
 * @returns Memoized React component
 */
export const TalkPromotionCard = memo(function TalkPromotionCard({
  talk,
  slot,
  ctaText = 'Learn More',
  ctaUrl = '#',
  variant = 'default',
  className = '',
}: TalkPromotionCardProps) {
  const config = formatConfig[talk.format]
  const variantSettings = variantConfig[variant]
  const Icon = config.icon

  // Derive speakers (filter out references)
  const speakers = Array.isArray(talk.speakers)
    ? talk.speakers.filter((s): s is Speaker =>
        Boolean(s && typeof s === 'object' && 'name' in s && s.name),
      )
    : []

  // Derive level & topic (first concrete topic object with title)
  const level = talk.level as 'beginner' | 'intermediate' | 'advanced'
  const topic = Array.isArray(talk.topics)
    ? talk.topics.find((t): t is Topic => {
        return (
          t &&
          typeof t === 'object' &&
          'title' in t &&
          typeof t.title === 'string'
        )
      })?.title
    : undefined

  // Extract simple plaintext from portable text description (first block)
  const description = useMemo(() => {
    if (!Array.isArray(talk.description)) return undefined
    const blocks = talk.description
    if (blocks.length === 0) return undefined
    const first = blocks.find(
      (b) => b && typeof b === 'object' && '_type' in b && b._type === 'block',
    )
    if (!first || !('children' in first) || !Array.isArray(first.children))
      return undefined
    const text = first.children
      .map((c) => (c && typeof c === 'object' && 'text' in c ? c.text : ''))
      .filter(Boolean)
      .join(' ')
    return text || undefined
  }, [talk.description])

  const { date, time, location } = slot || {}

  /**
   * Header Component - Format badge and featured badge
   */
  const TalkHeader = () => (
    <header className="mb-4 flex items-start justify-between">
      {/* Format Badge */}
      <div
        className={`flex items-center space-x-2 rounded-full px-3 py-1 ${config.bgColor} ${config.borderColor} border`}
      >
        <Icon className={`h-4 w-4 ${config.color}`} />
        <span className={`font-inter text-sm font-medium ${config.color}`}>
          {config.label}
        </span>
        {variant !== 'compact' && (
          <span className="font-inter text-xs text-gray-600">
            ({config.duration})
          </span>
        )}
      </div>

      {/* Featured Badge */}
      {variantSettings.showFeaturedBadge && (
        <div className="rounded-full bg-brand-cloud-blue/10 px-3 py-1">
          <span className="font-inter text-sm font-medium text-brand-cloud-blue">
            Featured
          </span>
        </div>
      )}
    </header>
  )

  /**
   * Body Component - Title, speakers, meta info, and description
   */
  const TalkBody = () => (
    <div className="flex-1">
      {/* Title */}
      <h3 className={`mb-3 ${variantSettings.titleClass}`}>{talk.title}</h3>

      {/* Speakers */}
      {speakers && speakers.length > 0 && (
        <div className={`mb-4 ${variant === 'compact' ? 'mb-3' : ''}`}>
          <div className="flex items-center space-x-3">
            <SpeakerAvatars
              speakers={speakers as Speaker[]}
              size={variant === 'compact' ? 'sm' : 'md'}
              maxVisible={3}
            />
            <div className="min-w-0">
              <div className="font-inter text-sm font-semibold text-brand-slate-gray">
                <ClickableSpeakerNames
                  speakers={speakers as Speaker[]}
                  linkClassName="hover:text-brand-slate-gray/80 transition-colors"
                />
              </div>
              <p className="font-inter text-xs text-gray-500">
                {speakers.length > 1 ? 'Speakers' : 'Speaker'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Meta Info - Level and Topic */}
      {(level || topic) && (
        <div className="mb-4 flex flex-wrap items-center gap-4">
          {/* Duration (for compact variant) */}
          {variant === 'compact' && (
            <div className="flex items-center space-x-1">
              <ClockIcon className="h-4 w-4 text-gray-400" />
              <span className="font-inter text-sm text-gray-600">
                {config.duration}
              </span>
            </div>
          )}

          {/* Level */}
          {level && (
            <div className="flex items-center space-x-1">
              <AcademicCapIcon className="h-4 w-4 text-gray-400" />
              <span
                className={`font-inter text-sm ${levelConfig[level].color}`}
              >
                {levelConfig[level].label}
              </span>
            </div>
          )}

          {/* Topic */}
          {topic && (
            <div className="rounded-full bg-gray-100 px-2 py-1">
              <span className="font-inter text-xs text-gray-600">{topic}</span>
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {description && variant !== 'compact' && (
        <p
          className={`font-inter text-gray-600 ${
            variant === 'featured' ? 'text-base' : 'text-sm'
          } ${variant === 'featured' ? 'line-clamp-3' : 'line-clamp-3'} mb-4`}
        >
          {description}
        </p>
      )}
    </div>
  )

  /**
   * Footer Component - Event details and CTA
   * Always positioned at the bottom using mt-auto
   */
  const TalkFooter = () => (
    <footer className="mt-auto border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between">
        {/* Event Details */}
        <div className="flex items-center space-x-2">
          {time ? (
            <>
              <ClockIcon
                className={`h-4 w-4 ${
                  variant === 'featured'
                    ? 'text-brand-cloud-blue'
                    : 'text-gray-400'
                }`}
              />
              <span
                className={`font-inter text-sm ${
                  variant === 'featured'
                    ? 'font-semibold text-brand-cloud-blue'
                    : 'text-gray-600'
                }`}
              >
                {time}
              </span>
            </>
          ) : date ? (
            <>
              <CalendarIcon className="h-4 w-4 text-gray-400" />
              <span className="font-inter text-sm text-gray-600">{date}</span>
            </>
          ) : location ? (
            <>
              <MapPinIcon className="h-4 w-4 text-gray-400" />
              <span className="font-inter text-sm text-gray-600">
                {location}
              </span>
            </>
          ) : (
            <div className="flex items-center space-x-1">
              <ClockIcon className="h-4 w-4 text-gray-400" />
              <span className="font-inter text-sm text-gray-600">
                {config.duration}
              </span>
            </div>
          )}
        </div>

        {/* CTA Link */}
        <Link
          href={ctaUrl}
          className="group/cta font-inter inline-flex items-center space-x-1 text-sm font-semibold text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80"
        >
          <span>{ctaText}</span>
          <ArrowRightIcon className="h-3 w-3 transition-transform group-hover/cta:translate-x-1" />
        </Link>
      </div>
    </footer>
  )

  // Main component structure
  return (
    <div className={`${variantSettings.containerClass} ${className}`}>
      <TalkHeader />
      <TalkBody />
      <TalkFooter />
    </div>
  )
})
