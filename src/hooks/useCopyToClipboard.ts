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
  const [outcome, setOutcome] = useState<'copied' | 'failed' | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const reset = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    setOutcome(null)
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
            await clipboard.write([
              new ClipboardItem({
                'text/plain': text.then(
                  (value) => new Blob([value], { type: 'text/plain' }),
                ),
              }),
            ])
            written = true
          } catch {
            // Refused, or this browser's ClipboardItem takes no pending text:
            // a plain write below, once the text is there.
          }
        }
        const value = await text
        if (!written) {
          if (clipboard && typeof clipboard.writeText === 'function') {
            await clipboard.writeText(value)
          } else {
            copyWithoutClipboardApi(value)
          }
        }
        setOutcome('copied')
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => {
          setOutcome(null)
          timeoutRef.current = null
        }, timeout)
        onSuccess?.(value)
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to copy to clipboard')
        console.error('Failed to copy to clipboard:', error)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = null
        setOutcome('failed')
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
    copied: outcome === 'copied',
    failed: outcome === 'failed',
    copyToClipboard,
    reset,
  }
}
