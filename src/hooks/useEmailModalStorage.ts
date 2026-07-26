'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { PortableTextBlock } from '@portabletext/editor'

export interface EmailModalStorageData {
  subject: string
  message: string | PortableTextBlock[]
  lastModified: number
  additionalFields?: Record<string, string | number | boolean>
}

export interface UseEmailModalStorageProps {
  storageKey: string
  isOpen: boolean
  autoSaveDelay?: number
}

export function useEmailModalStorage({
  storageKey,
  isOpen,
  autoSaveDelay = 1000,
}: UseEmailModalStorageProps) {
  const [storedData, setStoredData] = useState<EmailModalStorageData | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const savingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          const parsedData = JSON.parse(stored) as EmailModalStorageData

          // eslint-disable-next-line react-hooks/set-state-in-effect
          setStoredData(parsedData)
        }
      } catch (error) {
        console.warn(
          `Failed to load email modal data from localStorage:`,
          error,
        )
      } finally {
        setIsLoading(false)
      }
    } else if (!isOpen) {
      setIsLoading(true)
    }
  }, [isOpen, storageKey])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (savingTimeoutRef.current) {
        clearTimeout(savingTimeoutRef.current)
      }
    }
  }, [])

  const saveToStorage = useCallback(
    (
      subject: string,
      message: string | PortableTextBlock[],
      additionalFields?: Record<string, string | number | boolean>,
    ) => {
      if (typeof window === 'undefined') return

      const hasContent =
        subject.trim() ||
        (typeof message === 'string'
          ? message.trim()
          : message.length > 0 &&
            message.some((block) => {
              if (block._type === 'block' && Array.isArray(block.children)) {
                return block.children.some(
                  (child: { text?: string }) => child.text && child.text.trim(),
                )
              }
              return false
            }))

      if (!hasContent && !additionalFields) {
        localStorage.removeItem(storageKey)
        setStoredData(null)
        setIsSaving(false)
        setLastSaved(null)
        return
      }

      try {
        const dataToStore: EmailModalStorageData = {
          subject,
          message,
          lastModified: Date.now(),
          ...(additionalFields && { additionalFields }),
        }

        localStorage.setItem(storageKey, JSON.stringify(dataToStore))

        setStoredData(dataToStore)
        setLastSaved(Date.now())
        setIsSaving(false)

        if (savingTimeoutRef.current) {
          clearTimeout(savingTimeoutRef.current)
        }
        savingTimeoutRef.current = setTimeout(() => {
          setLastSaved(null)
        }, 2000)
      } catch (error) {
        console.warn(`Failed to save email modal data to localStorage:`, error)
        setIsSaving(false)
      }
    },
    [storageKey],
  )

  const autoSave = useCallback(
    (
      subject: string,
      message: string | PortableTextBlock[],
      additionalFields?: Record<string, string | number | boolean>,
    ) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      setIsSaving(true)
      setLastSaved(null)

      timeoutRef.current = setTimeout(() => {
        saveToStorage(subject, message, additionalFields)
      }, autoSaveDelay)
    },
    [saveToStorage, autoSaveDelay],
  )

  const clearStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey)
      setStoredData(null)
      setIsSaving(false)
      setLastSaved(null)

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (savingTimeoutRef.current) {
        clearTimeout(savingTimeoutRef.current)
        savingTimeoutRef.current = null
      }
    }
  }, [storageKey])

  const getLastModifiedText = useCallback(() => {
    if (!storedData?.lastModified) return null

    const now = Date.now()
    const diff = now - storedData.lastModified
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    return `${days} day${days > 1 ? 's' : ''} ago`
  }, [storedData])

  return useMemo(
    () => ({
      storedData,
      isLoading,
      isSaving,
      lastSaved,
      autoSave,
      saveToStorage,
      clearStorage,
      getLastModifiedText,
      hasStoredData: !!storedData,
    }),
    [
      storedData,
      isLoading,
      isSaving,
      lastSaved,
      autoSave,
      saveToStorage,
      clearStorage,
      getLastModifiedText,
    ],
  )
}
