'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

/* -------------------------------------------------------------------------- */
/* Bottom sheet                                                               */
/* -------------------------------------------------------------------------- */

export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const titleId = useMemo(
    () => `sheet-${title.replace(/\s+/g, '-').toLowerCase()}`,
    [title],
  )
  const dialogRef = useRef<HTMLDivElement>(null)

  // Escape to close, plus a focus trap and body-scroll lock so this
  // `aria-modal` sheet actually behaves modally: keyboard/screen-reader users
  // can't Tab into the covered background, and the page behind doesn't scroll.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const focusables = (): HTMLElement[] =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    // Move focus into the sheet on open.
    ;(focusables()[0] ?? dialogRef.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const outside = !dialogRef.current?.contains(active)
      if (e.shiftKey && (active === first || outside)) {
        // Wrap backwards to the last element (or pull stray focus back in).
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        // Wrap forwards to the first element; also pull focus back in if it
        // somehow escaped the dialog, so Tab can't advance into the background.
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-xl focus:outline-none dark:bg-gray-900"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2
            id={titleId}
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sheet"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}
