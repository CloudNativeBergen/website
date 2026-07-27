import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import {
  SETTINGS_GROUP_ANCHORS,
  SETTINGS_TIER_ANCHORS,
  type SettingsGroup,
} from '@/lib/settings/groups'
import { PencilSquareIcon, ArrowUpRightIcon } from '@heroicons/react/24/outline'

/**
 * Presentational primitives for the admin Settings page. Extracted from the
 * server `page.tsx` so the layout (cards, field rows, the jump-nav and the
 * grouped section headings) is data-agnostic and can be rendered in Storybook
 * for the mandatory visual QA. None of these read conference data or call tRPC —
 * callers pass values and action nodes in. The field row itself is the shared
 * `@/components/admin/FieldRow`, re-exported here for the settings callers.
 */

export {
  FieldRow,
  type NamedItem,
  type ArrayItem,
} from '@/components/admin/FieldRow'

/** A deep-link to a dedicated management page (the in-app editor for this
 * card's data). Used where a full editor already lives elsewhere in /admin, so
 * the settings card links to it instead of duplicating the editor (and instead
 * of a "Edit in Studio" link). */
export interface ManageLinkTarget {
  href: string
  label: string
}

export function InfoCard({
  title,
  children,
  icon: Icon,
  editUrl,
  manageLink,
  action,
}: {
  title: string
  children: ReactNode
  icon: ComponentType<{ className?: string }>
  editUrl?: string | null
  /**
   * Optional deep-link to a dedicated /admin management page for this card's
   * data. Rendered in the header action slot in place of the Studio link (a
   * card should offer one or the other, not both).
   */
  manageLink?: ManageLinkTarget
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
          {/* One or the other, per the contract above: an in-app manage
              link supersedes the Studio deep-link. */}
          {manageLink ? (
            <ManageLink {...manageLink} />
          ) : (
            <StudioEditLink editUrl={editUrl} />
          )}
          {action}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

/**
 * Deep-link affordance to a dedicated /admin management page. An INTERNAL link
 * (Next `Link`, no `target=_blank`) — it stays in the admin app, unlike the
 * Studio deep-link which opens an external CMS.
 */
export function ManageLink({ href, label }: ManageLinkTarget) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {label}
      <ArrowUpRightIcon className="h-4 w-4" aria-hidden="true" />
    </Link>
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
