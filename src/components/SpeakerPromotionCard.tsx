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
import { speakerImageUrl } from '@/lib/sanity/client'
import { SpeakerWithTalks } from '@/lib/speaker/types'
import { Flags } from '@/lib/speaker/types'
import {
  computeSpeakerData,
  stripCompanyFromTitle,
} from '@/lib/speaker/promotion'
import Link from 'next/link'
import { memo, useMemo } from 'react'
import { SpeakerAvatarImage } from '@/components/common/SpeakerAvatarImage'

interface SpeakerPromotionCardProps {
  speaker: SpeakerWithTalks

  variant?: 'default' | 'featured' | 'compact' | 'organizer'

  className?: string

  isFeatured?: boolean

  ctaText?: string

  ctaUrl?: string
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
      'group relative flex flex-col h-full overflow-hidden rounded-xl border-2 border-brand-cloud-blue dark:border-brand-cloud-blue bg-linear-to-br from-brand-cloud-blue/20 via-brand-cloud-blue/10 to-brand-fresh-green/10 dark:from-brand-cloud-blue/30 dark:via-brand-cloud-blue/20 dark:to-brand-fresh-green/20 p-4 sm:p-6 lg:p-8 shadow-md transition-all duration-300 hover:shadow-lg dark:hover:shadow-xl',
    titleClass:
      'font-space-grotesk text-xl sm:text-2xl font-bold text-brand-slate-gray dark:text-white transition-colors group-hover:text-brand-cloud-blue dark:group-hover:text-brand-cloud-blue',
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
  organizer: {
    containerClass:
      'group relative flex flex-col h-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 transition-all duration-300 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg dark:hover:shadow-xl',
    titleClass:
      'font-space-grotesk text-xl font-bold text-brand-slate-gray dark:text-white transition-colors group-hover:text-brand-cloud-blue dark:group-hover:text-brand-cloud-blue',
    showFeaturedBadge: false,
    showCloudNativePattern: false,
  },
} as const

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
      <div
        style={{ width: size, height: size }}
        className={`overflow-hidden ${className}`}
      >
        <SpeakerAvatarImage
          src={speakerImageUrl(image, {
            width: size * 2,
            height: size * 2,
            fit: 'crop',
          })}
          name={name}
          size={size}
        />
      </div>
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

  const { expertise, company, talkCount, hasWorkshop } = useMemo(
    () => computeSpeakerData(speaker),
    [speaker],
  )

  const displayTitle = useMemo(
    () => stripCompanyFromTitle(speaker.title, company),
    [speaker.title, company],
  )

  const finalCtaText = ctaText || (isFeatured ? 'View Speaker' : 'View Profile')
  const finalCtaUrl = ctaUrl || `/speaker/${speaker.slug}`

  const { name, bio, image } = speaker

  const speakerHeader = (
    <header
      className={`relative flex items-start justify-between ${variant === 'featured' ? 'mb-6' : 'mb-4'}`}
    >
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex h-8 items-center space-x-2 rounded-full border border-brand-cloud-blue/30 bg-brand-cloud-blue/15 px-3 backdrop-blur-sm sm:px-4">
          <UserIcon className="h-3 w-3 text-brand-cloud-blue sm:h-4 sm:w-4" />
          <span className="font-inter text-xs font-medium text-brand-cloud-blue sm:text-sm">
            {variant === 'organizer' ? 'Organizer' : 'Speaker'}
          </span>
        </div>

        {variantSettings.showFeaturedBadge && (
          <div className="relative flex h-8 items-center space-x-1 rounded-full border-2 border-accent-yellow bg-linear-to-r from-accent-yellow to-accent-yellow/90 px-3 shadow-md backdrop-blur-sm sm:space-x-2 sm:px-4">
            <StarIcon className="h-3 w-3 text-white sm:h-4 sm:w-4" />
            <span className="font-inter text-xs font-bold text-white sm:text-sm">
              Featured
            </span>
          </div>
        )}

        {variant === 'featured' && talkCount > 0 && (
          <div className="relative flex h-8 items-center rounded-full border border-brand-fresh-green/30 bg-brand-fresh-green/15 px-2 backdrop-blur-sm sm:px-3">
            <span className="font-inter text-xs font-medium text-brand-fresh-green">
              {talkCount}{' '}
              {talkCount === 1
                ? hasWorkshop
                  ? 'Workshop'
                  : 'Talk'
                : hasWorkshop
                  ? 'Sessions'
                  : 'Talks'}
            </span>
          </div>
        )}

        {variant === 'featured' &&
          speaker.flags &&
          speaker.flags.length > 0 && (
            <>
              {speaker.flags.includes(Flags.localSpeaker) && (
                <div className="relative flex h-8 items-center space-x-1 rounded-full border border-brand-fresh-green/30 bg-brand-fresh-green/15 px-2 backdrop-blur-sm sm:px-3">
                  <MapPinIcon className="h-3 w-3 text-brand-fresh-green" />
                  <span className="font-inter text-xs font-medium text-brand-fresh-green">
                    Local
                  </span>
                </div>
              )}
              {speaker.flags.includes(Flags.firstTimeSpeaker) && (
                <div className="relative flex h-8 items-center space-x-1 rounded-full border border-purple-300/30 bg-purple-100/60 px-2 backdrop-blur-sm sm:px-3">
                  <SparklesIcon className="h-3 w-3 text-purple-600" />
                  <span className="font-inter hidden text-xs font-medium text-purple-600 sm:inline">
                    First Timer
                  </span>
                  <span className="font-inter text-xs font-medium text-purple-600 sm:hidden">
                    New
                  </span>
                </div>
              )}
            </>
          )}
      </div>

      {isFeatured && (
        <div
          className={`relative hidden items-center justify-center rounded-full bg-accent-yellow shadow-lg sm:flex ${variant === 'featured' ? 'h-10 w-10' : 'h-8 w-8'}`}
        >
          <TrophyIcon
            className={`text-white ${variant === 'featured' ? 'h-5 w-5' : 'h-4 w-4'}`}
          />
        </div>
      )}
    </header>
  )

  const speakerBody = (
    <div className="relative flex-1">
      <div
        className={`mb-6 flex ${variant === 'featured' ? 'flex-col items-center space-y-5 text-center' : 'flex-col items-center space-y-3 text-center'}`}
      >
        <div className="shrink-0">
          <SpeakerImage
            image={image}
            name={name}
            size={
              variant === 'featured'
                ? 140
                : variant === 'organizer'
                  ? 140
                  : variant === 'compact'
                    ? 60
                    : 70
            }
            className={`${variant === 'featured' ? 'rounded-2xl border-4 border-white/50 shadow-xl' : variant === 'organizer' ? 'rounded-full border-4 border-white/60 shadow-xl' : 'rounded-full'} shadow-lg`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className={`mb-3 ${variantSettings.titleClass}`}>{name}</h3>

          {displayTitle && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-gray-700 dark:text-gray-300">
              <span
                className={`font-inter line-clamp-2 font-semibold ${variant === 'featured' ? 'text-lg' : ''}`}
              >
                {displayTitle}
              </span>
            </div>
          )}

          {company && variant !== 'compact' && (
            <div className="mt-3 flex items-center justify-center space-x-2">
              <BuildingOfficeIcon
                className={`h-4 w-4 shrink-0 ${variant === 'featured' ? 'text-brand-cloud-blue dark:text-brand-cloud-blue/80' : 'text-gray-400 dark:text-gray-500'}`}
              />
              <span
                className={`font-inter line-clamp-1 text-sm ${variant === 'featured' ? 'font-medium text-brand-slate-gray dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'}`}
              >
                {company}
              </span>
            </div>
          )}
        </div>
      </div>

      {bio &&
        variant !== 'compact' &&
        variant !== 'featured' &&
        variant !== 'organizer' && (
          <div
            className={`mb-6 rounded-xl border border-white/20 bg-white/60 p-3 backdrop-blur-sm dark:border-gray-600/20 dark:bg-gray-700/60`}
          >
            <p
              className={`font-inter line-clamp-3 text-sm text-gray-700 dark:text-gray-300`}
            >
              {bio}
            </p>
          </div>
        )}

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

  const speakerFooter = (
    <footer
      className={`relative mt-auto border-t border-gray-100/50 backdrop-blur-sm dark:border-gray-700/50 ${variant === 'featured' ? 'pt-6' : 'pt-4'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
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

  return (
    <div className={`${variantSettings.containerClass} ${className}`}>
      {speakerHeader}
      {speakerBody}
      {variant !== 'organizer' && speakerFooter}
    </div>
  )
})
