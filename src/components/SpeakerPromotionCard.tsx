import { CloudNativePattern } from '@/components/CloudNativePattern'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import {
  ArrowRightIcon,
  BuildingOfficeIcon,
  SpeakerWaveIcon,
  TrophyIcon,
  MapPinIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { UserIcon, MicrophoneIcon, StarIcon } from '@heroicons/react/24/solid'
import { sanityImage } from '@/lib/sanity/client'
import { Format } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal'
import { SpeakerWithTalks } from '@/lib/speaker/types'
import { Flags } from '@/lib/speaker/types'
import Link from 'next/link'
import { memo, useMemo } from 'react'

/**
 * Props for the SpeakerPromotionCard component
 */
interface SpeakerPromotionCardProps {
  /** Speaker data including talks and personal information */
  speaker: SpeakerWithTalks
  /** Visual variant of the component */
  variant?: 'default' | 'featured' | 'compact'
  /** Additional CSS classes */
  className?: string
  /** Whether to show as a featured speaker */
  isFeatured?: boolean
  /** Custom call-to-action text */
  ctaText?: string
  /** Custom call-to-action URL */
  ctaUrl?: string
}

/**
 * Computed speaker data interface
 */
interface ComputedSpeakerData {
  talks: SpeakerWithTalks['talks']
  expertise: string[]
  company: string | undefined
  talkCount: number
}

const variantConfig = {
  default: {
    containerClass:
      'group relative flex flex-col h-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 transition-all duration-300 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg dark:hover:shadow-xl',
    titleClass:
      'font-space-grotesk text-xl font-bold text-brand-slate-gray dark:text-white transition-colors group-hover:text-brand-cloud-blue dark:group-hover:text-brand-cloud-blue',
    showFeaturedBadge: false,
    showCloudNativePattern: false,
  },
  featured: {
    containerClass:
      'group relative flex flex-col h-full overflow-hidden rounded-xl border-2 border-brand-cloud-blue dark:border-brand-cloud-blue bg-gradient-to-br from-brand-cloud-blue/20 via-brand-cloud-blue/10 to-brand-fresh-green/10 dark:from-brand-cloud-blue/30 dark:via-brand-cloud-blue/20 dark:to-brand-fresh-green/20 p-8 shadow-md transition-all duration-300 hover:shadow-lg dark:hover:shadow-xl',
    titleClass:
      'font-space-grotesk text-2xl font-bold text-brand-slate-gray dark:text-white transition-colors group-hover:text-brand-cloud-blue dark:group-hover:text-brand-cloud-blue',
    showFeaturedBadge: true,
    showCloudNativePattern: true,
  },
  compact: {
    containerClass:
      'group relative flex flex-col h-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 transition-all duration-300 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg dark:hover:shadow-xl',
    titleClass:
      'font-space-grotesk text-lg font-bold text-brand-slate-gray dark:text-white transition-colors group-hover:text-brand-cloud-blue dark:group-hover:text-brand-cloud-blue',
    showFeaturedBadge: false,
    showCloudNativePattern: false,
  },
} as const

/**
 * Memoized helper function to derive expertise areas from speaker talks
 */
const deriveExpertise = (talks: SpeakerWithTalks['talks']): string[] => {
  if (!talks?.length) return []

  const expertise = new Set<string>()
  talks.forEach((talk) => {
    if (talk.format) {
      const formatLabel = formatConfig[talk.format as Format]?.label
      if (formatLabel) {
        expertise.add(formatLabel)
      }
    }
  })
  return Array.from(expertise)
}

/**
 * Memoized helper function to derive company name from speaker title
 */
const deriveCompany = (title: string | undefined): string | undefined => {
  if (!title) return undefined

  let company: string | undefined

  // Check for " at " pattern first (more specific)
  if (title.includes(' at ')) {
    company = title.split(' at ')[1].trim()
  }
  // Check for "@" pattern
  else if (title.includes('@')) {
    company = title.split('@')[1].trim()
  }

  if (!company) return undefined

  // Clean up company name by removing everything after common separators
  const separators = ['|', ',', '•', '·', '-', '–', '—', '/', '\\']
  for (const separator of separators) {
    if (company.includes(separator)) {
      company = company.split(separator)[0].trim()
      break
    }
  }

  return company
}

/**
 * Compute all derived speaker data in one function for better performance
 */
function computeSpeakerData(speaker: SpeakerWithTalks): ComputedSpeakerData {
  const talks = speaker.talks || []
  const expertise = deriveExpertise(talks)
  const company = deriveCompany(speaker.title)
  const talkCount = talks.length

  return {
    talks,
    expertise,
    company,
    talkCount,
  }
}

interface SpeakerImageProps {
  image?: SpeakerWithTalks['image']
  name: string
  size: number
  className?: string
}

const SpeakerImage = ({
  image,
  name,
  size,
  className = '',
}: SpeakerImageProps) => {
  if (image) {
    return (
      <img
        src={sanityImage(image)
          .width(size * 2) // 2x for high-DPI
          .height(size * 2)
          .fit('crop')
          .url()}
        alt={name}
        width={size}
        height={size}
        className={`object-cover ${className}`}
      />
    )
  }

  return <MissingAvatar name={name} size={size} className={className} />
}

/**
 * SpeakerPromotionCard component with clear header-body-footer structure
 * Footer is always positioned at the bottom using flexbox layout
 *
 * @param props - SpeakerPromotionCardProps
 * @returns Memoized React component
 */
export const SpeakerPromotionCard = memo(function SpeakerPromotionCard({
  speaker,
  variant = 'default',
  className = '',
  isFeatured = false,
  ctaText,
  ctaUrl,
}: SpeakerPromotionCardProps) {
  const variantSettings = variantConfig[variant]

  // Derive computed values
  const { expertise, company, talkCount } = useMemo(
    () => computeSpeakerData(speaker),
    [speaker],
  )

  // CTA values
  const finalCtaText = ctaText || (isFeatured ? 'View Speaker' : 'View Profile')
  const finalCtaUrl = ctaUrl || `/speaker/${speaker.slug || speaker._id}`

  // Extract speaker properties for cleaner code
  const { name, title, bio, image } = speaker

  /**
   * Header Component - Speaker badge and featured badge
   */
  const SpeakerHeader = () => (
    <header
      className={`relative flex items-start justify-between ${variant === 'featured' ? 'mb-6' : 'mb-4'}`}
    >
      {/* Cloud Native Pattern Background for Featured */}
      {variantSettings.showCloudNativePattern && (
        <div className="absolute inset-0 -m-8 opacity-12">
          <CloudNativePattern
            opacity={0.4}
            iconCount={30}
            baseSize={40}
            variant="light"
            className="h-full w-full"
          />
        </div>
      )}

      {/* Left side badges */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex h-8 items-center space-x-2 rounded-full border border-brand-cloud-blue/30 bg-brand-cloud-blue/15 px-4 backdrop-blur-sm">
          <UserIcon className="h-4 w-4 text-brand-cloud-blue" />
          <span className="font-inter text-sm font-medium text-brand-cloud-blue">
            Speaker
          </span>
        </div>

        {/* Featured Badge - More Prominent */}
        {variantSettings.showFeaturedBadge && (
          <div className="relative flex h-8 items-center space-x-2 rounded-full border-2 border-accent-yellow bg-gradient-to-r from-accent-yellow to-accent-yellow/90 px-4 shadow-md backdrop-blur-sm">
            <StarIcon className="h-4 w-4 text-white" />
            <span className="font-inter text-sm font-bold text-white">
              Featured
            </span>
          </div>
        )}

        {/* Talk Count Badge for Featured */}
        {variant === 'featured' && talkCount > 0 && (
          <div className="relative flex h-8 items-center rounded-full border border-brand-fresh-green/30 bg-brand-fresh-green/15 px-3 backdrop-blur-sm">
            <span className="font-inter text-xs font-medium text-brand-fresh-green">
              {talkCount} {talkCount === 1 ? 'Talk' : 'Talks'}
            </span>
          </div>
        )}

        {/* Company Badge for Featured */}
        {variant === 'featured' && company && (
          <div className="relative flex h-8 items-center rounded-full border border-gray-300/30 bg-gray-100/60 px-3 backdrop-blur-sm">
            <span className="font-inter text-xs font-medium text-gray-600">
              {company}
            </span>
          </div>
        )}

        {/* Speaker Flags for Featured */}
        {variant === 'featured' &&
          speaker.flags &&
          speaker.flags.length > 0 && (
            <>
              {speaker.flags.includes(Flags.localSpeaker) && (
                <div className="relative flex h-8 items-center space-x-1 rounded-full border border-brand-fresh-green/30 bg-brand-fresh-green/15 px-3 backdrop-blur-sm">
                  <MapPinIcon className="h-3 w-3 text-brand-fresh-green" />
                  <span className="font-inter text-xs font-medium text-brand-fresh-green">
                    Local
                  </span>
                </div>
              )}
              {speaker.flags.includes(Flags.firstTimeSpeaker) && (
                <div className="relative flex h-8 items-center space-x-1 rounded-full border border-purple-300/30 bg-purple-100/60 px-3 backdrop-blur-sm">
                  <SparklesIcon className="h-3 w-3 text-purple-600" />
                  <span className="font-inter text-xs font-medium text-purple-600">
                    First Timer
                  </span>
                </div>
              )}
            </>
          )}
      </div>

      {/* Trophy Icon for isFeatured */}
      {isFeatured && (
        <div
          className={`relative flex items-center justify-center rounded-full bg-accent-yellow shadow-lg ${variant === 'featured' ? 'h-10 w-10' : 'h-8 w-8'}`}
        >
          <TrophyIcon
            className={`text-white ${variant === 'featured' ? 'h-5 w-5' : 'h-4 w-4'}`}
          />
        </div>
      )}
    </header>
  )

  /**
   * Body Component - Speaker info, bio, and talk details
   */
  const SpeakerBody = () => (
    <div className="relative flex-1">
      {/* Speaker Image and Basic Info */}
      <div
        className={`mb-6 flex ${variant === 'featured' ? 'items-start space-x-6' : 'flex-col items-center space-y-3'}`}
      >
        {/* Speaker Image */}
        <div className="flex-shrink-0">
          <SpeakerImage
            image={image}
            name={name}
            size={variant === 'featured' ? 96 : variant === 'compact' ? 60 : 70}
            className={`${variant === 'featured' ? 'rounded-2xl border-4 border-white/50 shadow-xl' : 'rounded-full'} shadow-lg`}
          />
        </div>

        {/* Name and Title */}
        <div
          className={`min-w-0 flex-1 ${variant === 'featured' ? '' : 'text-center'}`}
        >
          <h3 className={`mb-3 ${variantSettings.titleClass}`}>{name}</h3>

          {title && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-700 dark:text-gray-300">
              <span
                className={`font-inter line-clamp-2 font-semibold ${variant === 'featured' ? 'text-lg' : ''}`}
              >
                {title}
              </span>
            </div>
          )}

          {/* Company */}
          {company && variant !== 'compact' && variant !== 'featured' && (
            <div className="mt-3 flex items-center justify-center space-x-2">
              <BuildingOfficeIcon className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="font-inter line-clamp-1 text-sm text-gray-600 dark:text-gray-400">
                {company}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bio */}
      {bio && variant !== 'compact' && (
        <div
          className={`mb-6 rounded-xl border border-white/20 bg-white/60 backdrop-blur-sm dark:border-gray-600/20 dark:bg-gray-700/60 ${variant === 'featured' ? 'p-5' : 'p-3'}`}
        >
          <p
            className={`font-inter text-gray-700 dark:text-gray-300 ${variant === 'featured' ? 'line-clamp-2 text-base leading-relaxed' : 'line-clamp-3 text-sm'}`}
          >
            {bio}
          </p>
        </div>
      )}

      {/* Expertise Tags */}
      {expertise.length > 0 &&
        variant !== 'compact' &&
        variant !== 'featured' && (
          <div className="mb-6">
            <div className="flex flex-wrap justify-center gap-2">
              {expertise.slice(0, 3).map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-brand-cloud-blue/20 bg-brand-cloud-blue/10 px-3 py-1 text-xs font-medium text-brand-cloud-blue backdrop-blur-sm"
                >
                  {skill}
                </span>
              ))}
              {expertise.length > 3 && (
                <span className="rounded-full border border-gray-200 bg-gray-100/80 px-3 py-1 text-xs font-medium text-gray-600 backdrop-blur-sm">
                  +{expertise.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}
    </div>
  )

  /**
   * Footer Component - Talk count and CTA
   * Always positioned at the bottom using mt-auto
   */
  const SpeakerFooter = () => (
    <footer
      className={`relative mt-auto border-t border-gray-100/50 backdrop-blur-sm dark:border-gray-700/50 ${variant === 'featured' ? 'pt-6' : 'pt-4'}`}
    >
      <div className="flex items-center justify-between">
        {/* Left side content */}
        <div className="flex items-center gap-2">
          {/* Talk Count - only show for non-featured variants */}
          {variant !== 'featured' && talkCount > 0 ? (
            <>
              <SpeakerWaveIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              <span className="font-inter text-sm text-gray-600 dark:text-gray-400">
                {talkCount} {talkCount === 1 ? 'Talk' : 'Talks'}
              </span>
            </>
          ) : variant !== 'featured' ? (
            <>
              <MicrophoneIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              <span className="font-inter text-sm text-gray-600 dark:text-gray-400">
                Speaker
              </span>
            </>
          ) : null}

          {/* Expertise Tags - for featured variant */}
          {variant === 'featured' && expertise.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {expertise.slice(0, 3).map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-brand-cloud-blue/20 bg-brand-cloud-blue/10 px-3 py-1 text-xs font-medium text-brand-cloud-blue backdrop-blur-sm"
                >
                  {skill}
                </span>
              ))}
              {expertise.length > 3 && (
                <span className="rounded-full border border-gray-200 bg-gray-100/80 px-3 py-1 text-xs font-medium text-gray-600 backdrop-blur-sm">
                  +{expertise.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* CTA Link */}
        <Link
          href={finalCtaUrl}
          className={`group/cta font-inter inline-flex items-center space-x-2 font-semibold text-brand-cloud-blue transition-all duration-200 hover:text-brand-cloud-blue/80 ${variant === 'featured' ? 'text-base' : 'text-sm'}`}
        >
          <span>{finalCtaText}</span>
          <ArrowRightIcon
            className={`transition-transform group-hover/cta:translate-x-1 ${variant === 'featured' ? 'h-4 w-4' : 'h-3 w-3'}`}
          />
        </Link>
      </div>
    </footer>
  )

  // Main component structure
  return (
    <div className={`${variantSettings.containerClass} ${className}`}>
      <SpeakerHeader />
      <SpeakerBody />
      <SpeakerFooter />
    </div>
  )
})
