'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export interface CopyOptions {
  timeout?: number
  onSuccess?: (text: string) => void
  onError?: (error: Error) => void
}

export interface UseCopyToClipboardReturn {
  copied: boolean
  /** The last copy did not reach the clipboard. Cleared by the next copy. */
  failed: boolean
  /**
   * Copy `text`. A PENDING text (a promise) is for a copy that has to ask a
   * server first: see the note on the write below.
   */
  copyToClipboard: (text: string | Promise<string>) => Promise<void>
  /** Forget the outcome of the last copy. */
  reset: () => void
}

/** Copy through a hidden textarea: older browsers and non-HTTPS contexts. */
function copyWithoutClipboardApi(text: string): void {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed' // Prevent scrolling to bottom of page in MS Edge.
  document.body.appendChild(textarea)
  try {
    textarea.focus()
    textarea.select()
    if (!document.execCommand('copy')) {
      throw new Error('Fallback copy command was unsuccessful')
    }
  } finally {
    // Also when the command throws: nothing is left on the page.
    document.body.removeChild(textarea)
  }
}

export function useCopyToClipboard(
  options: CopyOptions = {},
): UseCopyToClipboardReturn {
  const { timeout = 2000, onSuccess, onError } = options
  const [copied, setCopied] = useState(false)
  // Beside `copied`, not in its place: for the callers that only read
  // `copied`, a later failed copy changes nothing about it, as before.
  const [failed, setFailed] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const reset = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    setCopied(false)
    setFailed(false)
  }, [])

  const copyToClipboard = useCallback(
    async (text: string | Promise<string>) => {
      try {
        const clipboard =
          typeof navigator !== 'undefined' ? navigator.clipboard : undefined
        let written = false
        if (
          typeof text !== 'string' &&
          clipboard &&
          typeof clipboard.write === 'function' &&
          typeof ClipboardItem !== 'undefined'
        ) {
          // WRITTEN INSIDE THE CLICK: a `ClipboardItem` takes the pending
          // text, so the write is made now and filled in when the text
          // arrives. Safari refuses a write that comes after an awaited
          // request.
          try {
            const blob = text.then(
              (value) => new Blob([value], { type: 'text/plain' }),
            )
            // A text that never arrives is reported once, where it is awaited
            // below. A browser that refuses the write never reads `blob`,
            // which would otherwise be left as an unhandled rejection.
            blob.catch(() => {})
            await clipboard.write([new ClipboardItem({ 'text/plain': blob })])
            written = true
          } catch {
            // Refused, or this browser's ClipboardItem takes no pending text:
            // a plain write below, once the text is there.
          }
        }
        // A STRING IS NOT AWAITED: for it the write below is made in the same
        // turn as the call, as it always was.
        const value = typeof text === 'string' ? text : await text
        if (!written) {
          if (clipboard && typeof clipboard.writeText === 'function') {
            await clipboard.writeText(value)
          } else {
            copyWithoutClipboardApi(value)
          }
        }
        setCopied(true)
        setFailed(false)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => {
          setCopied(false)
          timeoutRef.current = null
        }, timeout)
        onSuccess?.(value)
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to copy to clipboard')
        console.error('Failed to copy to clipboard:', error)
        setFailed(true)
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

  return { copied, failed, copyToClipboard, reset }
}
