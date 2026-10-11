import { quoteNames } from './names'

/**
 * Asked before a save or a removal that leaves NO ticket type granting
 * workshop access. The built-in list decides whenever nothing is marked, so
 * such a save changes who gets in for every type at once, and the organizer is
 * told exactly which types that is.
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
    <div
      role="alert"
      className="mt-3 rounded-md bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900"
    >
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        This leaves no ticket type that grants workshop access.
      </p>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
        The built-in list will decide again.{' '}
        {builtInGranted.length > 0
          ? `It grants workshop access to ${quoteNames(builtInGranted)}, and to no other ticket type.`
          : 'It matches none of this conference’s ticket types, so nobody will be able to sign up for workshops.'}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-11 rounded-md bg-blue-600 px-3 py-2 text-left text-sm font-medium text-white hover:bg-blue-500"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
