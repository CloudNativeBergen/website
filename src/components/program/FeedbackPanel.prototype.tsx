'use client'

/**
 * PROTOTYPE — throwaway, never merge to main (branch
 * `prototype/programme-feedback-drawer`).
 *
 * Question: should the programme's "Give feedback" link (#1472) open the
 * attendee feedback UI in place — a bottom sheet, a side drawer or a centred
 * modal — instead of navigating to `/program/<talkId>/feedback` → `/f/<code>`?
 *
 * Three variants on the real `ProgramListView`, switchable from the floating
 * bar at the bottom (or ← / →). The panel body is the real
 * `AttendeeFeedbackPage` with stub actions; nothing is sent anywhere.
 */

import { useEffect, useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { AttendeeFeedbackPage } from '@/components/feedback'
import type { AttendeeFeedbackState } from '@/lib/feedback/server'

export const VARIANTS = {
  A: 'Bottom sheet',
  B: 'Side drawer',
  C: 'Centred modal',
} as const
export type Variant = keyof typeof VARIANTS
const KEYS = Object.keys(VARIANTS) as Variant[]

export function ProgrammeWithFeedbackPanel({
  initialVariant,
  pages,
  children,
}: {
  initialVariant: Variant
  /** The state `/f/<code>` would resolve to, per talk id. */
  pages: Record<string, AttendeeFeedbackState>
  children: ReactNode
}) {
  const [variant, setVariant] = useState<Variant>(initialVariant)
  const [talkId, setTalkId] = useState<string | null>(null)
  const page = talkId ? pages[talkId] : undefined

  return (
    <>
      {/* Hijack the real TalkCard link instead of editing it. */}
      <div
        onClickCapture={(event) => {
          const link = (event.target as HTMLElement).closest('a')
          const match = link
            ?.getAttribute('href')
            ?.match(/^\/program\/([^/]+)\/feedback$/)
          if (!match) return
          event.preventDefault()
          setTalkId(decodeURIComponent(match[1]))
        }}
      >
        {children}
      </div>

      <Shell
        variant={variant}
        open={page !== undefined}
        onClose={() => setTalkId(null)}
      >
        {page && (
          // `min-h-dvh` makes sense for a page, not a panel.
          <div className="[&_main]:pt-2 [&_main]:pb-6 [&>div]:min-h-0 [&>div]:bg-transparent">
            <AttendeeFeedbackPage
              key={talkId}
              logo={null}
              page={page}
              submit={async (colour, comment) => {
                await new Promise((r) => setTimeout(r, 400))
                return {
                  state: 'answered',
                  colour,
                  comment: comment?.trim() || null,
                  talk: 'talk' in page ? page.talk : null,
                }
              }}
              remove={async () => ({ deleted: true, page })}
            />
          </div>
        )}
      </Shell>

      <Switcher variant={variant} onChange={setVariant} />
    </>
  )
}

function Shell({
  variant,
  open,
  onClose,
  children,
}: {
  variant: Variant
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const header = (
    <div className="flex shrink-0 items-center justify-between px-4 pt-3">
      <DialogTitle className="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        Session feedback
      </DialogTitle>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="-mr-2 flex size-11 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <XMarkIcon className="size-6" aria-hidden="true" />
      </button>
    </div>
  )

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/40 transition duration-300 data-closed:opacity-0"
      />

      {variant === 'A' && (
        <div className="fixed inset-x-0 bottom-0 flex justify-center">
          <DialogPanel
            transition
            className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl transition duration-300 ease-out data-closed:translate-y-full dark:bg-gray-950"
          >
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
            {header}
            <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              {children}
            </div>
          </DialogPanel>
        </div>
      )}

      {variant === 'B' && (
        <div className="fixed inset-y-0 right-0 flex w-full sm:max-w-md">
          <DialogPanel
            transition
            className="flex w-full flex-col bg-white shadow-2xl transition duration-300 ease-out data-closed:translate-x-full dark:bg-gray-950"
          >
            {header}
            <div className="overflow-y-auto">{children}</div>
          </DialogPanel>
        </div>
      )}

      {variant === 'C' && (
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel
            transition
            className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-md flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0 dark:bg-gray-950 dark:ring-white/10"
          >
            {header}
            <div className="overflow-y-auto">{children}</div>
          </DialogPanel>
        </div>
      )}
    </Dialog>
  )
}

/** Prototype chrome, deliberately not on-brand. */
function Switcher({
  variant,
  onChange,
}: {
  variant: Variant
  onChange: (variant: Variant) => void
}) {
  const step = (delta: number) =>
    onChange(KEYS[(KEYS.indexOf(variant) + delta + KEYS.length) % KEYS.length])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable]')) return
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-700 px-1 py-1 text-sm font-semibold text-white shadow-lg ring-2 ring-white">
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Previous variant"
        className="rounded-full p-1.5 hover:bg-white/20"
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="px-2 whitespace-nowrap">
        {variant} ({VARIANTS[variant]})
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Next variant"
        className="rounded-full p-1.5 hover:bg-white/20"
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  )
}
