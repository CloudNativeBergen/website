'use client'

import React, { useMemo, useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useModalA11y } from '../useModalA11y'

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
  // Initial focus prefers an `autoFocus` input over the first focusable (the
  // header Close button), so typing sheets open ready to type.
  useModalA11y(dialogRef, onClose)

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
