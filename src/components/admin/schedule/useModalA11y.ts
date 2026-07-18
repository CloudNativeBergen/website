'use client'

import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog a11y behaviour shared by the schedule editor's overlays
 * (AddTrackModal, ServiceSessionModal, mobile/BottomSheet):
 *
 * - moves focus INTO the dialog on open — preferring an `autofocus` element so
 *   the initial focus isn't stolen from an input by whatever happens to be the
 *   first focusable (e.g. a header Close button) — and restores focus to the
 *   previously focused element on close/unmount;
 * - Escape closes;
 * - Tab is trapped in both directions (wraps, and pulls stray focus back in);
 * - body scroll is locked while open.
 *
 * The caller renders the dialog element itself (with `role="dialog"`,
 * `aria-modal="true"` and `aria-labelledby`) and passes its ref here. Only call
 * this from a component that is mounted exclusively while the dialog is open.
 */
export function useModalA11y(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const focusables = (): HTMLElement[] =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      )

    // Move focus into the dialog on open. Prefer the caller's `autoFocus`
    // element; if focus already landed inside the dialog (React can apply
    // `autoFocus` before this effect runs), leave it alone; else fall back to
    // the first focusable.
    const autoFocusTarget =
      dialogRef.current?.querySelector<HTMLElement>('[autofocus]')
    if (autoFocusTarget) {
      autoFocusTarget.focus()
    } else if (!dialogRef.current?.contains(document.activeElement)) {
      ;(focusables()[0] ?? dialogRef.current)?.focus()
    }

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
  }, [dialogRef, onClose])
}
