'use client'

import { useState, useEffect } from 'react'

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

export function useBookmarks() {
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
        console.error('Failed to load bookmarks from localStorage:', error)
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
        return prev // Already bookmarked
      }
      const newBookmarks = [...prev, talk]
      return newBookmarks
    })
  }

  const removeBookmark = (talkId: string) => {
    setBookmarks((prev) => {
      const newBookmarks = prev.filter((bookmark) => bookmark.talkId !== talkId)
      return newBookmarks
    })
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

  return {
    bookmarks,
    isBookmarked,
    addBookmark,
    removeBookmark,
    toggleBookmark,
    clearAllBookmarks,
    isLoaded,
  }
}
