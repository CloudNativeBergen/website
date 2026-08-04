'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowTopRightOnSquareIcon,
  Bars3Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import type { SectionContentStatus } from '@/lib/homepage/contentStatus'
import {
  SECTION_LABELS,
  isConfigurable,
  type EditorRow,
} from '@/lib/homepage/editor'
import { cn } from '@/lib/utils'
import type { PlaceholderConference } from './placeholderCopy'
import { SectionConfig } from './SectionConfig'
import { rowBtnClass } from './styles'

export interface ComposerSectionCardProps {
  row: EditorRow
  index: number
  total: number
  expanded: boolean
  /**
   * The tenant's title/tagline/description, so the config panel can show the
   * copy this band falls back to. Absent while the data query is in flight.
   */
  conference?: PlaceholderConference
  /** This card's section is the selected one — ringed on BOTH sides of the workspace. */
  focused: boolean
  /** The pointer is over this card, or over its band in the preview. */
  hovered: boolean
  /**
   * What the LIVE site does with this section, computed against the REAL
   * conference. Absent while the composer's data query is still in flight.
   */
  status?: SectionContentStatus
  /** Design mode is standing this band on sample content. */
  sample?: boolean
  onToggleExpanded: () => void
  onPatch: (patch: Partial<EditorRow>) => void
  onToggleHidden: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onFocus: () => void
  onHover: (hovering: boolean) => void
}

/**
 * One draggable section card in the composer rail: the structure row (order,
 * label, visibility, remove), the honesty row underneath it, and the per-type
 * config panel.
 *
 * The card is the rail half of the locate loop. Hovering it outlines the
 * matching band in the preview; clicking it selects that band; and a click on a
 * band in the preview rings and scrolls to this card. `data-composer-card` is
 * the handle the workspace scrolls by — an id the two documents already share
 * (`_key`) beats any parallel numbering.
 */
export function ComposerSectionCard({
  row,
  index,
  total,
  expanded,
  conference,
  focused,
  hovered,
  status,
  sample = false,
  onToggleExpanded,
  onPatch,
  onToggleHidden,
  onMoveUp,
  onMoveDown,
  onRemove,
  onFocus,
  onHover,
}: ComposerSectionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row._key })

  const label = SECTION_LABELS[row._type]
  const configurable = isConfigurable(row._type)

  return (
    <li
      ref={setNodeRef}
      data-composer-card={row._key}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // The 4px left border is ALWAYS reserved (transparent when unselected)
        // so selection can add a solid accent bar — a shape cue, not another
        // hue — without shifting every card 4px sideways as focus moves.
        'scroll-mt-4 rounded-lg border border-l-4 border-l-transparent bg-white dark:bg-gray-800/40',
        isDragging
          ? 'z-10 border-brand-cloud-blue opacity-50'
          : 'border-gray-200 dark:border-gray-700',
        focused &&
          'border-blue-500 border-l-blue-500 ring-2 ring-blue-500/40 dark:border-blue-400 dark:border-l-blue-400',
        !focused && hovered && 'border-blue-300 dark:border-blue-700',
        // A hidden section is dimmed in the PREVIEW, where the consequence
        // lives. Dimming the card too pushed its 12px status line below
        // readable while the eye-slash icon and "Hidden" chip already carry the
        // state — so the card keeps full contrast and takes a tint instead.
        row.hidden && 'bg-gray-50 dark:bg-gray-900/60',
      )}
      onClick={onFocus}
      // Keyboard parity for the click above: tabbing into any control on this
      // card selects its band in the preview, so the locate loop works without
      // a pointer. `onFocusCapture` rather than a tabIndex on the row itself —
      // the row is not an interactive element, and adding a stop on the tab
      // order before five real controls would be worse than no shortcut.
      onFocusCapture={onFocus}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* BELOW `sm` the title owns a full-width row and the controls take their
          own beneath it. Five 44px controls plus a wrapping title in ONE row is
          what made 393px collide: the number orphaned onto its own line ("2." /
          "Countdown") and, with a config panel open, the gear sat on top of the
          word "Highlights". Stacking costs one row and removes the whole class
          of failure. */}
      <div className="flex flex-col gap-1 p-2 sm:flex-row sm:items-center sm:gap-2 sm:p-3">
        {/* Grab handle: dnd-kit attributes + listeners on the focusable button so
            Enter/Space starts a keyboard drag; up/down buttons remain the mobile
            + a11y fallback. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${label} to reorder`}
          className="hidden h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue active:cursor-grabbing sm:inline-flex dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>

        {/* The label WRAPS rather than truncates: "Featured Speakers" clipped to
            "Featured S…" is worse than a second line. The 36px desktop controls
            below buy it ~50px, which keeps most labels on one line anyway. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 text-sm font-semibold text-gray-900 dark:text-white">
            <span className="text-gray-400 tabular-nums">{index + 1}.</span>{' '}
            {label}
          </span>
          {row.hidden ? (
            <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
              Hidden
            </span>
          ) : null}
          {sample ? (
            // VIOLET, not amber. Sample content is a fact about the preview, not
            // a fault: on a conference created an hour ago six of seven cards
            // carry this chip, and six amber chips read as six warnings. Amber
            // in this rail now means only "attention" (see ContentStatusRow).
            // The band itself keeps its amber dashed outline and in-band pill —
            // that is where someone could actually be fooled by fake content.
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200">
              <SparklesIcon className="h-3 w-3" aria-hidden="true" />
              Sample data
            </span>
          ) : null}
        </div>

        {/* `shrink-0` is load-bearing: without it the cluster was allowed to
            compress past its content and overlap the title. */}
        <div className="-mr-1 flex shrink-0 items-center justify-end sm:mr-0">
          {configurable ? (
            <button
              type="button"
              className={rowBtnClass}
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Configure'} ${label}`}
              title="Configure"
            >
              <Cog6ToothIcon className="h-5 w-5" />
            </button>
          ) : null}
          <button
            type="button"
            className={rowBtnClass}
            onClick={onToggleHidden}
            aria-label={row.hidden ? `Show ${label}` : `Hide ${label}`}
            title={row.hidden ? 'Hidden — click to show' : 'Visible'}
          >
            {row.hidden ? (
              <EyeSlashIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            )}
          </button>
          <button
            type="button"
            className={rowBtnClass}
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label={`Move ${label} up`}
          >
            <ChevronUpIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={rowBtnClass}
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label={`Move ${label} down`}
          >
            <ChevronDownIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            className={`${rowBtnClass} hover:text-red-600`}
            onClick={onRemove}
            aria-label={`Remove ${label}`}
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {status ? <ContentStatusRow status={status} /> : null}

      {configurable && expanded ? (
        <div className="border-t border-gray-200 px-3 pt-2 pb-3 dark:border-gray-700">
          <SectionConfig row={row} conference={conference} onChange={onPatch} />
        </div>
      ) : null}
    </li>
  )
}

