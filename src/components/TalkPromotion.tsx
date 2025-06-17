import {
  CalendarIcon,
  MapPinIcon,
  TicketIcon,
  ArrowRightIcon,
  ClockIcon,
  UserIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline'
import { Format } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal/formatConfig'
import { memo, useMemo } from 'react'
import Link from 'next/link'

/**
 * Props for the TalkPromotion component
 */
interface TalkPromotionProps {
  /** Title of the talk */
  title: string
  /** Speaker name */
  speaker: string
  /** Talk format (determines duration, style, etc.) */
  format: Format
  /** Event date */
  date?: string
  /** Event time */
  time?: string
  /** Event location */
  location?: string
  /** Call-to-action button text */
  ctaText?: string
  /** Call-to-action button URL */
  ctaUrl?: string
  /** Talk description */
  description?: string
  /** Target audience level */
  level?: 'beginner' | 'intermediate' | 'advanced'
  /** Talk topic/category */
  topic?: string
  /** Visual variant of the component */
  variant?: 'banner' | 'card' | 'social' | 'featured' | 'compact'
  /** Additional CSS classes */
  className?: string
}

const levelConfig = {
  beginner: { label: 'Beginner', color: 'text-secondary-500' },
  intermediate: { label: 'Intermediate', color: 'text-accent-yellow' },
  advanced: { label: 'Advanced', color: 'text-primary-500' },
} as const

const variantConfig = {
  banner: {
    containerClass:
      'relative overflow-hidden rounded-2xl border border-gray-200 p-8 md:p-12',
    titleClass:
      'font-space-grotesk mb-3 text-3xl font-bold text-brand-slate-gray md:text-4xl',
    speakerClass: 'font-inter mb-4 text-xl text-gray-700',
    showCTA: true,
    showEventDetails: true,
    compactMeta: false,
    showFeaturedBadge: false,
    isSquare: false,
  },
  featured: {
    containerClass:
      'group relative overflow-hidden rounded-xl border-2 border-brand-cloud-blue bg-white p-8 shadow-md transition-all duration-300 hover:shadow-lg',
    titleClass:
      'font-space-grotesk mb-4 text-2xl font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue',
    speakerClass: 'font-inter font-medium text-gray-700',
    showCTA: false,
    showEventDetails: true,
    showFeaturedBadge: true,
    compactMeta: false,
    isSquare: false,
  },
  compact: {
    containerClass:
      'group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all duration-300 hover:border-gray-300 hover:shadow-lg',
    titleClass:
      'font-space-grotesk mb-2 text-lg font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue',
    speakerClass: 'font-inter text-sm font-medium text-gray-700',
    showCTA: false,
    showEventDetails: false,
    compactMeta: true,
    showFeaturedBadge: false,
    isSquare: false,
  },
  social: {
    containerClass:
      'relative aspect-square overflow-hidden rounded-2xl border border-gray-200 max-w-sm p-6',
    titleClass:
      'font-space-grotesk mb-3 text-xl font-bold text-brand-slate-gray',
    speakerClass: 'font-inter mb-4 text-gray-700',
    showCTA: false,
    showEventDetails: true,
    isSquare: true,
    compactMeta: false,
    showFeaturedBadge: false,
  },
  card: {
    containerClass:
      'group relative overflow-hidden rounded-xl border border-gray-200 p-6 transition-all duration-300 hover:border-gray-300 hover:shadow-lg',
    titleClass:
      'font-space-grotesk mb-3 text-xl font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue',
    speakerClass: 'font-inter mb-4 text-gray-700',
    showCTA: true,
    showEventDetails: true,
    compactMeta: false,
    showFeaturedBadge: false,
    isSquare: false,
  },
} as const

/**
 * TalkPromotion component for displaying talk information in various formats
 *
 * @param props - TalkPromotionProps
 * @returns Memoized React component
 */
export const TalkPromotion = memo(function TalkPromotion({
  title,
  speaker,
  format,
  date,
  time,
  location,
  ctaText = 'Learn More',
  ctaUrl = '#',
  description,
  level,
  topic,
  variant = 'card',
  className = '',
}: TalkPromotionProps) {
  const config = formatConfig[format]
  const variantSettings = variantConfig[variant]
  const Icon = config.icon

  // Memoize computed values
  const computedValues = useMemo(
    () => ({
      hasEventDetails: Boolean(date || time || location),
      hasMeta: Boolean(level || topic),
      containerClassName: `${variantSettings.containerClass} ${variant === 'banner' ? `bg-gradient-to-r ${config.gradient}` : variant === 'social' ? `bg-gradient-to-br ${config.gradient}` : variant === 'card' ? `bg-gradient-to-br ${config.gradient}` : ''} ${className}`,
    }),
    [
      date,
      time,
      location,
      level,
      topic,
      variantSettings.containerClass,
      variant,
      config.gradient,
      className,
    ],
  )

  // Render format badge
  const renderFormatBadge = () => {
    if (variant === 'banner') {
      return (
        <div className="mb-4 flex items-center space-x-2">
          <Icon className={`h-6 w-6 ${config.accentColor}`} />
          <span
            className={`font-inter text-lg font-semibold ${config.accentColor}`}
          >
            {config.label}
          </span>
          <span className="font-inter text-sm text-gray-600">
            ({config.duration})
          </span>
        </div>
      )
    }

    if (variant === 'social') {
      return (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Icon className={`h-5 w-5 ${config.accentColor}`} />
            <span
              className={`font-inter text-sm font-semibold ${config.accentColor}`}
            >
              {config.label}
            </span>
          </div>
          <span className="font-inter text-xs text-gray-600">
            {config.duration}
          </span>
        </div>
      )
    }

    return (
      <div
        className={`flex items-center space-x-2 rounded-full px-3 py-1 ${config.bgColor} ${config.borderColor} border`}
      >
        <Icon className={`h-4 w-4 ${config.color}`} />
        <span className={`font-inter text-sm font-medium ${config.color}`}>
          {config.label}
        </span>
        {variant === 'card' && (
          <span className="font-inter text-xs text-gray-600">
            ({config.duration})
          </span>
        )}
      </div>
    )
  }

  // Render speaker information
  const renderSpeaker = () => {
    if (variant === 'banner' || variant === 'social' || variant === 'card') {
      return (
        <p className={variantSettings.speakerClass}>
          by <span className="font-semibold">{speaker}</span>
        </p>
      )
    }

    // Featured and compact variants use icon
    return (
      <div className="mb-3 flex items-center space-x-2">
        <UserIcon className="h-4 w-4 text-gray-400" />
        <span className={variantSettings.speakerClass}>{speaker}</span>
      </div>
    )
  }

  // Render meta information (duration, level, topic)
  const renderMetaInfo = () => {
    if (
      !computedValues.hasMeta &&
      variant !== 'compact' &&
      variant !== 'featured'
    )
      return null

    const items = []

    // Duration (for compact and featured variants)
    if (variant === 'compact' || variant === 'featured') {
      items.push(
        <div key="duration" className="flex items-center space-x-1">
          <ClockIcon className="h-4 w-4 text-gray-400" />
          <span className="font-inter text-sm text-gray-600">
            {config.duration}
          </span>
        </div>,
      )
    }

    // Level
    if (level) {
      items.push(
        <div key="level" className="flex items-center space-x-1">
          <AcademicCapIcon className="h-4 w-4 text-gray-400" />
          <span className={`font-inter text-sm ${levelConfig[level].color}`}>
            {levelConfig[level].label}
          </span>
        </div>,
      )
    }

    // Topic
    if (topic) {
      items.push(
        <div key="topic" className="rounded-full bg-gray-100 px-2 py-1">
          <span className="font-inter text-xs text-gray-600">{topic}</span>
        </div>,
      )
    }

    if (items.length === 0) return null

    return (
      <div
        className={`flex flex-wrap items-center gap-4 ${variantSettings.compactMeta ? 'mb-2' : 'mb-4'}`}
      >
        {items}
      </div>
    )
  }

  // Render event details
  const renderEventDetails = () => {
    if (!variantSettings.showEventDetails || !computedValues.hasEventDetails)
      return null

    const details = []
    const iconSize = variant === 'banner' ? '5' : '4'

    if (date) {
      details.push(
        <div key="date" className="flex items-center space-x-2">
          <CalendarIcon
            className={`h-${iconSize} w-${iconSize} text-gray-400`}
          />
          <span
            className={`font-inter ${variant === 'banner' ? '' : 'text-sm'} text-gray-700`}
          >
            {date}
          </span>
        </div>,
      )
    }

    if (time) {
      details.push(
        <div key="time" className="flex items-center space-x-2">
          <ClockIcon className={`h-${iconSize} w-${iconSize} text-gray-400`} />
          <span
            className={`font-inter ${variant === 'banner' ? '' : 'text-sm'} text-gray-700`}
          >
            {time}
          </span>
        </div>,
      )
    }

    if (location) {
      details.push(
        <div key="location" className="flex items-center space-x-2">
          <MapPinIcon className={`h-${iconSize} w-${iconSize} text-gray-400`} />
          <span
            className={`font-inter ${variant === 'banner' ? '' : 'text-sm'} text-gray-700`}
          >
            {location}
          </span>
        </div>,
      )
    }

    if (details.length === 0) return null

    const containerClass = {
      banner: 'flex flex-wrap items-center gap-6',
      social: 'mt-4 space-y-2',
      card: 'mb-6 space-y-2',
      featured: 'mb-4 flex flex-wrap items-center gap-4',
      compact: 'mb-4 flex flex-wrap items-center gap-4',
    }[variant]

    return <div className={containerClass}>{details}</div>
  }

  // Render description
  const renderDescription = () => {
    if (!description || variant === 'compact') return null

    const textSize =
      variant === 'featured' || variant === 'banner' ? 'text-base' : 'text-sm'
    const lineClamp = variant === 'social' ? 'line-clamp-3' : ''
    const marginClass =
      variant === 'banner'
        ? 'mb-6 lg:max-w-2xl'
        : variant === 'card'
          ? 'mb-6'
          : ''

    return (
      <p
        className={`font-inter text-gray-600 ${textSize} ${lineClamp} ${marginClass}`}
      >
        {description}
      </p>
    )
  }

  // Render CTA button
  const renderCTA = () => {
    if (!variantSettings.showCTA) return null

    if (variant === 'banner') {
      return (
        <div className="lg:ml-8">
          <Link
            href={ctaUrl}
            className="group font-inter inline-flex items-center space-x-2 rounded-xl bg-brand-cloud-blue px-8 py-4 font-semibold text-white transition-all hover:bg-brand-cloud-blue/90 hover:shadow-lg"
          >
            <TicketIcon className="h-5 w-5" />
            <span>{ctaText}</span>
            <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      )
    }

    return (
      <Link
        href={ctaUrl}
        className="group/cta font-inter inline-flex items-center space-x-2 text-sm font-semibold text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80"
      >
        <span>{ctaText}</span>
        <ArrowRightIcon className="h-4 w-4 transition-transform group-hover/cta:translate-x-1" />
      </Link>
    )
  }

  // Main render logic using unified approach
  return (
    <div className={computedValues.containerClassName}>
      {/* Content */}
      <div className="relative">
        {variant === 'banner' ? (
          // Banner layout
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div className="mb-6 lg:mb-0 lg:flex-1">
              {renderFormatBadge()}
              <h2 className={variantSettings.titleClass}>{title}</h2>
              {renderSpeaker()}
              {renderDescription()}
              {renderEventDetails()}
            </div>
            {renderCTA()}
          </div>
        ) : variant === 'social' ? (
          // Social layout (square with flex column)
          <div className="flex h-full flex-col">
            {renderFormatBadge()}
            <div className="flex-1">
              <h3 className={variantSettings.titleClass}>{title}</h3>
              {renderSpeaker()}
              {renderDescription()}
            </div>
            {renderEventDetails()}
          </div>
        ) : (
          // Standard layout for featured, compact, and card variants
          <>
            <div className="mb-4 flex items-start justify-between">
              {renderFormatBadge()}
              {variantSettings.showFeaturedBadge && (
                <div className="rounded-full bg-brand-cloud-blue/10 px-3 py-1">
                  <span className="font-inter text-sm font-medium text-brand-cloud-blue">
                    Featured
                  </span>
                </div>
              )}
            </div>

            <h3 className={variantSettings.titleClass}>{title}</h3>
            {renderSpeaker()}
            {renderMetaInfo()}
            {renderDescription()}
            {renderEventDetails()}
            {renderCTA()}
          </>
        )}
      </div>
    </div>
  )
})
