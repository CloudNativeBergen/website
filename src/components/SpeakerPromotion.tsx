import { CloudNativePattern } from '@/components/CloudNativePattern'
import {
  ArrowRightIcon,
  BuildingOfficeIcon,
  SpeakerWaveIcon,
  StarIcon,
  PresentationChartBarIcon,
} from '@heroicons/react/24/outline'
import {
  UserIcon,
  MicrophoneIcon,
  TrophyIcon,
  LightBulbIcon,
} from '@heroicons/react/24/solid'
import Image from 'next/image'
import { sanityImage } from '@/lib/sanity/client'
import { Format } from '@/lib/proposal/types'
import { formatConfig } from '@/lib/proposal/formatConfig'
import { SpeakerWithTalks } from '@/lib/speaker/types'
import { useMemo, memo } from 'react'

/**
 * Props for the SpeakerPromotion component
 */
interface SpeakerPromotionProps {
  /** Speaker data including talks and personal information */
  speaker: SpeakerWithTalks
  /** Visual variant of the component */
  variant?: 'featured' | 'card' | 'compact' | 'social'
  /** Additional CSS classes */
  className?: string
  /** Whether to show as a featured speaker */
  isFeatured?: boolean
  /** Custom call-to-action text */
  ctaText?: string
  /** Custom call-to-action URL */
  ctaUrl?: string
}

const variantConfig = {
  featured: {
    gradient: 'from-brand-cloud-blue/20 to-brand-fresh-green/10',
    accentColor: 'text-brand-cloud-blue',
    icon: StarIcon,
  },
  card: {
    gradient: 'from-brand-sky-mist/30 to-brand-glacier-white/20',
    accentColor: 'text-brand-slate-gray',
    icon: UserIcon,
  },
  compact: {
    gradient: 'from-brand-glacier-white/50 to-white',
    accentColor: 'text-brand-cloud-blue',
    icon: MicrophoneIcon,
  },
  social: {
    gradient: 'from-brand-fresh-green/20 to-brand-cloud-blue/15',
    accentColor: 'text-brand-fresh-green',
    icon: LightBulbIcon,
  },
}

/**
 * Helper function to derive expertise areas from speaker talks
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
 * Helper function to derive company name from speaker title
 */
const deriveCompany = (title: string | undefined): string | undefined => {
  if (!title) return undefined

  // Check for " at " pattern first
  if (title.includes(' at ')) {
    return title.split(' at ')[1]
  }

  // Check for "@" pattern
  if (title.includes('@')) {
    return title.split('@')[1]
  }

  return undefined
}

/**
 * Optimized SpeakerPromotion component with multiple visual variants.
 *
 * Features:
 * - Single speaker prop interface with derived fields
 * - High-DPI image support (2x resolution)
 * - Memoized computations for performance
 * - Support for featured speakers with badges
 * - Multiple variants: featured, card, compact, social
 * - Automatic expertise derivation from talks
 * - Company extraction from title
 */
