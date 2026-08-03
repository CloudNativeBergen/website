import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { SECTION_LABELS } from '@/lib/homepage/editor'
import type { HomepageSection } from '@/lib/homepage'
import type { BackgroundPattern } from '@/lib/conference/backgroundPattern'
import {
  APPEARANCE_SECTIONS,
  type AppearanceSectionId,
} from '@/lib/settings/appearance'

/**
 * Presentational primitives for the Appearance section. Data-agnostic (no
 * conference reads, no tRPC) so the whole section is renderable in Storybook for
 * the mandatory visual QA — the same split `settingsLayout.tsx` uses for the
 * settings page itself.
 */

/** Read-only labels for the background-pattern row. */
export const BACKGROUND_PATTERN_LABELS: Record<BackgroundPattern, string> = {
  'cloud-native': 'Cloud Native (animated CNCF logos)',
  subtle: 'Subtle (sparse, faint logos)',
  none: 'None (plain gradient)',
}

const chipBase =
  'inline-flex min-h-[36px] items-center rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors'

/**
 * The section's sub-navigation: one pill per sub-page, in nav order, with the
 * current page marked. Horizontally scrollable rather than wrapping, so a narrow
 * (393px) viewport keeps the row one line tall and never reflows the page
 * heading — the same behaviour as the settings page's group chips.
 *
 * A server component: the active pill comes from the rendering page rather than
 * `usePathname`, so the whole section stays free of client JS.
 */
export function AppearanceNav({ current }: { current: AppearanceSectionId }) {
  return (
    <nav
      aria-label="Appearance sections"
      className="-mx-4 border-b border-gray-200 sm:mx-0 sm:border-0 dark:border-gray-800"
    >
      <ul className="flex gap-2 overflow-x-auto px-4 pb-2 sm:px-0">
        {APPEARANCE_SECTIONS.map((section) => {
          const active = section.id === current
          return (
            <li key={section.id} className="shrink-0">
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? `${chipBase} border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500`
                    : `${chipBase} border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:text-indigo-400`
                }
              >
                {section.navLabel}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** "Default (automatic)" vs "Custom composition" — the homepage layout state. */
export function HomepageLayoutRow({ usingDefault }: { usingDefault: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-200 py-2 dark:border-gray-700">
      <dt className="shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400">
        Layout
      </dt>
      <dd className="min-w-0 text-right text-sm">
        {usingDefault ? (
          <StatusBadge label="Default (automatic)" color="gray" />
        ) : (
          <StatusBadge label="Custom composition" color="green" />
        )}
      </dd>
    </div>
  )
}

/**
 * Read-only ordered list of the resolved homepage composition. Labels come from
 * `SECTION_LABELS` (the editor's own table) so a newly added section type can
 * never render as a raw `_type` here.
 */
export function HomepageCompositionList({
  sections,
}: {
  sections: HomepageSection[]
}) {
  return (
    <ol className="space-y-1 pt-1">
      {sections.map((section, idx) => (
        <li
          key={section._key}
          className="flex items-center justify-between gap-2 text-sm text-gray-900 dark:text-white"
        >
          <span>
            {idx + 1}. {SECTION_LABELS[section._type] ?? section._type}
          </span>
          {section.hidden ? (
            <StatusBadge label="Hidden" color="yellow" />
          ) : null}
        </li>
      ))}
    </ol>
  )
}
