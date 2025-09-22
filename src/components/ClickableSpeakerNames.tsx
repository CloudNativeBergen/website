import Link from 'next/link'
import { Speaker } from '@/lib/speaker/types'
import { Reference } from 'sanity'

interface ClickableSpeakerNamesProps {
  speakers: Speaker[] | Reference[]
  className?: string
  linkClassName?: string
  separatorClassName?: string

  showFirstNameOnly?: boolean

  maxVisible?: number
}

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

  const speakersToShow = maxVisible
    ? populatedSpeakers.slice(0, maxVisible)
    : populatedSpeakers
  const remainingCount = maxVisible ? populatedSpeakers.length - maxVisible : 0

  const getDisplayName = (speaker: Speaker): string => {
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
