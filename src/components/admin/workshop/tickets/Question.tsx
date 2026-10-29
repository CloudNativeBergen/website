import type { ReactNode } from 'react'
import { quoteNames } from './names'

/** The prominent button of a question: always the choice that changes least. */
export const SAFE_CHOICE =
  'min-h-11 rounded-md bg-blue-600 px-3 py-2 text-left text-sm font-medium text-white hover:bg-blue-500'
/** A choice that takes access away from somebody, or may. Never the prominent one. */
export const OTHER_CHOICE =
  'min-h-11 rounded-md bg-white px-3 py-2 text-left text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700'

/**
 * A question asked before a save that takes access away from somebody: what
 * will happen, then the two ways out. Leaving things as they are is the
 * prominent choice; the save is the plain one.
 */
export function Question({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="alert"
      className="mt-3 rounded-md bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900"
    >
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        {title}
      </p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
        {children}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onCancel} className={SAFE_CHOICE}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} className={OTHER_CHOICE}>
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}

/**
 * Asked before a save or a removal that leaves NO ticket type set to grant
 * access. The built-in list decides whenever nothing is, so such a save
 * changes who gets in for every type at once, and the organizer is told
 * exactly which types that is.
 */
export function BuiltInListConfirm({
  builtInGranted,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  /** The provider types the built-in list grants, resolved on the server. */
  builtInGranted: readonly string[]
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Question
      title="This leaves no ticket type set to grant access."
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      The built-in list will decide again.{' '}
      {builtInGranted.length > 0
        ? `Holders of ${quoteNames(builtInGranted)} will be able to sign up for workshops, and nobody else.`
        : 'It matches none of this conference’s ticket types, so nobody will be able to sign up for workshops.'}
    </Question>
  )
}