export const SpeakerPromotion = memo(function SpeakerPromotion({
  speaker,
  variant = 'card',
  className = '',
  isFeatured = false,
  ctaText,
  ctaUrl,
}: SpeakerPromotionProps) {
  // Memoize computed values to prevent unnecessary recalculations
  const derivedData = useMemo(() => {
    const talks = speaker.talks || []
    const primaryTalk = talks.length > 0 ? talks[0] : null
    const expertise = deriveExpertise(talks)
    const company = deriveCompany(speaker.title)

    return {
      primaryTalk,
      talkCount: talks.length,
      expertise,
      company,
    }
  }, [speaker.talks, speaker.title])

  // Memoize variant config
  const config = useMemo(() => variantConfig[variant], [variant])
  const Icon = config.icon

  // Memoize CTA values
  const ctaData = useMemo(() => {
    const defaultCtaText = isFeatured
      ? 'View Speaker'
      : variant === 'social'
        ? 'Follow'
        : 'View Profile'
    const finalCtaText = ctaText || defaultCtaText
    const finalCtaUrl = ctaUrl || `/speaker/${speaker.slug || speaker._id}`

    return { finalCtaText, finalCtaUrl }
  }, [ctaText, ctaUrl, isFeatured, variant, speaker.slug, speaker._id])

  // Extract speaker properties for cleaner code
  const { name, title, bio, image } = speaker
  const { primaryTalk, talkCount, expertise, company } = derivedData
  const { finalCtaText, finalCtaUrl } = ctaData

  if (variant === 'featured') {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${config.gradient} border border-gray-200 p-6 md:p-8 ${className}`}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <CloudNativePattern
            iconCount={16}
            baseSize={20}
            className="h-full w-full"
          />
        </div>

        <div className="relative">
          <div className="flex flex-col md:flex-row md:items-center md:space-x-8">
            {/* Speaker Image & Badge */}
            <div className="mb-6 md:mb-0 md:flex-shrink-0">
              <div className="relative">
                {image ? (
                  <Image
                    src={sanityImage(image)
                      .width(240) // 2x the display size of 120px for high-DPI
                      .height(240)
                      .fit('crop')
                      .url()}
                    alt={name}
                    width={120}
                    height={120}
                    className="rounded-xl object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-30 w-30 items-center justify-center rounded-xl bg-brand-cloud-blue/10 shadow-lg">
                    <UserIcon className="h-12 w-12 text-brand-cloud-blue/50" />
                  </div>
                )}
                {isFeatured && (
                  <div className="absolute -top-1 -right-1 rounded-full bg-accent-yellow p-1.5 shadow-lg">
                    <TrophyIcon className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
            </div>

            {/* Speaker Content */}
            <div className="min-w-0 flex-1">
              {/* Speaker Badge */}
              <div className="mb-3 flex items-center space-x-2">
                <Icon className={`h-5 w-5 ${config.accentColor}`} />
                <span
                  className={`font-inter text-sm font-semibold ${config.accentColor}`}
                >
                  Featured Speaker
                </span>
              </div>

              {/* Title & Company */}
              <div className="mb-4">
                <h2 className="font-space-grotesk mb-2 text-2xl font-bold text-brand-slate-gray md:text-3xl">
                  {name}
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-700">
                  {title && (
                    <span className="font-inter font-semibold">{title}</span>
                  )}
                </div>
              </div>

              {/* Condensed Bio */}
              {bio && (
                <p className="font-inter mb-4 line-clamp-2 leading-relaxed text-gray-600">
                  {bio}
                </p>
              )}

              {/* Talk & Stats Row */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Primary Talk */}
                {primaryTalk && (
                  <div className="rounded-lg border border-white/80 bg-white/60 px-3 py-2">
                    <div className="flex items-center space-x-2">
                      {(() => {
                        const talkConfig =
                          formatConfig[primaryTalk.format as Format]
                        const TalkIcon =
                          talkConfig?.icon || PresentationChartBarIcon
                        return (
                          <>
                            <TalkIcon
                              className={`h-4 w-4 ${talkConfig?.color || 'text-brand-cloud-blue'}`}
                            />
                            <span className="font-inter text-sm font-semibold text-brand-slate-gray">
                              {primaryTalk.title}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                )}

                {/* Quick Stats */}
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  {talkCount > 0 && (
                    <div className="flex items-center space-x-1">
                      <SpeakerWaveIcon className="h-4 w-4" />
                      <span className="font-inter">
                        {talkCount} {talkCount === 1 ? 'Talk' : 'Talks'}
                      </span>
                    </div>
                  )}
                  {expertise.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <LightBulbIcon className="h-4 w-4" />
                      <span className="font-inter">
                        {expertise.slice(0, 2).join(', ')}
                        {expertise.length > 2 && ` +${expertise.length - 2}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-6 md:mt-0 md:flex-shrink-0">
              <a
                href={finalCtaUrl}
                className="group font-inter inline-flex items-center space-x-2 rounded-lg bg-brand-cloud-blue px-6 py-3 font-semibold text-white transition-all hover:bg-brand-cloud-blue/90 hover:shadow-lg"
              >
                <span>{finalCtaText}</span>
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'social') {
    return (
      <div
        className={`relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br ${config.gradient} max-w-sm border border-gray-200 p-6 ${className}`}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-15">
          <CloudNativePattern
            iconCount={16}
            baseSize={20}
            className="h-full w-full"
          />
        </div>

        <div className="relative flex h-full flex-col">
          {/* Speaker Badge */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Icon className={`h-5 w-5 ${config.accentColor}`} />
              <span
                className={`font-inter text-sm font-semibold ${config.accentColor}`}
              >
                {isFeatured ? 'Featured' : 'Speaker'}
              </span>
            </div>
            {isFeatured && (
              <TrophyIcon className="h-5 w-5 text-accent-yellow" />
            )}
          </div>

          {/* Speaker Image */}
          <div className="mb-4 flex justify-center">
            {image ? (
              <Image
                src={sanityImage(image)
                  .width(160) // 2x the display size of 80px for high-DPI
                  .height(160)
                  .fit('crop')
                  .url()}
                alt={name}
                width={80}
                height={80}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-cloud-blue/10">
                <UserIcon className="h-10 w-10 text-brand-cloud-blue/50" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 text-center">
            <h3 className="font-space-grotesk mb-2 text-xl font-bold text-brand-slate-gray">
              {name}
            </h3>
            {title && (
              <p className="font-inter mb-2 text-sm font-semibold text-gray-700">
                {title}
              </p>
            )}

            {/* Expertise Tags or Talk Info */}
            {primaryTalk ? (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-center space-x-1">
                  {(() => {
                    const talkConfig =
                      formatConfig[primaryTalk.format as Format]
                    const TalkIcon =
                      talkConfig?.icon || PresentationChartBarIcon
                    return (
                      <>
                        <TalkIcon
                          className={`h-3 w-3 ${talkConfig?.color || 'text-brand-cloud-blue'}`}
                        />
                        <span className="font-inter text-xs font-medium text-gray-700">
                          {talkConfig?.label || 'Talk'}
                        </span>
                      </>
                    )
                  })()}
                </div>
                <p className="font-inter line-clamp-2 text-center text-xs text-gray-600">
                  {primaryTalk.title}
                </p>
              </div>
            ) : (
              expertise.length > 0 && (
                <div className="mb-4">
                  <div className="flex flex-wrap justify-center gap-1">
                    {expertise.slice(0, 3).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-brand-cloud-blue/10 px-2 py-1 text-xs font-medium text-brand-cloud-blue"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>

          {/* Quick Info */}
          <div className="mt-4 text-center">
            {talkCount > 0 && (
              <p className="font-inter text-xs text-gray-600">
                {talkCount} {talkCount === 1 ? 'talk' : 'talks'}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div
        className={`group relative overflow-hidden rounded-lg bg-gradient-to-r ${config.gradient} border border-gray-200 p-4 transition-all duration-300 hover:border-gray-300 hover:shadow-md ${className}`}
      >
        <div className="flex items-center space-x-4">
          {/* Speaker Image */}
          <div className="flex-shrink-0">
            {image ? (
              <Image
                src={sanityImage(image)
                  .width(120) // 2x the display size of 60px for high-DPI
                  .height(120)
                  .fit('crop')
                  .url()}
                alt={name}
                width={60}
                height={60}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="flex h-15 w-15 items-center justify-center rounded-full bg-brand-cloud-blue/10">
                <UserIcon className="h-8 w-8 text-brand-cloud-blue/50" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center space-x-2">
              <h3 className="font-space-grotesk truncate text-lg font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue">
                {name}
              </h3>
              {isFeatured && (
                <TrophyIcon className="h-4 w-4 flex-shrink-0 text-accent-yellow" />
              )}
            </div>
            {title && (
              <p className="font-inter truncate text-sm text-gray-700">
                {title}
              </p>
            )}
            {company && (
              <p className="font-inter truncate text-xs text-gray-600">
                {company}
              </p>
            )}
          </div>

          {/* CTA Arrow */}
          <div className="flex-shrink-0">
            <ArrowRightIcon className="h-5 w-5 text-gray-400 transition-all group-hover:translate-x-1 group-hover:text-brand-cloud-blue" />
          </div>
        </div>
      </div>
    )
  }

  // Default card variant
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all duration-300 hover:border-gray-300 hover:shadow-lg ${className}`}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <CloudNativePattern
          iconCount={12}
          baseSize={18}
          className="h-full w-full"
        />
      </div>

      <div className="relative flex h-full flex-col">
        {/* Featured Badge (only if featured) */}
        {isFeatured && (
          <div className="mb-3 flex justify-end">
            <TrophyIcon className="h-5 w-5 text-accent-yellow" />
          </div>
        )}

        {/* Horizontal Header: Image + Name + Title */}
        <div className="mb-4 flex items-start space-x-3">
          {/* Speaker Image */}
          <div className="flex-shrink-0">
            {image ? (
              <Image
                src={sanityImage(image)
                  .width(120) // 2x the display size of 60px for high-DPI
                  .height(120)
                  .fit('crop')
                  .url()}
                alt={name}
                width={60}
                height={60}
                className="rounded-full object-cover shadow-md"
              />
            ) : (
              <div className="flex h-15 w-15 items-center justify-center rounded-full bg-brand-cloud-blue/10 shadow-md">
                <UserIcon className="h-8 w-8 text-brand-cloud-blue/50" />
              </div>
            )}
          </div>

          {/* Name, Title & Company */}
          <div className="min-w-0 flex-1">
            {/* Name */}
            <h3 className="font-space-grotesk mb-1 text-lg font-bold text-brand-slate-gray transition-colors group-hover:text-brand-cloud-blue">
              {name}
            </h3>

            {/* Title */}
            {title && (
              <p className="font-inter mb-1 line-clamp-1 text-sm font-semibold text-gray-700">
                {title}
              </p>
            )}

            {/* Company */}
            {company && (
              <div className="flex items-center space-x-1">
                <BuildingOfficeIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="font-inter line-clamp-1 text-xs text-gray-600">
                  {company}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content Area - Flexible */}
        <div className="flex-1">
          {/* Bio */}
          {bio && (
            <div className="mb-3 rounded-lg bg-white/50 p-2">
              <p className="font-inter line-clamp-2 text-xs text-gray-600">
                {bio}
              </p>
            </div>
          )}

          {/* Primary Talk */}
          {primaryTalk && (
            <div className="mb-3 rounded-lg border border-gray-100 bg-white/80 p-2">
              <div className="flex items-center space-x-2">
                {(() => {
                  const talkConfig = formatConfig[primaryTalk.format as Format]
                  const TalkIcon = talkConfig?.icon || PresentationChartBarIcon
                  return (
                    <>
                      <TalkIcon
                        className={`h-4 w-4 flex-shrink-0 ${talkConfig?.color || 'text-brand-cloud-blue'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <span
                          className={`font-inter text-xs font-semibold ${talkConfig?.color || 'text-brand-cloud-blue'}`}
                        >
                          {talkConfig?.label || 'Talk'}:
                        </span>
                        <h4 className="font-space-grotesk line-clamp-1 text-xs font-semibold text-brand-slate-gray">
                          {primaryTalk.title}
                        </h4>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Expertise Tags */}
          {expertise.length > 0 && (
            <div className="mb-3">
              <div className="flex flex-wrap gap-1">
                {expertise.slice(0, 3).map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-brand-cloud-blue/10 px-2 py-0.5 text-xs font-medium text-brand-cloud-blue"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: Talk Count + CTA - Always at bottom */}
        <div className="mt-auto flex items-center justify-between pt-2">
          {/* Talk Count */}
          {talkCount > 0 ? (
            <div className="flex items-center space-x-1">
              <SpeakerWaveIcon className="h-4 w-4 text-gray-400" />
              <span className="font-inter text-xs text-gray-700">
                {talkCount} {talkCount === 1 ? 'Talk' : 'Talks'}
              </span>
            </div>
          ) : (
            <div></div> // Empty div to maintain layout when no talks
          )}

          {/* CTA */}
          <a
            href={finalCtaUrl}
            className="group/cta font-inter inline-flex items-center space-x-1 text-xs font-semibold text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80"
          >
            <span>{finalCtaText}</span>
            <ArrowRightIcon className="h-3 w-3 transition-transform group-hover/cta:translate-x-1" />
          </a>
        </div>
      </div>
    </div>
  )
})
