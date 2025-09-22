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
  debug?: boolean // Enable debug logging
}

export function useEmailModalStorage({
  storageKey,
  isOpen,
  autoSaveDelay = 1000,
  debug = false,
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
      if (debug)
        console.log(`[EmailStorage] Loading data for key: ${storageKey}`)
      try {
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          if (debug) {
            console.log(`[EmailStorage] Raw stored string:`, {
              length: stored.length,
              preview:
                stored.substring(0, 200) + (stored.length > 200 ? '...' : ''),
            })
          }

          const parsedData = JSON.parse(stored) as EmailModalStorageData

          if (debug) {
            console.log(`[EmailStorage] Parsed data:`, {
              subject: parsedData.subject,
              messageType: typeof parsedData.message,
              messageIsArray: Array.isArray(parsedData.message),
              messageLength: Array.isArray(parsedData.message)
                ? parsedData.message.length
                : 'N/A',
              lastModified: new Date(parsedData.lastModified).toISOString(),
              additionalFields: parsedData.additionalFields,
              fullMessage: parsedData.message,
            })
          }

          setStoredData(parsedData)
        } else {
          if (debug)
            console.log(
              `[EmailStorage] No stored data found for key: ${storageKey}`,
            )
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
  }, [isOpen, storageKey, debug])

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

      if (debug)
        console.log(`[EmailStorage] Attempting to save:`, {
          subject,
          messageType: typeof message,
          messageIsArray: Array.isArray(message),
          messageLength: Array.isArray(message)
            ? message.length
            : typeof message === 'string'
              ? message.length
              : 'unknown',
          message: Array.isArray(message) ? message : message,
          additionalFields,
        })

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
        if (debug)
          console.log(`[EmailStorage] Removing empty data from storage`)
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

        const serializedData = JSON.stringify(dataToStore)
        if (debug) {
          console.log(`[EmailStorage] About to save to localStorage:`, {
            storageKey,
            dataToStore,
            serializedData:
              serializedData.substring(0, 500) +
              (serializedData.length > 500 ? '...' : ''),
            serializedLength: serializedData.length,
          })
        }

        localStorage.setItem(storageKey, serializedData)

        if (debug) {
          const readBack = localStorage.getItem(storageKey)
          const parsedBack = readBack ? JSON.parse(readBack) : null
          console.log(
            `[EmailStorage] Verification - read back from localStorage:`,
            {
              readBackLength: readBack?.length,
              parsedBack: parsedBack,
              messageEqual:
                JSON.stringify(parsedBack?.message) === JSON.stringify(message),
            },
          )
        }

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
    [storageKey, debug],
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
  }, [storedData?.lastModified])

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
      // Debug helper to manually check localStorage
      debugStorage: debug
        ? () => {
            if (typeof window !== 'undefined') {
              const stored = localStorage.getItem(storageKey)
              console.log(
                `[EmailStorage] Manual debug for key '${storageKey}':`,
                stored ? JSON.parse(stored) : null,
              )
              return stored ? JSON.parse(stored) : null
            }
            return null
          }
        : undefined,
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
      storageKey,
      debug,
    ],
  )
}
