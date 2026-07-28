'use client'

import { TrashIcon } from '@heroicons/react/24/outline'

/**
 * Spreadsheet-style inline table primitives for the budget editors.
 *
 * The whole editing surface is a real `<table>`: one row per line item, one
 * column per field, cells that ARE the inputs (text / number / select /
 * checkbox) — no per-row cards. Numeric cells right-align with `tabular-nums`
 * so columns of NOK figures line up like a spreadsheet. The parent wraps the
 * table in an `overflow-x-auto` container so a wide table scrolls sideways
 * inside its card instead of pushing the page horizontally.
 */

/** Wrapper class: header row + cells share this for a tight, gridded feel. */
export const tableWrapClass =
  'overflow-x-auto rounded-lg ring-1 ring-gray-200 dark:ring-gray-700'

export const tableClass = 'min-w-full border-collapse text-sm'

export const theadClass =
  'bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:bg-gray-800 dark:text-gray-400'

/** Base header cell: adds a bottom divider and consistent padding. */
export const thClass =
  'border-b border-gray-200 px-3 py-2 font-medium whitespace-nowrap dark:border-gray-700'

export const tbodyRowClass =
  'border-b border-gray-100 last:border-0 dark:border-gray-800'

/** Base cell padding; numeric columns add `text-right`. */
export const tdClass = 'px-3 py-1.5 align-middle'

const baseInput =
  'w-full rounded-md border-0 bg-transparent px-2 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-transparent hover:ring-gray-300 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none dark:text-white dark:hover:ring-gray-600 dark:focus:bg-gray-900'

export function TextCell({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  placeholder?: string
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`${baseInput} min-w-[10rem]`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function NumberCell({
  value,
  onChange,
  ariaLabel,
  min = 0,
  placeholder,
  widthClass = 'w-28',
}: {
  value: number | string
  onChange: (value: string) => void
  ariaLabel: string
  min?: number
  placeholder?: string
  widthClass?: string
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`${baseInput} ${widthClass} text-right tabular-nums`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function SelectCell<T extends string>({
  value,
  onChange,
  ariaLabel,
  options,
}: {
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  options: { value: T; label: string }[]
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={`${baseInput} min-w-[9rem]`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export function CheckboxCell({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
}) {
  return (
    <span className="flex justify-center">
      <input
        type="checkbox"
        aria-label={ariaLabel}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 dark:border-gray-600 dark:bg-gray-900"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </span>
  )
}

export function DeleteRowButton({
  onClick,
  ariaLabel,
  pending = false,
}: {
  onClick: () => void
  ariaLabel: string
  /** Referenced-row confirm state: tints the button amber before the 2nd click. */
  pending?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${
        pending
          ? 'text-amber-600 ring-1 ring-amber-400 dark:text-amber-400'
          : 'text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30'
      }`}
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  )
}
