'use client'

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react'

const BOOKMARKS_STORAGE_KEY = 'conference-bookmarks'

export interface BookmarkedTalk {
  talkId: string
  title: string
  startTime: string
  endTime: string
  scheduleDate: string
  trackTitle: string
  speakers?: string[]
}

interface BookmarksContextType {
  bookmarks: BookmarkedTalk[]
  isBookmarked: (talkId: string) => boolean
  addBookmark: (talk: BookmarkedTalk) => void
  removeBookmark: (talkId: string) => void
  toggleBookmark: (talk: BookmarkedTalk) => void
  clearAllBookmarks: () => void
  isLoaded: boolean
}

const BookmarksContext = createContext<BookmarksContextType | undefined>(
  undefined,
)

interface BookmarksProviderProps {
  children: ReactNode
}

export function BookmarksProvider({ children }: BookmarksProviderProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkedTalk[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY)
        if (stored) {
          setBookmarks(JSON.parse(stored))
        }
      } catch (error) {
        // Silently handle localStorage errors
      } finally {
        setIsLoaded(true)
      }
    }
  }, [])

  // Save bookmarks to localStorage whenever they change
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      try {
        localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks))
      } catch (error) {
        // Silently handle localStorage errors
      }
    }
  }, [bookmarks, isLoaded])

  const isBookmarked = (talkId: string): boolean => {
    return bookmarks.some((bookmark) => bookmark.talkId === talkId)
  }

  const addBookmark = (talk: BookmarkedTalk) => {
    setBookmarks((prev) => {
      if (prev.some((bookmark) => bookmark.talkId === talk.talkId)) {
        return prev // Already bookmarked
      }
      return [...prev, talk]
    })
  }

  const removeBookmark = (talkId: string) => {
    setBookmarks((prev) =>
      prev.filter((bookmark) => bookmark.talkId !== talkId),
    )
  }

  const toggleBookmark = (talk: BookmarkedTalk) => {
    if (isBookmarked(talk.talkId)) {
      removeBookmark(talk.talkId)
    } else {
      addBookmark(talk)
    }
  }

  const clearAllBookmarks = () => {
    setBookmarks([])
  }

  const value: BookmarksContextType = {
    bookmarks,
    isBookmarked,
    addBookmark,
    removeBookmark,
    toggleBookmark,
    clearAllBookmarks,
    isLoaded,
  }

  return (
    <BookmarksContext.Provider value={value}>
      {children}
    </BookmarksContext.Provider>
  )
}

export function useBookmarks(): BookmarksContextType {
  const context = useContext(BookmarksContext)
  if (!context) {
    throw new Error('useBookmarks must be used within a BookmarksProvider')
  }
  return context
}
