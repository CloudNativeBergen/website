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
import {
  Bars3Icon,
  PlusIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'
import {
  HOMEPAGE_SECTION_TYPES,
  type HomepageSectionType,
} from '@/lib/homepage'
import type { SectionContentStatus } from '@/lib/homepage/contentStatus'
import { SECTION_LABELS, type EditorRow } from '@/lib/homepage/editor'
import { ComposerSectionCard } from './SectionCard'
import { inputClass } from './styles'

export interface ComposerRailProps {
  rows: EditorRow[]
  /** `_key`s whose config panel is open. */
  expanded: ReadonlySet<string>
  focusKey: string | null
  hoverKey: string | null
  /** `_key` → what the live site does with that section. */
  statuses: ReadonlyMap<string, SectionContentStatus>
  /** `_key`s the preview is currently standing on sample content. */
  sampleKeys: ReadonlySet<string>
  addType: HomepageSectionType
  onAddTypeChange: (type: HomepageSectionType) => void
  onAdd: () => void
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
  focusKey,
  hoverKey,
  statuses,
  sampleKeys,
  addType,
  onAddTypeChange,
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

  return (
    <div className="min-w-0">
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={addType}
          onChange={(event) =>
            onAddTypeChange(event.target.value as HomepageSectionType)
          }
          aria-label="Section type to add"
          className={`${inputClass} w-auto`}
        >
          {HOMEPAGE_SECTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {SECTION_LABELS[type]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-300"
        >
          <PlusIcon className="h-5 w-5" />
          Add section
        </button>
      </div>
    </div>
  )
}
