import type { ReactNode } from 'react'
import { formatDate, formatDateTimeSafe } from '@/lib/time'
import { formats, Format } from '@/lib/proposal/types'
import { StatusBadge } from '@/components/StatusBadge'
import {
  CheckCircleIcon,
  XCircleIcon,
  LinkIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'

/**
 * Read-only label/value row used by the admin settings cards and the management
 * pages that reuse the settings-card idiom. Presentational and client-safe —
 * no data fetching, no server-only imports — so both server pages and client
 * islands can render it.
 */

export interface NamedItem {
  name?: string
  title?: string
}

export type ArrayItem = string | NamedItem

function isValidFormat(key: string): key is Format {
  return Object.values(Format).includes(key as Format)
}

/**
 * Restrict a STORED href to schemes safe to render as a clickable link
 * (site paths, http(s), mailto) — anything else (javascript:, data:,
 * scheme-relative) degrades to an inert '#'. Same closed-scheme standard as
 * the write-path safeLinkHref and the portable-text link guard.
 */
function safeDisplayHref(value: unknown): string {
  if (typeof value !== 'string') return '#'
  const v = value.trim()
  if (!v) return '#'
  if (v.startsWith('/') && !v.startsWith('//')) return v
  if (/^https?:\/\//i.test(v)) return v
  if (/^mailto:/i.test(v)) return v
  return '#'
}

export function FieldRow({
  label,
  value,
  type = 'text',
}: {
  label: string
  value:
    string | boolean | Array<string | NamedItem> | number | null | undefined
  type?:
    | 'text'
    | 'date'
    | 'datetime'
    | 'boolean'
    | 'array'
    | 'links'
    | 'formats'
    | 'team'
    | 'url'
    | 'email'
}) {
  let displayValue: ReactNode = value as ReactNode

  switch (type) {
    case 'datetime':
      // House formatter — consistent locale/timezone rendering.
      displayValue = value ? formatDateTimeSafe(value as string) : 'Not set'
      break
    case 'date':
      displayValue = value ? formatDate(value as string) : 'Not set'
      break
    case 'boolean':
      displayValue = (
        <div className="flex items-center">
          {value ? (
            <>
              <CheckCircleIcon className="mr-1 h-4 w-4 text-green-500 dark:text-green-400" />
              <span className="text-green-700 dark:text-green-300">Yes</span>
            </>
          ) : (
            <>
              <XCircleIcon className="mr-1 h-4 w-4 text-red-500 dark:text-red-400" />
              <span className="text-red-700 dark:text-red-300">No</span>
            </>
          )}
        </div>
      )
      break
    case 'array':
      displayValue =
        Array.isArray(value) && value.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {value.map((item: ArrayItem, idx) => {
              const displayText =
                typeof item === 'string'
                  ? item
                  : (item as NamedItem)?.title ||
                    (item as NamedItem)?.name ||
                    JSON.stringify(item)
              return <StatusBadge key={idx} label={displayText} color="gray" />
            })}
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">None</span>
        )
      break
    case 'links':
      displayValue =
        Array.isArray(value) && value.length > 0 ? (
          <div className="space-y-2">
            {value.map((link, idx) => (
              <div key={idx}>
                <a
                  href={safeDisplayHref(link)}
                  {...(safeDisplayHref(link) !== '#'
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  className="inline-flex max-w-full min-w-0 items-start text-sm text-indigo-600 hover:text-indigo-500 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  {/* break-all, not truncate: a URL is an unbreakable token, and
                      an unconstrained nowrap span dictated the row's intrinsic
                      width — the whole page scrolled horizontally on mobile. */}
                  <span className="min-w-0 break-all">{link as string}</span>
                  <LinkIcon className="mt-1 ml-1 h-3 w-3 shrink-0" />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">None</span>
        )
      break
    case 'formats':
      displayValue =
        Array.isArray(value) && value.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {value.map((format: ArrayItem, idx) => {
              const formatKey =
                typeof format === 'string'
                  ? format
                  : (format as NamedItem)?.title || (format as NamedItem)?.name
              const displayText =
                formatKey && isValidFormat(formatKey)
                  ? formats.get(formatKey) || formatKey
                  : formatKey || 'Unknown Format'
              return <StatusBadge key={idx} label={displayText} color="gray" />
            })}
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">None</span>
        )
      break
    case 'team':
      displayValue =
        Array.isArray(value) && value.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {value.map((member: ArrayItem, idx) => {
              const memberName =
                typeof member === 'string'
                  ? member
                  : (member as NamedItem)?.name || 'Unknown Member'
              return (
                <div
                  key={idx}
                  className="py-1 text-sm text-gray-900 dark:text-white"
                >
                  {memberName}
                </div>
              )
            })}
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">None</span>
        )
      break
    case 'url':
      displayValue = value ? (
        <a
          href={safeDisplayHref(value)}
          {...(safeDisplayHref(value) !== '#'
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : {})}
          className="flex min-w-0 items-start text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {/* Same overflow class as the 'links' case: an unbreakable URL must
              break rather than widen the row past the viewport. */}
          <span className="min-w-0 break-all">{value as string}</span>
          <LinkIcon className="mt-1 ml-1 h-3 w-3 shrink-0" />
        </a>
      ) : (
        'Not set'
      )
      break
    case 'email':
      displayValue = value ? (
        <a
          href={`mailto:${value}`}
          className="flex min-w-0 items-center text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span className="break-all">{value as string}</span>
          <EnvelopeIcon className="ml-1 h-3 w-3 shrink-0" />
        </a>
      ) : (
        'Not set'
      )
      break
    default:
      // `??`/emptiness check, not `||`: a legitimate 0 must not read as unset.
      displayValue =
        value === undefined || value === null || value === ''
          ? 'Not set'
          : (value as ReactNode)
  }

  return (
    <div className="flex justify-between gap-3 border-b border-gray-200 py-2 last:border-b-0 dark:border-gray-700">
      <dt className="shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      {/* min-w-0 lets the value column actually shrink inside the flex row —
          without it, wide unbreakable content (URLs) forces the row past the
          viewport and the page pans horizontally. */}
      <dd className="max-w-xs min-w-0 text-right text-sm text-gray-900 dark:text-white">
        {displayValue}
      </dd>
    </div>
  )
}
