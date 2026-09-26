'use client'

import { useId } from 'react'
import clsx from 'clsx'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import type {
  MarketingAssetFacets,
  MarketingAssetFilter,
} from '@/lib/marketing-asset'
import { SUBJECT_LABEL } from './SubjectCombobox'

const SELECT =
  'block min-h-[40px] w-full rounded-md border border-gray-300 bg-white py-2 pr-8 pl-3 text-sm text-gray-900 shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

/**
 * The gallery's filters (spec §3): this edition or all editions, kind,
 * subject, tag, and a search over title and tags. Filtering itself happens on the server.
 */
export function AssetFilters({
  filter,
  search,
  onFilterChange,
  onSearchChange,
  facets,
}: {
  filter: MarketingAssetFilter
  /** The search box's text, ahead of the debounced filter. */
  search: string
  onFilterChange: (filter: MarketingAssetFilter) => void
  onSearchChange: (search: string) => void
  facets: MarketingAssetFacets
}) {
  const id = useId()
  const editions = filter.editions ?? 'current'
  const segment = (value: 'current' | 'all', label: string) => (
    <label
      className={clsx(
        'flex min-h-[40px] flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-center text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-cloud-blue',
        editions === value
          ? 'bg-white text-gray-900 shadow-xs dark:bg-gray-700 dark:text-white'
          : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white',
      )}
    >
      <input
        type="radio"
        name={`${id}-editions`}
        value={value}
        checked={editions === value}
        onChange={() => onFilterChange({ ...filter, editions: value })}
        className="sr-only"
      />
      {label}
    </label>
  )

  return (
    <div
      role="search"
      aria-label="Filter the gallery"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]"
    >
      <fieldset className="min-w-0">
        <legend className="sr-only">Editions</legend>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          {segment('current', 'This edition')}
          {segment('all', 'All editions')}
        </div>
      </fieldset>
      <div className="min-w-0">
        <label htmlFor={`${id}-kind`} className="sr-only">
          Kind
        </label>
        <select
          id={`${id}-kind`}
          value={filter.kind ?? ''}
          onChange={(event) =>
            onFilterChange({
              ...filter,
              kind:
                event.target.value === 'image' || event.target.value === 'audio'
                  ? event.target.value
                  : undefined,
            })
          }
          className={SELECT}
        >
          <option value="">Any kind</option>
          <option value="image">Images</option>
          <option value="audio">Audio tracks</option>
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${id}-subject`} className="sr-only">
          Subject
        </label>
        <select
          id={`${id}-subject`}
          value={filter.subjectId ?? ''}
          onChange={(event) =>
            onFilterChange({
              ...filter,
              subjectId: event.target.value || undefined,
            })
          }
          className={SELECT}
        >
          <option value="">Any subject</option>
          {facets.subjects.map((subject) => (
            <option key={subject._id} value={subject._id}>
              {subject.name} ({SUBJECT_LABEL[subject._type]})
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${id}-tag`} className="sr-only">
          Tag
        </label>
        <select
          id={`${id}-tag`}
          value={filter.tag ?? ''}
          onChange={(event) =>
            onFilterChange({ ...filter, tag: event.target.value || undefined })
          }
          className={SELECT}
        >
          <option value="">Any tag</option>
          {facets.tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>
      <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
        <label htmlFor={`${id}-search`} className="sr-only">
          Search titles and tags
        </label>
        <MagnifyingGlassIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
          aria-hidden
        />
        <input
          id={`${id}-search`}
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search titles and tags"
          className={clsx(SELECT, 'pl-9')}
        />
      </div>
    </div>
  )
}
