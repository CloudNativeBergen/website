import { useMemo, type ReactNode } from 'react'
import { CloudNativePattern } from './CloudNativePattern'
import { LinkedInIcon, BlueskyIcon, GitHubIcon } from './SocialIcons'
import { Speaker } from '@/lib/speaker/types'
import {
  ShieldCheckIcon,
  BoltIcon,
  ChartBarIcon,
  QueueListIcon,
  StarIcon,
} from '@heroicons/react/24/solid'

// Type definitions
type GradientVariant = 'brand' | 'blue-purple' | 'green-yellow'
type TopicVariant =
  | 'security'
  | 'devops'
  | 'observability'
  | 'performance'
  | 'platform'

interface SocialLinks {
  linkedin?: string
  bluesky?: string
  github?: string
}

interface TopicConfig {
  bg: string
  border: string
  text: string
  icon: ReactNode
}

// Extended speaker interface for display purposes
export interface SpeakerCardData extends Partial<Speaker> {
  /** Speaker's name */
  name: string
  /** Speaker's job title */
  title?: string
  /** Speaker's company (can be separate from title) */
  company?: string
  /** URL to speaker's profile image */
  imageUrl?: string
  /** Topic/expertise area */
  topic?: string
  /** Short bio */
  bio?: string
  /** Whether this is a keynote speaker */
  isKeynote?: boolean
  /** Social media links parsed from links array */
  socialLinks?: SocialLinks
  /** Custom gradient for the header */
  gradient?: GradientVariant
  /** Topic badge color variant */
  topicVariant?: TopicVariant
}

export interface SpeakerCardProps {
  /** Speaker data */
  speaker: SpeakerCardData
  /** Override display options */
  options?: {
    customGradient?: GradientVariant
    customTopicVariant?: TopicVariant
    /** Force showing bio even in small containers */
    alwaysShowBio?: boolean
    /** Minimum height for the card */
    minHeight?: string
    /** Make the card fill the full height of its container */
    fullHeight?: boolean
    /** Display card in prominent/featured mode with enhanced styling */
    prominent?: boolean
    /** Use compact mode with smaller minimum width for very small containers */
    compact?: boolean
  }
}

// Constants
const GRADIENT_CLASSES: Record<GradientVariant, string> = {
  brand: 'bg-brand-gradient',
  'blue-purple': 'bg-gradient-to-br from-brand-cloud-blue to-brand-tech-purple',
  'green-yellow':
    'bg-gradient-to-br from-brand-fresh-green to-brand-sunbeam-yellow',
} as const

const TOPIC_VARIANTS: Record<TopicVariant, TopicConfig> = {
  security: {
    bg: 'bg-brand-cloud-blue/10',
    border: 'border-brand-cloud-blue/20',
    text: 'text-brand-cloud-blue',
    icon: <ShieldCheckIcon className="h-3 w-3" />,
  },
  devops: {
    bg: 'bg-brand-fresh-green/10',
    border: 'border-brand-fresh-green/20',
    text: 'text-brand-fresh-green',
    icon: <BoltIcon className="h-3 w-3" />,
  },
  observability: {
    bg: 'bg-brand-nordic-purple/10',
    border: 'border-brand-nordic-purple/20',
    text: 'text-brand-nordic-purple',
    icon: <ChartBarIcon className="h-3 w-3" />,
  },
  performance: {
    bg: 'bg-brand-sunbeam-yellow/10',
    border: 'border-brand-sunbeam-yellow/20',
    text: 'text-amber-600',
    icon: <BoltIcon className="h-3 w-3" />,
  },
  platform: {
    bg: 'bg-gray-100',
    border: 'border-gray-200',
    text: 'text-gray-700',
    icon: <QueueListIcon className="h-3 w-3" />,
  },
} as const

const DEFAULT_AVATAR_URL =
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80'

// Class constants for better maintainability
const CONTAINER_CLASSES = {
  base: '@container w-full overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl @xs:shadow-md @md:shadow-lg @lg:shadow-xl',
  prominent:
    'shadow-2xl border-brand-cloud-blue/30 ring-4 ring-brand-cloud-blue/15 scale-105 relative before:absolute before:inset-0 before:rounded-3xl before:bg-gradient-to-br before:from-brand-cloud-blue/5 before:to-brand-tech-purple/5 before:opacity-75 hover:ring-brand-cloud-blue/25 hover:shadow-brand-cloud-blue/20 animate-pulse-subtle',
  fullHeight: 'h-full flex flex-col',
  compact: 'min-w-[120px]',
  regular: 'min-w-[200px]',
} as const

