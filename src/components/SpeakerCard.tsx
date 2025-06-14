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

const gradientClasses = {
  brand: 'bg-brand-gradient',
  'blue-purple': 'bg-gradient-to-br from-brand-cloud-blue to-brand-tech-purple',
  'green-yellow':
    'bg-gradient-to-br from-brand-fresh-green to-brand-sunbeam-yellow',
}

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
}

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

export function SpeakerCard({ speaker, options = {} }: SpeakerCardProps) {
  // Extract values from speaker object with fallbacks
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

  // Generate unique seed from speaker name for consistent pattern
  // Use a better hash function to ensure more varied seeds
  // const patternSeed = Math.abs(name.split('').reduce((acc, char, index) => {
  //   // Use position-dependent multipliers and different base to create more variance
  //   return acc + char.charCodeAt(0) * (index + 1) * 31 + index * 97
  // }, name.length * 1337)) % 1000000 // Start with name length multiplied by a prime, bound to reasonable range

  // Parse social links from speaker.links array or use provided socialLinks
  const socialLinks =
    speaker.socialLinks || parseSocialLinks(speaker.links || [])

  // Size variants - keynote, compact, or normal
  const shadowClass = isKeynote
    ? 'shadow-xl'
    : isCompact
      ? 'shadow-md'
      : 'shadow-lg'
  const cardSizeClass = isKeynote
    ? 'max-w-sm mx-auto'
    : isCompact
      ? compactFillContainer
        ? 'w-full'
        : 'max-w-xs mx-auto'
      : 'max-w-sm'
  const headerPadding = isKeynote
    ? 'p-6 pb-16'
    : isCompact
      ? 'p-4 pb-10'
      : 'p-6 pb-14'
  const avatarSize = isKeynote
    ? 'w-36 h-36'
    : isCompact
      ? 'w-20 h-20'
      : 'w-32 h-32'
  const avatarMargin = isKeynote ? '-mt-18' : isCompact ? '-mt-10' : '-mt-16'
  const titleSize = isKeynote ? 'text-xl' : isCompact ? 'text-base' : 'text-lg'
  const contentPadding = isKeynote
    ? 'pt-8 px-6 pb-6'
    : isCompact
      ? 'pt-4 px-4 pb-4'
      : 'pt-6 px-5 pb-5'
  const socialIconSize = isKeynote
    ? 'w-12 h-12'
    : isCompact
      ? 'w-8 h-8'
      : 'w-10 h-10'
  const socialIconInner = isKeynote
    ? 'w-7 h-7'
    : isCompact
      ? 'w-5 h-5'
      : 'w-6 h-6'
  const bioMargin = isCompact ? 'mb-4' : 'mb-6'
  const titleMargin = isCompact ? 'mb-4' : 'mb-6'

  const topicConfig = topicVariants[topicVariant]

  return (
    <div
      className={`rounded-3xl bg-white ${shadowClass} group overflow-hidden border border-gray-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${cardSizeClass}`}
    >
      {/* Header with Pattern Background */}
      <div
        className={`relative ${gradientClasses[gradient]} ${headerPadding} overflow-hidden`}
      >
        <CloudNativePattern
          className="z-0"
          opacity={0.2}
          animated={false}
          variant="light"
          baseSize={isKeynote ? 30 : !isCompact ? 25 : 15}
          iconCount={isKeynote ? 25 : 20}
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
      <div className={`relative ${avatarMargin} z-20 flex justify-center`}>
        <div className={`${avatarSize} rounded-full bg-white p-2 shadow-xl`}>
          <img
            className="h-full w-full rounded-full object-cover"
            src={imageUrl}
            alt={name}
          />
        </div>
      </div>

      {/* Content */}
      <div className={contentPadding}>
        <div className={`text-center ${titleMargin}`}>
          <h4
            className={`font-space-grotesk ${titleSize} mb-1 font-bold text-brand-slate-gray`}
          >
            {name}
          </h4>
          <p
            className={`font-inter text-gray-600 ${isCompact ? 'text-xs' : 'text-sm'} mb-3`}
          >
            {title} at {company}
          </p>

          {/* Topic Badge */}
          <div
            className={`inline-flex items-center gap-1 ${topicConfig.bg} ${topicConfig.border} ${topicConfig.text} font-inter ${isCompact ? 'text-xs' : 'text-xs'} rounded-full px-2.5 py-1 font-medium`}
          >
            {topicConfig.icon}
            {topic}
          </div>
        </div>

        {/* Bio - Only show for non-compact cards */}
        {!isCompact && (
          <p
            className={`font-inter text-sm leading-relaxed text-gray-700 ${bioMargin} text-center`}
          >
            {bio}
          </p>
        )}

        {/* Social Links */}
        <div className="flex items-center justify-center gap-4">
          {socialLinks.linkedin && (
            <a
              href={socialLinks.linkedin}
              className={`flex items-center justify-center ${socialIconSize} rounded-full bg-gray-50 text-gray-600 transition-all duration-200 hover:scale-110 hover:bg-brand-cloud-blue hover:text-white`}
              aria-label="LinkedIn"
            >
              <LinkedInIcon className={socialIconInner} />
            </a>
          )}

          {socialLinks.bluesky && (
            <a
              href={socialLinks.bluesky}
              className={`flex items-center justify-center ${socialIconSize} rounded-full bg-gray-50 text-gray-600 transition-all duration-200 hover:scale-110 hover:bg-brand-cloud-blue hover:text-white`}
              aria-label="Bluesky"
            >
              <BlueskyIcon className={socialIconInner} />
            </a>
          )}

          {socialLinks.github && (
            <a
              href={socialLinks.github}
              className={`flex items-center justify-center ${socialIconSize} rounded-full bg-gray-50 text-gray-600 transition-all duration-200 hover:scale-110 hover:bg-brand-cloud-blue hover:text-white`}
              aria-label="GitHub"
            >
              <GitHubIcon className={socialIconInner} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
