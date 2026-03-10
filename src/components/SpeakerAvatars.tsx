import { Speaker } from '@/lib/speaker/types'
import { formatSpeakerNames } from '@/lib/speaker/formatSpeakerNames'
import { MissingAvatar } from '@/components/common/MissingAvatar'
import { Reference } from 'sanity'

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

const imageDimensions = {
  sm: { width: 64, height: 64 },
  md: { width: 96, height: 96 },
  lg: { width: 128, height: 128 },
}

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
                src={speaker.image}
                alt={speaker.name}
                className="absolute inset-0 h-full w-full rounded-full object-cover object-center"
              />
            ) : (
              <MissingAvatar
                name={speaker.name}
                size={imageDimensions[size].width / 2}
                className="absolute inset-0 rounded-full"
                textSizeClass={classes.text}
              />
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
