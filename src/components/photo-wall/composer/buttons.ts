// Plain module, no 'use client': server components (ComposerClosed) import
// these, and a value from a client module reaches them as a client reference.
export const PRIMARY_BUTTON =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-cloud-blue px-4 text-base font-semibold text-white shadow-xs hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-60 dark:focus-visible:outline-indigo-400'
export const SECONDARY_BUTTON =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-base font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:focus-visible:outline-white'
