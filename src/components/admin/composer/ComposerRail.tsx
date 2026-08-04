'use client'

import { useId } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import {
  Bars3Icon,
  InformationCircleIcon,
  PlusIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import {
  HOMEPAGE_SECTION_TYPES,
  SECTION_DESCRIPTIONS,
  type HomepageSectionType,
} from '@/lib/homepage'
import type { SectionContentStatus } from '@/lib/homepage/contentStatus'
import { SECTION_LABELS, type EditorRow } from '@/lib/homepage/editor'
import type { PlaceholderConference } from './placeholderCopy'
import { ComposerSectionCard } from './SectionCard'

export interface ComposerRailProps {
  rows: EditorRow[]
  /** `_key`s whose config panel is open. */
  expanded: ReadonlySet<string>
  /**
   * The tenant's title/tagline/description — what the config panels quote as
   * the copy each band renders when its field is left blank.
   */
  conference?: PlaceholderConference
  focusKey: string | null
  hoverKey: string | null
  /** `_key` → what the live site does with that section. */
  statuses: ReadonlyMap<string, SectionContentStatus>
  /** `_key`s the preview is currently standing on sample content. */
  sampleKeys: ReadonlySet<string>
  onAdd: (type: HomepageSectionType) => void
  onToggleExpanded: (key: string) => void
  onPatch: (key: string, patch: Partial<EditorRow>) => void
  onToggleHidden: (key: string) => void
  onMove: (from: number, to: number) => void
  onRemove: (key: string) => void
  onFocus: (key: string) => void
  onHover: (key: string | null) => void
  /** Drag lifecycle — the workspace projects the in-flight order into the preview. */
  activeKey: string | null
  onDragStart: (key: string) => void
  onDragOver: (key: string | null) => void
  onDragEnd: (activeKey: string, overKey: string | null) => void
  onDragCancel: () => void
}

/**
 * The composer's left rail: the section list, its per-type config, and the add
 * control — the structure view AND the editing surface in one column.
 *
 * The retired modal kept a separate `CompositionPreview` panel of labeled boxes
 * beside these cards. In the workspace that panel would be a diagram of the
 * thing rendered full-size two feet to its right, so it is gone: its two jobs
 * (drag projection, hidden-band ghosting) now happen in the real preview.
 *
 * Reordering stays HERE rather than on the canvas: full-width stacked bands in a
 * scaled iframe drag badly and have no keyboard path, while dnd-kit's sortable
 * list has both (grab handle for pointer, Enter/Space + arrows for keyboard,
 * up/down buttons as the mobile and a11y fallback).
 */
export function ComposerRail({
  rows,
  expanded,
  conference,
  focusKey,
  hoverKey,
  statuses,
  sampleKeys,
  onAdd,
  onToggleExpanded,
  onPatch,
  onToggleHidden,
  onMove,
  onRemove,
  onFocus,
  onHover,
  activeKey,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragCancel,
}: ComposerRailProps) {
  const dndId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragStart = (event: DragStartEvent) =>
    onDragStart(String(event.active.id))
  const handleDragOver = (event: DragOverEvent) =>
    onDragOver(event.over ? String(event.over.id) : null)
  const handleDragEnd = (event: DragEndEvent) =>
    onDragEnd(
      String(event.active.id),
      event.over ? String(event.over.id) : null,
    )

  const activeRow = activeKey
    ? rows.find((row) => row._key === activeKey)
    : undefined

  // Sections that are simply waiting for their content — counted ONCE, here,
  // instead of six near-identical warning lines down the rail. Hidden rows are
  // excluded: the organizer switched those off on purpose, so "waiting" would
  // be a lie about what they are waiting for.
  const waiting = rows.filter((row) => {
    if (row.hidden) return false
    const status = statuses.get(row._key)
    return status?.tone === 'waiting' && status.willHide
  }).length

  return (
    <div className="min-w-0">
      {waiting > 0 ? <WaitingSummary count={waiting} /> : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <Squares2X2Icon className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
            No sections yet
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add a section below, or revert to the default layout.
          </p>
        </div>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={onDragCancel}
        >
          <SortableContext
            items={rows.map((row) => row._key)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-3">
              {rows.map((row, index) => (
                <ComposerSectionCard
                  key={row._key}
                  row={row}
                  index={index}
                  total={rows.length}
                  expanded={expanded.has(row._key)}
                  conference={conference}
                  focused={focusKey === row._key}
                  hovered={hoverKey === row._key}
                  status={statuses.get(row._key)}
                  sample={sampleKeys.has(row._key)}
                  onToggleExpanded={() => onToggleExpanded(row._key)}
                  onPatch={(patch) => onPatch(row._key, patch)}
                  onToggleHidden={() => onToggleHidden(row._key)}
                  onMoveUp={() => onMove(index, index - 1)}
                  onMoveDown={() => onMove(index, index + 1)}
                  onRemove={() => onRemove(row._key)}
                  onFocus={() => onFocus(row._key)}
                  onHover={(hovering) => onHover(hovering ? row._key : null)}
                />
              ))}
            </ul>
          </SortableContext>
          <DragOverlay>
            {activeRow ? (
              <div className="flex items-center gap-2 rounded-lg border border-brand-cloud-blue bg-white px-3 py-3 shadow-lg ring-2 ring-brand-cloud-blue/30 dark:bg-gray-800">
                <Bars3Icon className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {SECTION_LABELS[activeRow._type]}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <AddSectionMenu onAdd={onAdd} />
    </div>
  )
}

/**
 * "Your page is filling in", said once at the top of the rail.
 *
 * A conference created this morning legitimately has six bands with nothing
 * behind them yet. Repeating "Not shown on the live site — no photos yet" on
 * each of their cards was honest and unbearable: the phrase read as a list of
 * failures, and repeating it six times buried the one thing that differs
 * between the cards, which is what to do next. The fact belongs here — stated
 * with a number, in a neutral voice, without an exclamation mark's worth of
 * amber — while each card keeps its own summary and its own fix-it link.
 */
function WaitingSummary({ count }: { count: number }) {
  const one = count === 1
  return (
    <p className="mb-3 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
      <InformationCircleIcon
        className="mt-px h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
        aria-hidden="true"
      />
      <span>
        <span className="font-semibold text-gray-800 dark:text-gray-100">
          {one ? 'One section is' : `${count} sections are`} waiting on content.
        </span>{' '}
        {one ? 'It appears' : 'Each one appears'} on the live site as soon as
        you add it.
      </span>
    </p>
  )
}

/**
 * ONE affordance for adding a block, instead of a bare `<select>` floating
 * beside a dashed button.
 *
 * The old pair asked the organizer to pick "Call-to-action Banner" from an
 * unlabeled dropdown and then press a second control to commit it, with no hint
 * of what either phrase would put on their page. This is one button that opens
 * the thirteen types with a sentence each ({@link SECTION_DESCRIPTIONS}) and
 * adds on click — the same shape the variant picker already uses one level
 * down.
 *
 * `anchor` (Headless UI's floating positioning) rather than a plain absolute
 * panel: the rail is an `overflow-y-auto` column above `lg`, and an in-flow
 * dropdown would be clipped by it. Anchoring portals the panel out.
 */
function AddSectionMenu({
  onAdd,
}: {
  onAdd: (type: HomepageSectionType) => void
}) {
  return (
    <Menu>
      <MenuButton className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-brand-cloud-blue hover:text-brand-cloud-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:border-gray-600 dark:text-gray-300">
        <PlusIcon className="h-5 w-5" aria-hidden="true" />
        Add a section
      </MenuButton>
      <MenuItems
        anchor={{ to: 'bottom start', gap: 8, padding: 16 }}
        // `maxHeight` inline rather than a `max-h-*` class: the anchor
        // positioner writes its own height budget onto this element, and a
        // utility class loses to it — the panel ran off the bottom of the
        // viewport with the class alone.
        style={{ maxHeight: 'min(22rem, var(--anchor-max-height, 22rem))' }}
        className="z-50 w-(--button-width) min-w-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl focus:outline-none dark:border-gray-700 dark:bg-gray-800"
      >
        {HOMEPAGE_SECTION_TYPES.map((type) => (
          <MenuItem key={type}>
            <button
              type="button"
              onClick={() => onAdd(type)}
              className="block w-full rounded-lg px-3 py-2 text-left data-focus:bg-gray-100 dark:data-focus:bg-gray-700"
            >
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                {SECTION_LABELS[type]}
              </span>
              <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-300">
                {SECTION_DESCRIPTIONS[type]}
              </span>
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  )
}
