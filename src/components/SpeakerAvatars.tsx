import { UserIcon } from '@heroicons/react/24/outline'
import { sanityImage } from '@/lib/sanity/client'
import { Speaker } from '@/lib/speaker/types'
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

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .avatar-group:hover .avatar-item:nth-child(2) {
            transform: translateX(${size === 'sm' ? '16px' : size === 'md' ? '24px' : '32px'});
          }
          .avatar-group:hover .avatar-item:nth-child(3) {
            transform: translateX(${size === 'sm' ? '24px' : size === 'md' ? '36px' : '48px'});
          }
          .avatar-group:hover .avatar-item:nth-child(4) {
            transform: translateX(${size === 'sm' ? '32px' : size === 'md' ? '48px' : '64px'});
          }
          .avatar-group:hover .avatar-item:nth-child(5) {
            transform: translateX(${size === 'sm' ? '40px' : size === 'md' ? '60px' : '80px'});
          }
        `,
        }}
      />
      <div className="avatar-group flex items-center">
        {visibleSpeakers.map((speaker, index) => (
          <div
            key={speaker._id || index}
            className={`${classes.container} ${
              index > 0 ? classes.spacingCompact : ''
            } avatar-item relative rounded-full border-2 border-white bg-gray-100 shadow-sm transition-transform duration-300 ease-in-out hover:scale-110`}
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
                className={`${classes.image} rounded-full object-cover`}
              />
            ) : (
              <div
                className={`${classes.image} flex items-center justify-center rounded-full bg-gray-200`}
              >
                <UserIcon className={`${classes.icon} text-gray-400`} />
              </div>
            )}
          </div>
        ))}

        {remainingCount > 0 && (
          <div
            className={`${classes.container} ${classes.spacingCompact} avatar-item relative flex items-center justify-center rounded-full border-2 border-white bg-gray-300 shadow-sm transition-transform duration-300 ease-in-out hover:scale-110`}
            style={{
              zIndex: 0,
            }}
            title={showTooltip ? `+${remainingCount} more speakers` : undefined}
          >
            <span className={`${classes.text} font-medium text-gray-600`}>
              +{remainingCount}
            </span>
          </div>
        )}
      </div>
    </>
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

  const visibleSpeakers = populatedSpeakers.slice(0, maxVisible)
  const remainingCount = populatedSpeakers.length - maxVisible

  return (
    <div className="flex items-center space-x-3">
      <SpeakerAvatars
        speakers={speakers}
        size={size}
        maxVisible={maxVisible}
        showTooltip={showTooltip}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {visibleSpeakers.map((speaker) => speaker.name).join(', ')}
          {remainingCount > 0 && ` +${remainingCount} more`}
        </p>
      </div>
    </div>
  )
}
