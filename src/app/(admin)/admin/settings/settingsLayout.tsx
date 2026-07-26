import type { ComponentType, ReactNode } from 'react'
import { formatDate, formatDateTimeSafe } from '@/lib/time'
import { formats, Format } from '@/lib/proposal/types'
import { StatusBadge } from '@/components/StatusBadge'
import {
  SETTINGS_GROUP_ANCHORS,
  SETTINGS_TIER_ANCHORS,
  type SettingsGroup,
} from '@/lib/settings/groups'
import {
  PencilSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  LinkIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'

/**
 * Presentational primitives for the admin Settings page. Extracted from the
 * server `page.tsx` so the layout (cards, field rows, the jump-nav and the
 * grouped section headings) is data-agnostic and can be rendered in Storybook
 * for the mandatory visual QA. None of these read conference data or call tRPC —
 * callers pass values and action nodes in.
 */

export interface NamedItem {
  name?: string
  title?: string
}

export type ArrayItem = string | NamedItem

function isValidFormat(key: string): key is Format {
  return Object.values(Format).includes(key as Format)
}

export function InfoCard({
  title,
  children,
  icon: Icon,
  editUrl,
  action,
}: {
  title: string
  children: ReactNode
  icon: ComponentType<{ className?: string }>
  editUrl?: string | null
  /**
   * Optional inline edit affordance (an EditConferenceCard island). When present
   * it sits beside the Studio deep-link; the card body keeps rendering the
   * read-only values and refreshes after a save.
   */
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center">
          <Icon className="mr-2 h-5 w-5 text-gray-400 dark:text-gray-500" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StudioEditLink editUrl={editUrl} />
          {action}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

/**
 * The "Edit in Studio" deep-link affordance, factored out of {@link InfoCard} so
 * collapsed cards (which use CollapsibleSection instead of InfoCard) can still
 * surface it in their header action slot.
 */
export function StudioEditLink({ editUrl }: { editUrl?: string | null }) {
  if (!editUrl) return null
  return (
    <a
      href={editUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
    >
      <PencilSquareIcon className="h-4 w-4" />
      Edit in Studio
    </a>
  )
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
                  target="_blank"
                  rel="noopener noreferrer"
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
          target="_blank"
          rel="noopener noreferrer"
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

export function SectionNav() {
  return (
    <nav className="sticky top-0 z-10 -mx-4 mb-2 space-y-2 border-b border-gray-200 bg-gray-50/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-4 dark:border-gray-700 dark:bg-gray-900/90">
      {/* Tier anchors — the three top-level sections. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {SETTINGS_TIER_ANCHORS.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="font-medium text-gray-600 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      {/* Group anchors — one click to any tier-1 subsection. Horizontally
          scrollable chips so they never wrap or overflow on mobile. */}
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 text-xs">
        {SETTINGS_GROUP_ANCHORS.map((item) => (
          <li key={item.href} className="shrink-0">
            <a
              href={item.href}
              className="inline-block rounded-full border border-gray-200 bg-white px-3 py-1 font-medium whitespace-nowrap text-gray-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:text-indigo-400"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function SectionHeading({
  id,
  icon: Icon,
  title,
  description,
  level = 2,
}: {
  id: string
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  /** 2 = tier heading (default), 3 = subordinate group heading. */
  level?: 2 | 3
}) {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <div id={id} className="scroll-mt-24">
      <div className="flex items-center gap-2">
        <Icon
          className={
            level === 3
              ? 'h-5 w-5 text-gray-400 dark:text-gray-500'
              : 'h-6 w-6 text-gray-400 dark:text-gray-500'
          }
        />
        <Heading
          className={
            level === 3
              ? 'text-lg font-semibold text-gray-900 dark:text-white'
              : 'text-xl font-semibold text-gray-900 dark:text-white'
          }
        >
          {title}
        </Heading>
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>
  )
}

/**
 * A tier-1 subsection: a group heading (h3) followed by its own card grid. The
 * `id` is the additive jump-nav anchor; per-card deep-link anchors live inside
 * the cards and are preserved independently.
 */
export function SettingsGroupSection({
  group,
  icon,
  children,
}: {
  group: SettingsGroup
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <SectionHeading
        id={group.id}
        icon={icon}
        title={group.title}
        description={group.description}
        level={3}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{children}</div>
    </div>
  )
}
