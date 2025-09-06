import React, { useMemo, useCallback } from 'react'
import { BookmarkIcon } from '@heroicons/react/24/outline'
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid'
import { useBookmarks, BookmarkedTalk } from '@/contexts/BookmarksContext'
import clsx from 'clsx'

interface BookmarkButtonProps {
  talk: BookmarkedTalk
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
} as const

const buttonSizeClasses = {
  sm: 'p-1',
  md: 'p-1.5',
  lg: 'p-2',
} as const

export const BookmarkButton = React.memo<BookmarkButtonProps>(
  function BookmarkButton({ talk, size = 'md', className = '' }) {
    const { isBookmarked, toggleBookmark, isLoaded } = useBookmarks()

    const isBookmarkedTalk = useMemo(
      () => isLoaded && isBookmarked(talk.talkId),
      [isLoaded, isBookmarked, talk.talkId],
    )

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        toggleBookmark(talk)
      },
      [toggleBookmark, talk],
    )

    const loadingElement = useMemo(
      () => (
        <div
          className={clsx(
            'flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700',
            buttonSizeClasses[size],
            className,
          )}
        >
          <div
            className={clsx(
              'animate-pulse rounded bg-gray-300 dark:bg-gray-600',
              sizeClasses[size],
            )}
          />
        </div>
      ),
      [size, className],
    )

    if (!isLoaded) {
      return loadingElement
    }

    return (
      <button
        onClick={handleClick}
        className={clsx(
          'flex items-center justify-center rounded-full transition-all duration-200',
          'hover:scale-110 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-1 focus:outline-none dark:focus:ring-offset-gray-800',
          isBookmarkedTalk
            ? 'bg-brand-cloud-blue text-white shadow-md hover:bg-brand-cloud-blue/90 dark:bg-brand-cloud-blue dark:hover:bg-brand-cloud-blue/80'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-brand-cloud-blue dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-blue-400',
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
  },
)
