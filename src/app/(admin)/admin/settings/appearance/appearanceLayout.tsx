import { StatusBadge } from '@/components/StatusBadge'
import { SECTION_LABELS } from '@/lib/homepage/editor'
import type { HomepageSection } from '@/lib/homepage'
import { APPEARANCE_SECTIONS } from '@/lib/settings/appearance'

/**
 * Presentational primitives for the Appearance page. Data-agnostic (no
 * conference reads, no tRPC) so the whole page is renderable in Storybook for
 * the mandatory visual QA — the same split `settingsLayout.tsx` uses for the
 * settings page itself.
 */

const chipBase =
  'inline-flex min-h-[36px] items-center rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors'

/**
 * The page's jump nav: one chip per anchored section, in page order. Sticky, so
 * it stays reachable while scrolling the one page — the `SectionNav` pattern
 * from the settings page.
 *
 * Plain `<a href="#…">` anchors, not `Link`: same-document jumps, so the whole
 * page stays free of client JS (no scroll-spy — a chip's "active" state would
 * need one, and the value here is jumping, not orientation).
 */
export function AppearanceNav() {
  return (
    <nav
      aria-label="Appearance sections"
      className="sticky top-0 z-10 -mx-4 border-b border-gray-200 bg-gray-50/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-4 dark:border-gray-700 dark:bg-gray-900/90"
    >
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {APPEARANCE_SECTIONS.map((section) => (
          <li key={section.id} className="shrink-0">
            <a
              href={`#${section.id}`}
              className={`${chipBase} border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:text-indigo-400`}
            >
              {section.navLabel}
            </a>
          </li>
        ))}
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