const HEADER_CLASSES = {
  base: 'relative overflow-hidden p-4 @xs:p-6 @sm:p-8 @md:p-10 @lg:p-12 @xl:p-16 @2xl:p-20',
  prominent:
    '@lg:p-16 @xl:p-20 @2xl:p-24 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/10 before:to-transparent before:opacity-50',
  compact: 'p-2 @xs:p-3 @sm:p-4 @md:p-5 @lg:p-6 @xl:p-7 @2xl:p-8',
} as const

const AVATAR_CLASSES = {
  container: 'relative z-20 flex justify-center',
  image:
    'h-16 w-16 rounded-full bg-white p-1 shadow-lg @xs:h-20 @xs:w-20 @sm:h-24 @sm:w-24 @sm:p-1.5 @md:h-28 @md:w-28 @lg:h-32 @lg:w-32 @lg:p-2 @xl:h-40 @xl:w-40 @2xl:h-48 @2xl:w-48 @2xl:p-2.5',
  prominent:
    '@lg:h-40 @lg:w-40 @xl:h-48 @xl:w-48 @2xl:h-56 @2xl:w-56 @2xl:p-3 ring-4 ring-white shadow-2xl shadow-brand-cloud-blue/20',
} as const

// Utility functions
const parseSocialLinks = (links: string[]): SocialLinks => {
  const socialLinks: SocialLinks = {}

  for (const link of links) {
    try {
      const url = new URL(link)
      const hostname = url.hostname.toLowerCase()

      if (hostname.includes('linkedin.com')) {
        socialLinks.linkedin = link
      } else if (hostname.includes('bsky.app')) {
        socialLinks.bluesky = link
      } else if (hostname.includes('github.com')) {
        socialLinks.github = link
      }
    } catch {
      // Invalid URL, skip it
    }
  }

  return socialLinks
}

// Helper to build container classes
const buildContainerClasses = (options: SpeakerCardProps['options'] = {}) => {
  let classes = CONTAINER_CLASSES.base

  if (options.fullHeight) classes += ` ${CONTAINER_CLASSES.fullHeight}`
  if (options.prominent) classes += ` ${CONTAINER_CLASSES.prominent}`
  classes += ` ${options.compact ? CONTAINER_CLASSES.compact : CONTAINER_CLASSES.regular}`

  return classes
}

// Helper to build header classes
const buildHeaderClasses = (
  gradient: GradientVariant,
  options: SpeakerCardProps['options'] = {},
) => {
  let classes = `${GRADIENT_CLASSES[gradient]} ${HEADER_CLASSES.base}`

  if (options.prominent) classes += ` ${HEADER_CLASSES.prominent}`
  if (options.compact) classes += ` ${HEADER_CLASSES.compact}`

  return classes
}

// Helper to build avatar positioning classes
const buildAvatarClasses = (
  isKeynote: boolean,
  options: SpeakerCardProps['options'] = {},
) => {
  let classes = AVATAR_CLASSES.container

  if (isKeynote) {
    classes +=
      ' -mt-2 @xs:-mt-3 @sm:-mt-4 @md:-mt-5 @lg:-mt-6 @xl:-mt-8 @2xl:-mt-10'
  } else {
    classes +=
      ' -mt-8 @xs:-mt-10 @sm:-mt-12 @md:-mt-14 @lg:-mt-16 @xl:-mt-20 @2xl:-mt-24'
    if (options.prominent) {
      classes += ' @lg:-mt-20 @xl:-mt-24 @2xl:-mt-28'
    }
  }

  if (options.compact) {
    classes +=
      ' -mt-4 @xs:-mt-5 @sm:-mt-6 @md:-mt-7 @lg:-mt-8 @xl:-mt-9 @2xl:-mt-10'
  }

  return classes
}

// Helper to build avatar image classes
const buildAvatarImageClasses = (options: SpeakerCardProps['options'] = {}) => {
  let classes = AVATAR_CLASSES.image

  if (options.prominent) {
    classes += ` ${AVATAR_CLASSES.prominent}`
  }

  return classes
}

// Components
interface SocialLinksProps {
  socialLinks: SocialLinks
}

