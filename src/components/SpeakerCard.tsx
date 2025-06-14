import { useMemo } from 'react'
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
  socialLinks?: {
    linkedin?: string
    bluesky?: string
    github?: string
  }
  /** Custom gradient for the header */
  gradient?: 'brand' | 'blue-purple' | 'green-yellow'
  /** Topic badge color variant */
  topicVariant?:
    | 'security'
    | 'devops'
    | 'observability'
    | 'performance'
    | 'platform'
}

export interface SpeakerCardProps {
  /** Speaker data */
  speaker: SpeakerCardData
  /** Override display options */
  options?: {
    showAsKeynote?: boolean
    showAsCompact?: boolean
    compactFillContainer?: boolean
    customGradient?: 'brand' | 'blue-purple' | 'green-yellow'
    customTopicVariant?:
      | 'security'
      | 'devops'
      | 'observability'
      | 'performance'
      | 'platform'
  }
}

// Configuration constants
const CARD_VARIANTS = {
  keynote: {
    shadowClass: 'shadow-xl',
    cardSizeClass: 'max-w-sm mx-auto',
    headerPadding: 'p-6 pb-16',
    avatarSize: 'w-36 h-36',
    avatarMargin: '-mt-18',
    avatarPadding: 'p-2',
    titleSize: 'text-xl',
    contentPadding: 'pt-8 px-6 pb-6',
    socialIconSize: 'w-12 h-12',
    socialIconInner: 'w-7 h-7',
    bioMargin: 'mb-6',
    titleMargin: 'mb-6',
    textSize: 'text-sm',
    patternBaseSize: 30,
    patternIconCount: 25,
  },
  compact: {
    shadowClass: 'shadow-md',
    cardSizeClass: 'max-w-xs mx-auto',
    headerPadding: 'p-4 pb-12',
    avatarSize: 'w-24 h-24',
    avatarMargin: '-mt-12',
    avatarPadding: 'p-1',
    titleSize: 'text-base',
    contentPadding: 'pt-4 px-4 pb-4',
    socialIconSize: 'w-8 h-8',
    socialIconInner: 'w-5 h-5',
    bioMargin: 'mb-4',
    titleMargin: 'mb-4',
    textSize: 'text-xs',
    patternBaseSize: 15,
    patternIconCount: 20,
  },
  normal: {
    shadowClass: 'shadow-lg',
    cardSizeClass: 'max-w-sm',
    headerPadding: 'p-6 pb-14',
    avatarSize: 'w-32 h-32',
    avatarMargin: '-mt-16',
    avatarPadding: 'p-2',
    titleSize: 'text-lg',
    contentPadding: 'pt-6 px-5 pb-5',
    socialIconSize: 'w-10 h-10',
    socialIconInner: 'w-6 h-6',
    bioMargin: 'mb-6',
    titleMargin: 'mb-6',
    textSize: 'text-sm',
    patternBaseSize: 25,
    patternIconCount: 20,
  },
} as const

const gradientClasses = {
  brand: 'bg-brand-gradient',
  'blue-purple': 'bg-gradient-to-br from-brand-cloud-blue to-brand-tech-purple',
  'green-yellow':
    'bg-gradient-to-br from-brand-fresh-green to-brand-sunbeam-yellow',
} as const

