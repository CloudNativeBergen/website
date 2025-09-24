'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export interface CopyOptions {
  timeout?: number
  onSuccess?: (text: string) => void
  onError?: (error: Error) => void
}

export interface UseCopyToClipboardReturn {
  copied: boolean
  copyToClipboard: (text: string) => Promise<void>
}

export function useCopyToClipboard(
  options: CopyOptions = {},
): UseCopyToClipboardReturn {
  const { timeout = 2000, onSuccess, onError } = options
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        if (
          navigator &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === 'function'
        ) {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
          }
          timeoutRef.current = setTimeout(() => {
            setCopied(false)
            timeoutRef.current = null
          }, timeout)
          onSuccess?.(text)
        } else {
          // Fallback for older browsers or non-HTTPS contexts
          const textarea = document.createElement('textarea')
          textarea.value = text
          textarea.style.position = 'fixed' // Prevent scrolling to bottom of page in MS Edge.
          document.body.appendChild(textarea)
          textarea.focus()
          textarea.select()
          const successful = document.execCommand('copy')
          document.body.removeChild(textarea)
          if (successful) {
            setCopied(true)
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current)
            }
            timeoutRef.current = setTimeout(() => {
              setCopied(false)
              timeoutRef.current = null
            }, timeout)
            onSuccess?.(text)
          } else {
            throw new Error('Fallback copy command was unsuccessful')
          }
        }
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to copy to clipboard')
        console.error('Failed to copy to clipboard:', error)
        onError?.(error)
      }
    },
    [timeout, onSuccess, onError],
  )

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return {
    copied,
    copyToClipboard,
  }
}