const SocialLinks = ({ socialLinks }: SocialLinksProps) => {
  const socialLinkConfig = useMemo(
    () => [
      {
        key: 'linkedin' as const,
        icon: LinkedInIcon,
        label: 'LinkedIn',
        url: socialLinks.linkedin,
      },
      {
        key: 'bluesky' as const,
        icon: BlueskyIcon,
        label: 'Bluesky',
        url: socialLinks.bluesky,
      },
      {
        key: 'github' as const,
        icon: GitHubIcon,
        label: 'GitHub',
        url: socialLinks.github,
      },
    ],
    [socialLinks],
  )

  return (
    <div className="flex items-center justify-center gap-1.5 @xs:gap-2 @sm:gap-2.5 @md:gap-3 @lg:gap-3.5 @xl:gap-4 @2xl:gap-4">
      {socialLinkConfig.map(({ key, icon: Icon, label, url }) =>
        url ? (
          <a
            key={key}
            href={url}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 text-gray-600 transition-all duration-200 hover:scale-110 hover:bg-brand-cloud-blue hover:text-white @xs:h-8 @xs:w-8 @sm:h-9 @sm:w-9 @md:h-10 @md:w-10 @lg:h-11 @lg:w-11 @xl:h-12 @xl:w-12 @2xl:h-14 @2xl:w-14"
            aria-label={label}
          >
            <Icon className="h-3.5 w-3.5 @xs:h-4 @xs:w-4 @sm:h-4 @sm:w-4 @md:h-5 @md:w-5 @lg:h-5 @lg:w-5 @xl:h-6 @xl:w-6 @2xl:h-7 @2xl:w-7" />
          </a>
        ) : null,
      )}
    </div>
  )
}

