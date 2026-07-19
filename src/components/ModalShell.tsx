'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useTheme } from 'next-themes'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'

interface ModalShellProps {
  isOpen: boolean
  onClose: () => void
  size?: ModalSize
  children: React.ReactNode
  /** Extra classes applied to the DialogPanel */
  className?: string
  /** Whether to include default padding (p-6). Set to false for modals with custom section padding. */
  padded?: boolean
  /**
   * Optional standard "house" header title. When provided, ModalShell renders a
   * shared header row (icon slot + title + subtitle + a single 44×44 close
   * button) with the title wired to the dialog's `aria-labelledby` via
   * HeadlessUI's `DialogTitle`. When omitted, no header is injected and
   * consumers keep rendering their own — zero visual change for existing callers.
   */
  title?: React.ReactNode
  /** Optional supporting line under the title (only rendered with `title`). */
  subtitle?: React.ReactNode
  /**
   * Accessible name for the dialog when no standard `title` header is used
   * (e.g. a viewer with a custom toolbar). Applied as `aria-label` on the
   * DialogPanel so the dialog always has a name. Ignored when `title` is set —
   * `title` already wires `aria-labelledby` via `DialogTitle`.
   */
  ariaLabel?: string
  /** Optional leading icon for the standard header (only rendered with `title`). */
  icon?: React.ReactNode
  /**
   * Presentation mode. `'sheet'` (default) renders a bottom sheet below the `sm`
   * breakpoint (rounded top, ≤85dvh, internally scrollable, safe-area padded)
   * and the centered card on `sm+`. `'centered'` forces the centered card at all
   * sizes (today's behaviour) — an opt-out for edge cases.
   */
  presentation?: 'sheet' | 'centered'
  /**
   * When both this and {@link ModalShellProps.isDirty} are true, a
   * backdrop-click / Escape / header-close first shows an in-dialog
   * "Discard unsaved changes?" confirm instead of closing immediately.
   */
  confirmOnDirtyClose?: boolean
  /** Whether the modal currently holds unsaved changes (guards the close). */
  isDirty?: boolean
}

// Centered card widths (apply at all sizes).
const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
}

// Sheet widths: the max-width only kicks in at `sm+`, so the sheet spans the
// full viewport width on mobile. Written as literal `sm:` classes so Tailwind's
// scanner can see them (a computed `sm:${...}` would never be generated).
const sheetSizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
}

export function ModalShell({
  isOpen,
  onClose,
  size = 'md',
  children,
  className = '',
  padded = true,
  title,
  subtitle,
  icon,
  ariaLabel,
  presentation = 'sheet',
  confirmOnDirtyClose = false,
  isDirty = false,
}: ModalShellProps) {
  const { theme } = useTheme()
  const [confirmingClose, setConfirmingClose] = useState(false)

  // Clear the dirty-close confirm once the modal is fully closed so it never
  // flashes on the next open. Adjusting state during render (the React-blessed
  // "reset on prop change" pattern) instead of an effect avoids a wasted commit.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (!isOpen && confirmingClose) setConfirmingClose(false)
  }

  const guardActive = confirmOnDirtyClose && isDirty

  // Routed through by the backdrop, Escape (HeadlessUI `onClose`) and the header
  // close button. While the guard is armed the first attempt reveals the confirm
  // and subsequent attempts are no-ops, so nothing is discarded without a choice.
  const handleClose = () => {
    if (guardActive) {
      if (!confirmingClose) setConfirmingClose(true)
      return
    }
    onClose()
  }

  const discardAndClose = () => {
    setConfirmingClose(false)
    onClose()
  }

  const isSheet = presentation === 'sheet'
  const roundingClass = isSheet ? 'rounded-t-2xl sm:rounded-2xl' : 'rounded-2xl'
  const widthClass = isSheet ? sheetSizeClasses[size] : sizeClasses[size]

  return (
    <Transition appear show={isOpen}>
      <Dialog
        as="div"
        aria-label={title ? undefined : ariaLabel}
        className={`relative z-50 ${theme === 'dark' ? 'dark' : ''}`}
        onClose={handleClose}
      >
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div
            className={`flex min-h-full justify-center ${
              isSheet
                ? 'items-end p-0 sm:items-center sm:p-4'
                : 'items-center p-4'
            }`}
          >
            <TransitionChild
              enter="ease-out duration-300"
              enterFrom={
                isSheet
                  ? 'opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'
                  : 'opacity-0 scale-95'
              }
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo={
                isSheet
                  ? 'opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'
                  : 'opacity-0 scale-95'
              }
            >
              <DialogPanel
                className={`relative flex w-full ${widthClass} flex-col bg-white shadow-2xl dark:bg-gray-900 ${roundingClass} ${
                  isSheet ? 'max-h-[85dvh] sm:max-h-none' : ''
                } ${className}`}
              >
                {title ? (
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                    <div className="flex min-w-0 items-start gap-2.5">
                      {icon ? (
                        <span
                          className="mt-0.5 shrink-0 text-brand-cloud-blue dark:text-blue-400"
                          aria-hidden="true"
                        >
                          {icon}
                        </span>
                      ) : null}
                      <div className="min-w-0">
                        <DialogTitle className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white">
                          {title}
                        </DialogTitle>
                        {subtitle ? (
                          <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                            {subtitle}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClose}
                      aria-label="Close dialog"
                      className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                ) : null}

                <div
                  className={`${padded ? 'p-6' : ''} ${
                    isSheet
                      ? `flex-1 overflow-y-auto overscroll-contain sm:overflow-visible ${
                          padded
                            ? 'pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6'
                            : ''
                        }`
                      : ''
                  }`}
                >
                  {children}
                </div>

                {guardActive && confirmingClose ? (
                  <div
                    className={`absolute inset-0 z-10 flex items-end justify-center bg-gray-900/40 p-4 sm:items-center ${roundingClass}`}
                  >
                    <div
                      role="alertdialog"
                      aria-label="Discard unsaved changes?"
                      className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800"
                    >
                      <p className="font-space-grotesk text-sm font-semibold text-gray-900 dark:text-white">
                        Discard unsaved changes?
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Your changes haven&apos;t been saved yet.
                      </p>
                      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setConfirmingClose(false)}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Keep editing
                        </button>
                        <button
                          type="button"
                          onClick={discardAndClose}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
