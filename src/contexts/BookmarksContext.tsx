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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY)
        if (stored) {
          setBookmarks(JSON.parse(stored))
        }
      } catch (error) {
        console.error('Failed to load bookmarks from localStorage:', error)
      } finally {
        setIsLoaded(true)
      }
    }
  }, [])

  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      try {
        localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks))
      } catch (error) {
        console.error('Failed to save bookmarks to localStorage:', error)
      }
    }
  }, [bookmarks, isLoaded])

  const isBookmarked = (talkId: string): boolean => {
    return bookmarks.some((bookmark) => bookmark.talkId === talkId)
  }

  const addBookmark = (talk: BookmarkedTalk) => {
    setBookmarks((prev) => {
      if (prev.some((bookmark) => bookmark.talkId === talk.talkId)) {
        return prev
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