const topicVariants = {
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

// Helper function to parse social links from an array of URLs
function parseSocialLinks(links: string[]): {
  linkedin?: string
  bluesky?: string
  github?: string
} {
  const socialLinks: { linkedin?: string; bluesky?: string; github?: string } =
    {}

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

// Social Links Component
interface SocialLinksProps {
  socialLinks: {
    linkedin?: string
    bluesky?: string
    github?: string
  }
  iconSize: string
  iconInnerSize: string
}

function SocialLinks({
  socialLinks,
  iconSize,
  iconInnerSize,
}: SocialLinksProps) {
  const socialLinkConfig = [
    {
      key: 'linkedin',
      icon: LinkedInIcon,
      label: 'LinkedIn',
      url: socialLinks.linkedin,
    },
    {
      key: 'bluesky',
      icon: BlueskyIcon,
      label: 'Bluesky',
      url: socialLinks.bluesky,
    },
    {
      key: 'github',
      icon: GitHubIcon,
      label: 'GitHub',
      url: socialLinks.github,
    },
  ] as const

  return (
    <div className="flex items-center justify-center gap-4">
      {socialLinkConfig.map(({ key, icon: Icon, label, url }) =>
        url ? (
          <a
            key={key}
            href={url}
            className={`flex items-center justify-center ${iconSize} rounded-full bg-gray-50 text-gray-600 transition-all duration-200 hover:scale-110 hover:bg-brand-cloud-blue hover:text-white`}
            aria-label={label}
          >
            <Icon className={iconInnerSize} />
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
    const imageUrl =
      speaker.imageUrl ||
      speaker.imageURL ||
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=8&w=1024&h=1024&q=80'
    const topic = speaker.topic || 'Speaker'
    const bio = speaker.bio || ''
    const isKeynote =
      options.showAsKeynote || speaker.isKeynote || speaker.is_featured || false
    const isCompact = options.showAsCompact || false
    const compactFillContainer = options.compactFillContainer || false
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
      isCompact,
      compactFillContainer,
      gradient,
      topicVariant,
      socialLinks,
    }
  }, [speaker, options])

  // Memoize variant configuration
  const variantConfig = useMemo(() => {
    const { isKeynote, isCompact, compactFillContainer } = speakerData

    if (isKeynote) return CARD_VARIANTS.keynote
    if (isCompact) {
      return {
        ...CARD_VARIANTS.compact,
        cardSizeClass: compactFillContainer
          ? 'w-full'
          : CARD_VARIANTS.compact.cardSizeClass,
      }
    }
    return CARD_VARIANTS.normal
  }, [speakerData])

  // Memoize topic configuration
  const topicConfig = useMemo(
    () => topicVariants[speakerData.topicVariant],
    [speakerData.topicVariant],
  )

  const {
    name,
    title,
    company,
    imageUrl,
    topic,
    bio,
    isKeynote,
    isCompact,
    gradient,
    socialLinks,
  } = speakerData

  return (
    <div
      className={`rounded-3xl bg-white ${variantConfig.shadowClass} group overflow-hidden border border-gray-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${variantConfig.cardSizeClass}`}
    >
      {/* Header with Pattern Background */}
      <div
        className={`relative ${gradientClasses[gradient]} ${variantConfig.headerPadding} overflow-hidden`}
      >
        <CloudNativePattern
          className="z-0"
          opacity={0.2}
          animated={false}
          variant="light"
          baseSize={variantConfig.patternBaseSize}
          iconCount={variantConfig.patternIconCount}
        />

        {/* Keynote Badge */}
        {isKeynote && (
          <div className="relative z-10 mb-4 flex justify-center">
            <span className="font-inter inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
              <StarIcon className="h-3 w-3" />
              Keynote Speaker
            </span>
          </div>
        )}
      </div>

      {/* Avatar - Overlapping the header exactly halfway */}
      <div
        className={`relative ${variantConfig.avatarMargin} z-20 flex justify-center`}
      >
        <div
          className={`${variantConfig.avatarSize} rounded-full bg-white ${variantConfig.avatarPadding} shadow-xl`}
        >
          <img
            className="h-full w-full rounded-full object-cover"
            src={imageUrl}
            alt={name}
          />
        </div>
      </div>

      {/* Content */}
      <div className={variantConfig.contentPadding}>
        <div className={`text-center ${variantConfig.titleMargin}`}>
          <h4
            className={`font-space-grotesk ${variantConfig.titleSize} mb-1 font-bold text-brand-slate-gray`}
          >
            {name}
          </h4>
          <p
            className={`font-inter text-gray-600 ${variantConfig.textSize} mb-3`}
          >
            {title} at {company}
          </p>

          {/* Topic Badge */}
          <div
            className={`inline-flex items-center gap-1 ${topicConfig.bg} ${topicConfig.border} ${topicConfig.text} font-inter rounded-full px-2.5 py-1 text-xs font-medium`}
          >
            {topicConfig.icon}
            {topic}
          </div>
        </div>

        {/* Bio - Only show for non-compact cards */}
        {!isCompact && bio && (
          <p
            className={`font-inter text-sm leading-relaxed text-gray-700 ${variantConfig.bioMargin} text-center`}
          >
            {bio}
          </p>
        )}

        {/* Social Links */}
        <SocialLinks
          socialLinks={socialLinks}
          iconSize={variantConfig.socialIconSize}
          iconInnerSize={variantConfig.socialIconInner}
        />
      </div>
    </div>
  )
}
