import Link from 'next/link'
import { Speaker } from '@/lib/speaker/types'
import { Reference } from 'sanity'

interface ClickableSpeakerNamesProps {
  speakers: Speaker[] | Reference[]
  className?: string
  linkClassName?: string
  separatorClassName?: string
  /** Show only first names (for compact display) */
  showFirstNameOnly?: boolean
  /** Maximum number of speakers to show before truncating with "& X more" */
  maxVisible?: number
}

/**
 * Component that renders speaker names as individual clickable links
 * Properly handles both Speaker objects and References
 * Supports compact mode with first names only and speaker count limits
 */
export function ClickableSpeakerNames({
  speakers,
  className = '',
  linkClassName = 'hover:underline transition-colors',
  separatorClassName = 'text-gray-500',
  showFirstNameOnly = false,
  maxVisible,
}: ClickableSpeakerNamesProps) {
  if (!speakers || speakers.length === 0) {
    return null
  }

  // Filter out references and only include populated Speaker objects
  const populatedSpeakers = speakers.filter(
    (speaker): speaker is Speaker =>
      speaker &&
      typeof speaker === 'object' &&
      '_id' in speaker &&
      'name' in speaker,
  )

  if (populatedSpeakers.length === 0) {
    return null
  }

  // Determine how many speakers to show
  const speakersToShow = maxVisible
    ? populatedSpeakers.slice(0, maxVisible)
    : populatedSpeakers
  const remainingCount = maxVisible ? populatedSpeakers.length - maxVisible : 0

  // Helper function to get display name
  const getDisplayName = (speaker: Speaker): string => {
    // Always show full name if there's only one speaker, regardless of showFirstNameOnly setting
    if (populatedSpeakers.length === 1) {
      return speaker.name
    }

    if (showFirstNameOnly) {
      return speaker.name.split(' ')[0] || speaker.name
    }
    return speaker.name
  }

  return (
    <span className={className}>
      {speakersToShow.map((speaker, index) => (
        <span key={speaker._id}>
          {speaker.slug ? (
            <Link href={`/speaker/${speaker.slug}`} className={linkClassName}>
              {getDisplayName(speaker)}
            </Link>
          ) : (
            <span>{getDisplayName(speaker)}</span>
          )}
          {index < speakersToShow.length - 1 && (
            <>
              {index === speakersToShow.length - 2 && remainingCount === 0 ? (
                <span className={separatorClassName}> & </span>
              ) : (
                <span className={separatorClassName}>, </span>
              )}
            </>
          )}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className={separatorClassName}>
          {speakersToShow.length > 0 ? ' & ' : ''}
          {remainingCount} more
        </span>
      )}
    </span>
  )
}
