import React from 'react'
import { BookmarkIcon } from '@heroicons/react/24/outline'
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid'
import { useBookmarks, BookmarkedTalk } from '@/hooks/useBookmarks'
import clsx from 'clsx'

interface BookmarkButtonProps {
  talk: BookmarkedTalk
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function BookmarkButton({
  talk,
  size = 'md',
  className = '',
}: BookmarkButtonProps) {
  const { isBookmarked, toggleBookmark, isLoaded } = useBookmarks()

  const isBookmarkedTalk = isLoaded && isBookmarked(talk.talkId)

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  }

  const buttonSizeClasses = {
    sm: 'p-1',
    md: 'p-1.5',
    lg: 'p-2',
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggleBookmark(talk)
  }

  if (!isLoaded) {
    return (
      <div
        className={clsx(
          'flex items-center justify-center rounded-full bg-gray-100',
          buttonSizeClasses[size],
          className,
        )}
      >
        <div
          className={clsx(
            'animate-pulse rounded bg-gray-300',
            sizeClasses[size],
          )}
        />
      </div>
    )
  }

  return (
    <button
      onClick={handleClick}
      className={clsx(
        'flex items-center justify-center rounded-full transition-all duration-200',
        'hover:scale-110 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-1 focus:outline-none',
        isBookmarkedTalk
          ? 'bg-brand-cloud-blue text-white hover:bg-brand-cloud-blue/90'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-brand-cloud-blue',
        buttonSizeClasses[size],
        className,
      )}
      title={isBookmarkedTalk ? 'Remove from agenda' : 'Add to agenda'}
      aria-label={isBookmarkedTalk ? 'Remove from agenda' : 'Add to agenda'}
    >
      {isBookmarkedTalk ? (
        <BookmarkSolidIcon className={sizeClasses[size]} />
      ) : (
        <BookmarkIcon className={sizeClasses[size]} />
      )}
    </button>
  )
}