/**
 * What is actually behind this band, in one line — "12 speakers", "No sponsors
 * yet", "Dates and Grieghallen" — plus the link that fixes it.
 *
 * This is the rail's half of the honesty mechanism: the preview shows the
 * consequence, the card names the cause and where to go.
 *
 * ## Temperature
 *
 * The facts here are unchanged; what changed is how loudly they are said. This
 * row used to paint every non-`ready` status amber and prefix every hiding one
 * with "Not shown on the live site — ", which meant a conference created an
 * hour ago opened as six orange warnings in a column. Waiting on content is the
 * NORMAL state of a new conference, so it now reads as grey guidance, the
 * "not shown" fact is stated ONCE by {@link WaitingSummary} at the top of the
 * rail rather than six times down it, and amber is reserved for
 * `tone === 'attention'` — content the organizer has already entered that the
 * page will not draw, or a block they authored that cannot work.
 *
 * The manage link is the one thing that is never tinted by the status: a call
 * to action should look like an action, not like part of the alarm.
 */
function ContentStatusRow({ status }: { status: SectionContentStatus }) {
  const attention = status.tone === 'attention'
  return (
    <p
      // The tone is on the DOM as well as in the classes: it is what a11y and
      // visual-regression checks assert against, and reading it back off Tailwind
      // colour utilities would be a test of the stylesheet, not of the rule.
      data-status-tone={status.tone}
      className={cn(
        'flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-3 pb-2 text-xs',
        attention
          ? 'text-amber-800 dark:text-amber-200'
          : 'text-gray-600 dark:text-gray-300',
      )}
    >
      {attention ? (
        <ExclamationTriangleIcon
          className="h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        />
      ) : null}
      <span>
        {attention && status.willHide ? 'Not shown on the live site — ' : null}
        {status.summary}
      </span>
      {status.manage ? (
        <Link
          href={status.manage.href}
          className="inline-flex items-center gap-0.5 font-medium text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100"
        >
          {status.manage.label}
          <ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden="true" />
        </Link>
      ) : null}
    </p>
  )
}
