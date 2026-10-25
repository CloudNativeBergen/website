'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { matchesSettingsQuery } from '@/lib/settings/groups'

/**
 * Client-side filter for the Configuration cards. The provider owns the query;
 * each card ({@link FilterableCard}) decides for itself whether it matches, and
 * groups with no visible card hide via CSS `:has` (see CollapsibleGroup).
 * Outside a provider the query is empty, so cards always show.
 */
const QueryContext = createContext('')
/** The enclosing group's title, so a group-name match shows all its cards. */
export const GroupTitleContext = createContext('')

export function useSettingsQuery(): string {
  return useContext(QueryContext)
}

export function SettingsFilter({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const [empty, setEmpty] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)

  // `/` focuses the filter, unless the user is already typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]'))
        return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Cards have committed their own hidden state by now; count what is left.
  useEffect(() => {
    setEmpty(
      query.trim() !== '' &&
        !results.current?.querySelector('[data-settings-card]:not([hidden])'),
    )
  }, [query])

  const clear = () => {
    setQuery('')
    input.current?.focus()
  }

  return (
    <QueryContext.Provider value={query}>
      <div className="relative">
        <label htmlFor="settings-filter" className="sr-only">
          Filter settings
        </label>
        <MagnifyingGlassIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400"
        />
        <input
          ref={input}
          id="settings-filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          placeholder="Filter settings (press /)"
          autoComplete="off"
          className="block w-full rounded-md border-0 bg-white py-2 pr-3 pl-10 text-sm text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset dark:bg-gray-900 dark:text-white dark:ring-gray-700"
        />
      </div>
      <div ref={results} className="space-y-10">
        {empty ? (
          <div
            role="status"
            className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
          >
            <p>No settings match “{query.trim()}”.</p>
            <button
              type="button"
              onClick={clear}
              className="mt-2 inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <XMarkIcon aria-hidden="true" className="h-4 w-4" />
              Clear filter
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </QueryContext.Provider>
  )
}

/**
 * One filterable card. Matches on its title, its group's title and the labels
 * of the FieldRows it renders (read from the DOM, so callers list nothing).
 */
export function FilterableCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const query = useSettingsQuery()
  const group = useContext(GroupTitleContext)
  const ref = useRef<HTMLDivElement>(null)
  const [labels, setLabels] = useState<string[]>([])

  useEffect(() => {
    setLabels(
      Array.from(
        ref.current?.querySelectorAll('[data-field-label]') ?? [],
        (el) => el.textContent ?? '',
      ),
    )
  }, [])

  const visible = matchesSettingsQuery(query, [title, group, ...labels])
  return (
    <div ref={ref} data-settings-card="" hidden={!visible}>
      {children}
    </div>
  )
}
