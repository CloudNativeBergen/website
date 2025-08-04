import { sanityImage } from '@/lib/sanity/client'
import { Speaker } from '@/lib/speaker/types'
import { formatSpeakerNames } from '@/lib/speaker/formatSpeakerNames'
import { Reference } from 'sanity'

// Color palette for letter-based avatars
const avatarColors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
]

// Generate consistent color based on first letter
function getAvatarColor(name: string): string {
  const firstLetter = name.charAt(0).toUpperCase()
  const charCode = firstLetter.charCodeAt(0)
  const colorIndex = charCode % avatarColors.length
  return avatarColors[colorIndex]
}

// Get first letter for avatar
function getAvatarLetter(name: string): string {
  const nameParts = name.trim().split(/\s+/)

  if (nameParts.length >= 2) {
    // First letter of first name + first letter of last name
    return (
      nameParts[0].charAt(0).toUpperCase() +
      nameParts[nameParts.length - 1].charAt(0).toUpperCase()
    )
  } else {
    // If only one name part, use first two letters or just one if name is short
    const singleName = nameParts[0]
    return singleName.length >= 2
      ? singleName.charAt(0).toUpperCase() + singleName.charAt(1).toUpperCase()
      : singleName.charAt(0).toUpperCase()
  }
}

interface SpeakerAvatarsProps {
  speakers: Speaker[] | Reference[]
  size?: 'sm' | 'md' | 'lg'
  maxVisible?: number
  showTooltip?: boolean
}

const sizeClasses = {
  sm: {
    container: 'h-8 w-8',
    image: 'h-8 w-8',
    icon: 'h-4 w-4',
    spacing: '-ml-2',
    spacingCompact: '-ml-4',
    text: 'text-xs',
  },
  md: {
    container: 'h-12 w-12',
    image: 'h-12 w-12',
    icon: 'h-6 w-6',
    spacing: '-ml-3',
    spacingCompact: '-ml-6',
    text: 'text-sm',
  },
  lg: {
    container: 'h-16 w-16',
    image: 'h-16 w-16',
    icon: 'h-8 w-8',
    spacing: '-ml-4',
    spacingCompact: '-ml-8',
    text: 'text-base',
  },
}

// Image dimensions for retina/high DPI screens (2x the display size)
const imageDimensions = {
  sm: { width: 64, height: 64 },
  md: { width: 96, height: 96 },
  lg: { width: 128, height: 128 },
}

/**
 * Component to display multiple speakers with overlapping circular profile images
 */
export function SpeakerAvatars({
  speakers,
  size = 'md',
  maxVisible = 3,
  showTooltip = true,
}: SpeakerAvatarsProps) {
  if (!speakers || speakers.length === 0) {
    return null
  }

  const classes = sizeClasses[size]
  const populatedSpeakers = speakers.filter(
    (speaker): speaker is Speaker =>
      speaker && typeof speaker === 'object' && '_id' in speaker,
  )

  if (populatedSpeakers.length === 0) {
    return null
  }

  const visibleSpeakers = populatedSpeakers.slice(0, maxVisible)
  const remainingCount = populatedSpeakers.length - maxVisible

  // Define spread distances for each size
  const spreadDistances = {
    sm: [16, 24, 32, 40],
    md: [24, 36, 48, 60],
    lg: [32, 48, 64, 80],
  }

  return (
    <div
      className="group flex items-center"
      style={
        {
          '--spread-2': `${spreadDistances[size][0]}px`,
          '--spread-3': `${spreadDistances[size][1]}px`,
          '--spread-4': `${spreadDistances[size][2]}px`,
          '--spread-5': `${spreadDistances[size][3]}px`,
        } as React.CSSProperties
      }
    >
      {visibleSpeakers.map((speaker, index) => {
        // Generate stable key and classes
        const speakerId = speaker._id || `speaker-${index}`
        const isFirstSpeaker = index === 0
        const translateClass =
          index === 1
            ? 'group-hover:translate-x-[var(--spread-2)]'
            : index === 2
              ? 'group-hover:translate-x-[var(--spread-3)]'
              : index === 3
                ? 'group-hover:translate-x-[var(--spread-4)]'
                : index === 4
                  ? 'group-hover:translate-x-[var(--spread-5)]'
                  : ''

        return (
          <div
            key={speakerId}
            className={`${classes.container} ${
              !isFirstSpeaker ? classes.spacingCompact : ''
            } relative overflow-hidden rounded-full border-2 border-gray-200/60 bg-brand-sky-mist shadow-sm transition-transform duration-300 ease-in-out hover:scale-110 ${translateClass}`}
            style={{
              zIndex: visibleSpeakers.length - index,
            }}
            title={showTooltip ? speaker.name : undefined}
          >
            {speaker.image ? (
              <img
                src={sanityImage(speaker.image)
                  .width(imageDimensions[size].width)
                  .height(imageDimensions[size].height)
                  .fit('crop')
                  .url()}
                alt={speaker.name}
                className="absolute inset-0 h-full w-full rounded-full object-cover object-center"
              />
            ) : (
              <div
                className={`absolute inset-0 flex h-full w-full items-center justify-center rounded-full ${getAvatarColor(speaker.name)}`}
              >
                <span className={`${classes.text} font-bold text-white`}>
                  {getAvatarLetter(speaker.name)}
                </span>
              </div>
            )}
          </div>
        )
      })}

      {remainingCount > 0 && (
        <div
          className={`${classes.container} ${classes.spacingCompact} relative flex items-center justify-center rounded-full border-2 border-gray-200/60 bg-brand-cloud-blue/20 shadow-sm transition-transform duration-300 ease-in-out hover:scale-110 ${
            visibleSpeakers.length === 1
              ? 'group-hover:translate-x-[var(--spread-2)]'
              : visibleSpeakers.length === 2
                ? 'group-hover:translate-x-[var(--spread-3)]'
                : visibleSpeakers.length === 3
                  ? 'group-hover:translate-x-[var(--spread-4)]'
                  : 'group-hover:translate-x-[var(--spread-5)]'
          }`}
          style={{
            zIndex: 0,
          }}
          title={
            showTooltip
              ? `${remainingCount} more speaker${remainingCount > 1 ? 's' : ''}`
              : undefined
          }
        >
          <span
            className={`${classes.text} text-brand-cloud-blue-dark font-medium`}
            aria-label={`${remainingCount} more speaker${remainingCount > 1 ? 's' : ''}`}
          >
            +{remainingCount}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Component to display speaker names alongside avatars
 */
export function SpeakerAvatarsWithNames({
  speakers,
  size = 'md',
  maxVisible = 3,
  showTooltip = true,
}: SpeakerAvatarsProps) {
  if (!speakers || speakers.length === 0) {
    return null
  }

  const populatedSpeakers = speakers.filter(
    (speaker): speaker is Speaker =>
      speaker && typeof speaker === 'object' && '_id' in speaker,
  )

  if (populatedSpeakers.length === 0) {
    return null
  }

  return (
    <div className="flex items-center space-x-3">
      <SpeakerAvatars
        speakers={speakers}
        size={size}
        maxVisible={maxVisible}
        showTooltip={showTooltip}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-brand-slate-gray">
          {formatSpeakerNames(populatedSpeakers)}
        </p>
      </div>
    </div>
  )
}