export function SpeakerCard({ speaker, options = {} }: SpeakerCardProps) {
  // Memoize speaker data processing
  const speakerData = useMemo(() => {
    const name = speaker.name
    const title = speaker.title || ''
    const company = speaker.company || ''
    const imageUrl = speaker.imageUrl || speaker.imageURL || DEFAULT_AVATAR_URL
    const topic = speaker.topic || 'Speaker'
    const bio = speaker.bio || ''
    const isKeynote = speaker.isKeynote || speaker.is_featured || false
    const gradient = options.customGradient || speaker.gradient || 'brand'
    const topicVariant =
      options.customTopicVariant || speaker.topicVariant || 'security'

    // Parse social links from speaker.links array or use provided socialLinks
    const socialLinks =
      speaker.socialLinks || parseSocialLinks(speaker.links || [])

    return {
      name,
      title,
      company,
      imageUrl,
      topic,
      bio,
      isKeynote,
      gradient,
      topicVariant,
      socialLinks,
    }
  }, [speaker, options.customGradient, options.customTopicVariant])

  // Memoize topic configuration
  const topicConfig = useMemo(
    () => TOPIC_VARIANTS[speakerData.topicVariant],
    [speakerData.topicVariant],
  )

  // Memoize computed classes
  const containerClasses = useMemo(
    () => buildContainerClasses(options),
    [options],
  )
  const headerClasses = useMemo(
    () => buildHeaderClasses(speakerData.gradient, options),
    [speakerData.gradient, options],
  )
  const avatarContainerClasses = useMemo(
    () => buildAvatarClasses(speakerData.isKeynote, options),
    [speakerData.isKeynote, options],
  )
  const avatarImageClasses = useMemo(
    () => buildAvatarImageClasses(options),
    [options],
  )

  const { name, title, company, imageUrl, topic, bio, isKeynote, socialLinks } =
    speakerData
  const cardStyle = options.minHeight
    ? { minHeight: options.minHeight }
    : undefined

  return (
    <div className={containerClasses} style={cardStyle}>
      {/* Header with Pattern Background */}
      <div className={headerClasses}>
        <CloudNativePattern
          className="z-0"
          opacity={0.2}
          animated={false}
          variant="light"
          baseSize={15}
          iconCount={30}
        />

        {/* Keynote Badge */}
        {isKeynote && (
          <div className="relative z-10 mt-1.5 mb-1.5 flex justify-center @xs:mt-2 @xs:mb-2 @sm:mt-2.5 @sm:mb-2.5 @md:mt-3 @md:mb-3 @lg:mt-4 @lg:mb-4 @xl:mt-5 @xl:mb-5 @2xl:mt-6 @2xl:mb-6">
            <span
              className={`font-inter inline-flex items-center gap-1.5 rounded-full border text-xs font-medium backdrop-blur-sm @sm:text-sm @md:px-4 @md:py-2 @lg:px-5 @lg:py-2.5 @lg:text-base @xl:px-6 @xl:py-3 @2xl:text-lg ${
                options?.prominent
                  ? 'border-yellow-300/50 bg-gradient-to-r from-yellow-200/30 to-amber-200/30 px-4 py-2 text-yellow-50 shadow-lg ring-2 shadow-yellow-500/20 ring-yellow-300/20 @lg:px-6 @lg:py-3 @xl:px-7 @xl:py-3.5 @2xl:px-8 @2xl:py-4'
                  : 'border-white/30 bg-white/20 px-2.5 py-1 text-white @xs:px-3 @xs:py-1.5 @sm:px-3.5 @sm:py-1.5'
              }`}
            >
              <StarIcon
                className={`${options?.prominent ? 'h-4 w-4 @sm:h-5 @sm:w-5 @md:h-5 @md:w-5 @lg:h-6 @lg:w-6 @xl:h-7 @xl:w-7 @2xl:h-8 @2xl:w-8' : 'h-3 w-3 @xs:h-3 @xs:w-3 @sm:h-4 @sm:w-4 @md:h-4 @md:w-4 @lg:h-5 @lg:w-5 @xl:h-5 @xl:w-5 @2xl:h-6 @2xl:w-6'}`}
              />
              Keynote Speaker
            </span>
          </div>
        )}
      </div>

      {/* Avatar */}
      <div className={avatarContainerClasses}>
        <div className={avatarImageClasses}>
          <img
            className="h-full w-full rounded-full object-cover"
            src={imageUrl}
            alt={name}
            loading="lazy"
          />
        </div>
      </div>

      {/* Content */}
      <div
        className={`px-3 pb-3 @xs:px-4 @xs:pb-4 @sm:px-5 @sm:pb-5 @md:px-6 @md:pb-6 @lg:px-7 @lg:pb-7 @xl:px-8 @xl:pb-8 @2xl:px-10 @2xl:pb-10 ${options.fullHeight ? 'flex flex-1 flex-col' : ''} ${options.compact ? 'px-2 pb-2 @xs:px-3 @xs:pb-3 @sm:px-3.5 @sm:pb-3.5 @md:px-4 @md:pb-4 @lg:px-5 @lg:pb-5' : ''}`}
      >
        <div
          className={`mt-1.5 text-center @xs:mt-2 @sm:mt-2.5 @md:mt-3 @lg:mt-4 @xl:mt-5 @2xl:mt-6 ${options.fullHeight ? 'flex-1' : ''} ${options.compact ? 'mt-1 @xs:mt-1.5 @sm:mt-2 @md:mt-2.5' : ''}`}
        >
          <h4
            className={`font-space-grotesk mb-0.5 text-xs font-bold text-brand-slate-gray @xs:mb-1 @xs:text-sm @sm:text-base @md:mb-1.5 @md:text-lg @lg:text-xl @xl:text-2xl @2xl:text-3xl ${options.prominent ? '@lg:text-2xl @xl:text-3xl @2xl:text-4xl' : ''}`}
          >
            {name}
          </h4>

          {(title || company) && (
            <p
              className={`font-inter mb-1.5 text-xs text-gray-600 @xs:mb-2 @xs:text-sm @sm:text-sm @md:mb-2.5 @md:text-base @lg:text-lg @xl:text-xl @2xl:text-2xl ${options.prominent ? '@lg:text-xl @xl:text-2xl @2xl:text-3xl' : ''}`}
            >
              {title}
              {title && company && ' at '}
              {company}
            </p>
          )}

          {/* Topic Badge */}
          {topic && (
            <div
              className={`inline-flex items-center gap-1 ${topicConfig.bg} ${topicConfig.border} ${topicConfig.text} font-inter rounded-full px-2 py-0.5 text-xs font-medium @xs:px-2.5 @xs:py-1 @sm:text-sm @md:px-3 @md:py-1.5 @lg:text-base @xl:px-3.5 @xl:py-2`}
            >
              {topicConfig.icon}
              {topic}
            </div>
          )}

          {/* Bio */}
          {bio && (options.alwaysShowBio || true) && (
            <p
              className={`font-inter mt-1.5 hidden text-center text-xs leading-relaxed text-gray-700 @xs:mt-2 @xs:block @xs:text-sm @sm:mt-2.5 @sm:text-sm @md:mt-3 @md:text-base @lg:mt-4 @lg:text-lg @xl:mt-5 @xl:text-xl @2xl:mt-6 @2xl:text-2xl ${options.compact ? 'mt-1 @xs:mt-1.5 @sm:mt-2 @md:mt-2.5' : ''}`}
            >
              {bio}
            </p>
          )}
        </div>

        {/* Social Links */}
        <div
          className={`mt-1.5 @xs:mt-2 @sm:mt-2.5 @md:mt-3 @lg:mt-4 @xl:mt-5 @2xl:mt-6 ${options.fullHeight ? 'mt-auto' : ''} ${options.compact ? 'mt-1 @xs:mt-1.5 @sm:mt-2 @md:mt-2.5' : ''}`}
        >
          <SocialLinks socialLinks={socialLinks} />
        </div>
      </div>
    </div>
  )
}
