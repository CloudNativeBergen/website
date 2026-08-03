'use client'

import { useMemo, useState, useId } from 'react'
import { useRouter } from 'next/navigation'
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Bars3Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  PlusIcon,
  Squares2X2Icon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { PortableTextEditor } from '@/components/PortableTextEditor'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import {
  HOMEPAGE_SECTION_TYPES,
  type HomepageSection,
  type HomepageSectionType,
} from '@/lib/homepage'
import {
  SECTION_LABELS,
  isConfigurable,
  moveByIndex,
  nextKey,
  reorderByKey,
  serializeRows,
  toEditorRows,
  toPayload,
  toPreviewBands,
  type EditorRow,
  type PreviewBand,
} from '@/lib/homepage/editor'

/**
 * Front-page builder (F3) admin editor — a drag-and-drop composition builder
 * with a live structural preview.
 *
 * Interaction: section cards reorder by dragging their grab handle (pointer +
 * keyboard via dnd-kit's SortableContext), with the up/down buttons retained as
 * the mobile + a11y fallback. Per-type config opens inline as an accordion on
 * the card, so add → configure → reorder stays on one surface. A compact preview
 * panel maps the composition to labeled bands in order (hidden ones ghosted, the
 * default phase-dependent middle slot badged) and updates live as you drag.
 *
 * Saves via `conference.updateHomepageSections`. "Revert to default" (confirmed)
 * clears the stored list so the page falls back to the phase-aware default.
 */

const inputClass =
  'block w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white'
const rowBtnClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800'

export interface HomepageSectionsEditorProps {
  /** Stored sections, or the computed default when none are stored yet. */
  initialSections: HomepageSection[]
  /** True when the conference has no stored composition (rendering the default). */
  usingDefault: boolean
  defaultOpen?: boolean
}

export function HomepageSectionsEditor({
  initialSections,
  usingDefault,
  defaultOpen = false,
}: HomepageSectionsEditorProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const dndId = useId()

  const [isOpen, setIsOpen] = useState(defaultOpen)
  // Rows are materialized ONCE: `toEditorRows` generates keys for keyless
  // stored sections, so a second call would mint DIFFERENT keys — the dirty
  // baseline below must be derived from this same array or the form would
  // read as dirty the moment it opens.
  const [initialRows, setInitialRows] = useState<EditorRow[]>(() =>
    toEditorRows(initialSections),
  )
  const [rows, setRows] = useState<EditorRow[]>(initialRows)
  const [addType, setAddType] =
    useState<HomepageSectionType>('homepageCtaBanner')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmingRevert, setConfirmingRevert] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  // Live drag state: the id being dragged and the id it is currently over, used
  // to PROJECT the in-progress order into the preview without disturbing the
  // sortable list (which animates itself via transforms).
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  // The composition serialized at open time; the unsaved-changes guard compares
  // the live rows against it. Derived from the SAME materialized rows (stable
  // generated keys) and memoized — serialization must not rerun on the
  // high-frequency renders dnd emits while dragging.
  const initialSignature = useMemo(
    () => serializeRows(initialRows),
    [initialRows],
  )
  const isDirty = useMemo(
    () => serializeRows(rows) !== initialSignature,
    [rows, initialSignature],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const mutation = api.conference.updateHomepageSections.useMutation({
    onSuccess: () => {
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Homepage updated',
        message: 'Section composition saved.',
      })
      setIsOpen(false)
    },
    onError: (error) => {
      setSubmitError(error.message || 'Failed to save. Please try again.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: error.message || 'Failed to save homepage sections.',
      })
    },
  })

  const reset = () => {
    // Restore the SAME materialized rows (not a fresh toEditorRows call, which
    // would mint new keys and desync the dirty baseline).
    setRows(initialRows)
    setSubmitError(null)
    setExpanded(new Set())
    setActiveKey(null)
    setOverKey(null)
  }
  const open = () => {
    // Re-materialize from the CURRENT props: after a save, router.refresh()
    // delivers the updated composition, and reopening must show and baseline
    // against that — not the rows captured at first mount.
    const fresh = toEditorRows(initialSections)
    setInitialRows(fresh)
    setRows(fresh)
    setConfirmingCancel(false)
    setConfirmingRevert(false)
    setSubmitError(null)
    setExpanded(new Set())
    setActiveKey(null)
    setOverKey(null)
    setIsOpen(true)
  }
  const close = () => {
    setIsOpen(false)
    setConfirmingCancel(false)
    setConfirmingRevert(false)
    reset()
  }
  /**
   * The ONE dirty guard for every close path: the Cancel button AND the
   * shell's backdrop/Escape/X all route here (the shell's built-in
   * confirm-on-dirty overlay is intentionally NOT enabled — two mechanisms
   * would stack confirmations). Unsaved changes are never discarded without
   * an explicit choice.
   */
  const cancel = () => {
    if (isDirty) {
      setConfirmingCancel(true)
      return
    }
    close()
  }

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const patchRow = (key: string, patch: Partial<EditorRow>) =>
    setRows((prev) =>
      prev.map((r) => (r._key === key ? { ...r, ...patch } : r)),
    )
  const move = (from: number, to: number) =>
    setRows((prev) => moveByIndex(prev, from, to))
  const remove = (key: string) => {
    setRows((prev) => prev.filter((r) => r._key !== key))
    setExpanded((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }
  const add = () => {
    const key = nextKey()
    setRows((prev) => [...prev, { _key: key, _type: addType }])
    // Auto-expand a freshly added configurable block so add → configure flows
    // without a second click.
    if (isConfigurable(addType)) {
      setExpanded((prev) => new Set(prev).add(key))
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveKey(String(event.active.id))
    setOverKey(String(event.active.id))
  }
  const handleDragOver = (event: DragOverEvent) => {
    setOverKey(event.over ? String(event.over.id) : null)
  }
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveKey(null)
    setOverKey(null)
    if (!over || active.id === over.id) return
    setRows((prev) => reorderByKey(prev, String(active.id), String(over.id)))
  }
  const handleDragCancel = () => {
    setActiveKey(null)
    setOverKey(null)
  }

  const validate = (): string | null => {
    for (const r of rows) {
      if (r._type === 'homepageCtaBanner') {
        if (!r.heading?.trim()) return 'CTA banner needs a heading.'
        if (!r.buttonLabel?.trim()) return 'CTA banner needs a button label.'
        if (!r.buttonHref?.trim()) return 'CTA banner needs a button link.'
      }
      if (r._type === 'homepageRichText') {
        if (!r.content || r.content.length === 0)
          return 'Rich text block needs content.'
      }
    }
    return null
  }

  const save = () => {
    setSubmitError(null)
    const err = validate()
    if (err) {
      setSubmitError(err)
      return
    }
    // Saving an EMPTY composition is server-side "unset → revert to default" —
    // route it through the same confirmation as the explicit Revert button
    // rather than silently discarding the stored composition.
    if (rows.length === 0) {
      setConfirmingRevert(true)
      return
    }
    mutation.mutate({ homepageSections: toPayload(rows) as never })
  }

  const revertToDefault = () => {
    setConfirmingRevert(false)
    setSubmitError(null)
    mutation.mutate({ homepageSections: [] })
  }

  // The preview reflects the in-progress order while dragging (projected from
  // active/over) and the committed order otherwise. Cheap: a labeled-box map.
  const previewRows = useMemo(
    () => (activeKey ? reorderByKey(rows, activeKey, overKey) : rows),
    [rows, activeKey, overKey],
  )
  const previewBands = useMemo(
    () => toPreviewBands(previewRows, usingDefault),
    [previewRows, usingDefault],
  )

  const activeRow = activeKey
    ? rows.find((r) => r._key === activeKey)
    : undefined

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Edit Homepage Sections"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={cancel}
        size="4xl"
        title="Edit Homepage Sections"
        subtitle="Compose, reorder and preview the front-page blocks"
        icon={<PencilSquareIcon className="h-5 w-5" />}
      >
        <div className="space-y-4">
          {usingDefault ? (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              Using the default layout — customize below to override it. “Revert
              to default” restores the automatic phase-aware layout at any time.
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
            {/* Section list (drag + fallback controls) */}
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
                  onDragCancel={handleDragCancel}
                >
                  <SortableContext
                    items={rows.map((r) => r._key)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="space-y-3">
                      {rows.map((row, index) => (
                        <SortableSectionCard
                          key={row._key}
                          row={row}
                          index={index}
                          total={rows.length}
                          expanded={expanded.has(row._key)}
                          onToggleExpanded={() => toggleExpanded(row._key)}
                          onPatch={(p) => patchRow(row._key, p)}
                          onToggleHidden={() =>
                            patchRow(row._key, { hidden: !row.hidden })
                          }
                          onMoveUp={() => move(index, index - 1)}
                          onMoveDown={() => move(index, index + 1)}
                          onRemove={() => remove(row._key)}
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
                  onChange={(e) =>
                    setAddType(e.target.value as HomepageSectionType)
                  }
                  aria-label="Section type to add"
                  className={`${inputClass} w-auto`}
                >
                  {HOMEPAGE_SECTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SECTION_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={add}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-300"
                >
                  <PlusIcon className="h-5 w-5" />
                  Add section
                </button>
              </div>
            </div>

            {/* Live structural preview */}
            <CompositionPreview
              bands={previewBands}
              usingDefault={usingDefault}
            />
          </div>

          {submitError ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setConfirmingRevert(true)}
              disabled={mutation.isPending}
              className="min-h-[44px]"
            >
              Revert to default
            </AdminButton>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <AdminButton
                type="button"
                variant="secondary"
                size="md"
                onClick={cancel}
                disabled={mutation.isPending}
                className="min-h-[44px]"
              >
                Cancel
              </AdminButton>
              <AdminButton
                type="button"
                color="blue"
                size="md"
                onClick={save}
                disabled={mutation.isPending}
                className="min-h-[44px]"
              >
                {mutation.isPending ? 'Saving…' : 'Save'}
              </AdminButton>
            </div>
          </div>
        </div>
      </ModalShell>

      <ConfirmationModal
        isOpen={confirmingRevert}
        onClose={() => setConfirmingRevert(false)}
        onConfirm={revertToDefault}
        title="Revert to default layout?"
        message="This clears your saved composition and restores the automatic, phase-aware homepage. This cannot be undone."
        confirmButtonText="Revert to default"
        variant="warning"
        isLoading={mutation.isPending}
      />

      <ConfirmationModal
        isOpen={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        onConfirm={close}
        title="Discard unsaved changes?"
        message="Your homepage composition changes have not been saved."
        confirmButtonText="Discard changes"
        variant="warning"
      />
    </>
  )
}

/** One draggable/sortable section card, with inline accordion config. */
function SortableSectionCard({
  row,
  index,
  total,
  expanded,
  onToggleExpanded,
  onPatch,
  onToggleHidden,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  row: EditorRow
  index: number
  total: number
  expanded: boolean
  onToggleExpanded: () => void
  onPatch: (patch: Partial<EditorRow>) => void
  onToggleHidden: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
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
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border bg-white dark:bg-gray-800/40 ${
        isDragging
          ? 'z-10 border-brand-cloud-blue opacity-50'
          : 'border-gray-200 dark:border-gray-700'
      } ${row.hidden ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-1 p-2 sm:gap-2 sm:p-3">
        {/* Grab handle: dnd-kit attributes + listeners on the focusable button so
            Enter/Space starts a keyboard drag; up/down buttons remain the mobile
            + a11y fallback. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${label} to reorder`}
          className="hidden h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue active:cursor-grabbing sm:inline-flex dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
            <span className="text-gray-400 tabular-nums">{index + 1}.</span>{' '}
            {label}
          </span>
          {row.hidden ? (
            <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              Hidden
            </span>
          ) : null}
        </div>

        <div className="flex items-center">
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

      {configurable && expanded ? (
        <div className="border-t border-gray-200 px-3 pt-2 pb-3 dark:border-gray-700">
          <SectionConfig row={row} onChange={onPatch} />
        </div>
      ) : null}
    </li>
  )
}

/** Compact structural preview — labeled bands in order, hidden ones ghosted. */
function CompositionPreview({
  bands,
  usingDefault,
}: {
  bands: PreviewBand[]
  usingDefault: boolean
}) {
  const visibleCount = bands.filter((b) => !b.hidden).length
  return (
    <aside
      aria-label="Homepage structure preview"
      className="rounded-lg border border-gray-200 bg-gray-50 p-3 lg:sticky lg:top-0 lg:self-start dark:border-gray-700 dark:bg-gray-900/40"
    >
      <p className="mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
        Page structure
      </p>
      {bands.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Nothing to preview.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {bands.map((band, i) => (
            <li
              key={band.key}
              className={`rounded-md border px-2.5 py-2 text-xs font-medium ${
                band.hidden
                  ? 'border-dashed border-gray-300 bg-transparent text-gray-400 dark:border-gray-600 dark:text-gray-500'
                  : 'border-transparent bg-white text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{band.label}</span>
                {band.hidden ? (
                  <span className="shrink-0 text-[10px] tracking-wide uppercase">
                    hidden
                  </span>
                ) : null}
              </div>
              {band.isPhaseSlot ? (
                <p className="mt-1 text-[10px] leading-tight text-brand-cloud-blue dark:text-blue-400">
                  Auto-swaps with the conference phase
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[11px] leading-tight text-gray-400 dark:text-gray-500">
        {visibleCount} visible section{visibleCount === 1 ? '' : 's'}
        {usingDefault ? ' · default layout' : ''}
      </p>
    </aside>
  )
}

/** Per-type config editor. Only reached for configurable blocks (accordion). */
function SectionConfig({
  row,
  onChange,
}: {
  row: EditorRow
  onChange: (patch: Partial<EditorRow>) => void
}) {
  if (row._type === 'homepageHero') {
    const ctas = row.ctaOverrides ?? []
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heroHeadline ?? ''}
          onChange={(e) => onChange({ heroHeadline: e.target.value })}
          placeholder="Headline override (optional)"
          aria-label="Hero headline override"
          className={inputClass}
        />
        <textarea
          value={row.heroSubheadline ?? ''}
          onChange={(e) => onChange({ heroSubheadline: e.target.value })}
          placeholder="Subheadline override (optional)"
          aria-label="Hero subheadline override"
          rows={2}
          className={inputClass}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          CTA button overrides (optional — leave empty for smart phase buttons):
        </p>
        {ctas.map((cta, i) => (
          <div key={cta._key} className="flex items-start gap-1">
            <input
              type="text"
              value={cta.label}
              onChange={(e) =>
                onChange({
                  ctaOverrides: ctas.map((c, j) =>
                    j === i ? { ...c, label: e.target.value } : c,
                  ),
                })
              }
              placeholder="Label"
              aria-label={`CTA ${i + 1} label`}
              className={inputClass}
            />
            <input
              type="text"
              value={cta.href}
              onChange={(e) =>
                onChange({
                  ctaOverrides: ctas.map((c, j) =>
                    j === i ? { ...c, href: e.target.value } : c,
                  ),
                })
              }
              placeholder="/tickets"
              aria-label={`CTA ${i + 1} link`}
              className={inputClass}
            />
            <button
              type="button"
              className={`${rowBtnClass} hover:text-red-600`}
              onClick={() =>
                onChange({ ctaOverrides: ctas.filter((_, j) => j !== i) })
              }
              aria-label={`Remove CTA ${i + 1}`}
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ctaOverrides: [...ctas, { _key: nextKey(), label: '', href: '' }],
            })
          }
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand-cloud-blue"
        >
          <PlusIcon className="h-4 w-4" /> Add CTA
        </button>
      </div>
    )
  }

  if (row._type === 'homepageCtaBanner') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading *"
          aria-label="CTA banner heading"
          className={inputClass}
        />
        <textarea
          value={row.body ?? ''}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder="Body (optional)"
          aria-label="CTA banner body"
          rows={2}
          className={inputClass}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={row.buttonLabel ?? ''}
            onChange={(e) => onChange({ buttonLabel: e.target.value })}
            placeholder="Button label *"
            aria-label="CTA banner button label"
            className={inputClass}
          />
          <input
            type="text"
            value={row.buttonHref ?? ''}
            onChange={(e) => onChange({ buttonHref: e.target.value })}
            placeholder="Button link *"
            aria-label="CTA banner button link"
            className={inputClass}
          />
        </div>
      </div>
    )
  }

  if (row._type === 'homepageRichText') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional)"
          aria-label="Rich text heading"
          className={inputClass}
        />
        <PortableTextEditor
          label="Content"
          value={row.content ?? []}
          onChange={(blocks) => onChange({ content: blocks })}
          compact
        />
      </div>
    )
  }

  if (row._type === 'homepageSaveTheDate') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional — default “Save the date”)"
          aria-label="Save the date heading"
          className={inputClass}
        />
        <textarea
          rows={2}
          value={row.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Description (optional — extra copy, no default)"
          aria-label="Save the date description"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Shows the dates, venue, a countdown, and what happens next (call for
          speakers, programme, tickets) from the dates already configured. Steps
          with no date are left out rather than shown as unknown. The
          description is an extra line on top of that — leave it empty and the
          card simply shows no extra line.
        </p>
      </div>
    )
  }

  if (row._type === 'homepageMetrics') {
    return (
      <div>
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional)"
          aria-label="Metrics heading"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Uses the vanity metrics configured elsewhere on this page.
        </p>
      </div>
    )
  }

  if (row._type === 'homepageFaq') {
    const source = row.source ?? 'own'
    const items = row.faqItems ?? []
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional — default “Frequently asked questions”)"
          aria-label="FAQ heading"
          className={inputClass}
        />
        <select
          value={source}
          onChange={(e) =>
            onChange({ source: e.target.value as 'own' | 'ticketFaqs' })
          }
          aria-label="FAQ source"
          className={inputClass}
        >
          <option value="own">Use this block&rsquo;s own items</option>
          <option value="ticketFaqs">Reuse the ticket FAQs</option>
        </select>
        {source === 'ticketFaqs' ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Renders the FAQs configured on the tickets page — nothing to edit
            here.
          </p>
        ) : (
          <>
            {items.map((item, i) => (
              <div
                key={item._key}
                className="space-y-1 rounded-lg border border-gray-200 p-2 dark:border-gray-700"
              >
                <div className="flex items-start gap-1">
                  <input
                    type="text"
                    value={item.question}
                    onChange={(e) =>
                      onChange({
                        faqItems: items.map((it, j) =>
                          j === i ? { ...it, question: e.target.value } : it,
                        ),
                      })
                    }
                    placeholder="Question"
                    aria-label={`FAQ ${i + 1} question`}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    className={`${rowBtnClass} hover:text-red-600`}
                    onClick={() =>
                      onChange({ faqItems: items.filter((_, j) => j !== i) })
                    }
                    aria-label={`Remove FAQ ${i + 1}`}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
                <textarea
                  value={item.answer}
                  onChange={(e) =>
                    onChange({
                      faqItems: items.map((it, j) =>
                        j === i ? { ...it, answer: e.target.value } : it,
                      ),
                    })
                  }
                  placeholder="Answer"
                  aria-label={`FAQ ${i + 1} answer`}
                  rows={2}
                  className={inputClass}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onChange({
                  faqItems: [
                    ...items,
                    { _key: nextKey(), question: '', answer: '' },
                  ],
                })
              }
              className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand-cloud-blue"
            >
              <PlusIcon className="h-4 w-4" /> Add FAQ item
            </button>
          </>
        )}
      </div>
    )
  }

  if (row._type === 'homepageCountdown') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional)"
          aria-label="Countdown heading"
          className={inputClass}
        />
        <label className="block text-xs text-gray-500 dark:text-gray-400">
          Target date/time override (optional — defaults to the conference
          start)
          <input
            type="datetime-local"
            value={row.targetOverride ?? ''}
            onChange={(e) => onChange({ targetOverride: e.target.value })}
            aria-label="Countdown target override"
            className={`${inputClass} mt-1`}
          />
        </label>
        <input
          type="text"
          value={row.liveMessage ?? ''}
          onChange={(e) => onChange({ liveMessage: e.target.value })}
          placeholder="Live message after the target (blank to hide)"
          aria-label="Countdown live message"
          className={inputClass}
        />
      </div>
    )
  }

  if (
    row._type === 'homepageFeaturedSpeakers' ||
    row._type === 'homepageOrganizers' ||
    row._type === 'homepageGallery'
  ) {
    const label = SECTION_LABELS[row._type]
    const headingPlaceholder =
      row._type === 'homepageFeaturedSpeakers'
        ? 'Heading (optional — default “Featured Speakers”)'
        : row._type === 'homepageOrganizers'
          ? 'Heading (optional — default “Meet Our Organizers”)'
          : 'Heading (optional — default “Conference Moments”)'
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder={headingPlaceholder}
          aria-label={`${label} heading`}
          className={inputClass}
        />
        <textarea
          value={row.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Sub-heading (optional — leave blank for the default)"
          aria-label={`${label} sub-heading`}
          rows={2}
          className={inputClass}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Copy only — the {label.toLowerCase()} themselves come from the
          conference configuration.
        </p>
      </div>
    )
  }

  if (row._type === 'homepageSponsors') {
    const showCta = row.showCta !== false
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional — default “Our sponsors”)"
          aria-label="Sponsors heading"
          className={inputClass}
        />
        <textarea
          value={row.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Sub-heading (optional — leave blank for the default)"
          aria-label="Sponsors sub-heading"
          rows={2}
          className={inputClass}
        />
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showCta}
            onChange={(e) => onChange({ showCta: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600"
          />
          Show the “Become a Sponsor” call-to-action
        </label>
        {showCta ? (
          <>
            <input
              type="text"
              value={row.ctaHeading ?? ''}
              onChange={(e) => onChange({ ctaHeading: e.target.value })}
              placeholder="Call-to-action heading (optional — default “Become a Sponsor”)"
              aria-label="Sponsors call-to-action heading"
              className={inputClass}
            />
            <textarea
              value={row.ctaDescription ?? ''}
              onChange={(e) => onChange({ ctaDescription: e.target.value })}
              placeholder="Call-to-action body (optional — leave blank for the default)"
              aria-label="Sponsors call-to-action body"
              rows={3}
              className={inputClass}
            />
          </>
        ) : null}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Copy only — sponsor logos and tiers come from the conference
          configuration.
        </p>
      </div>
    )
  }

  if (row._type === 'homepageVenue') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional — default “Venue”)"
          aria-label="Venue heading"
          className={inputClass}
        />
        <textarea
          value={row.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Description (optional)"
          aria-label="Venue description"
          rows={2}
          className={inputClass}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Venue name and address come from the conference configuration. “Get
          directions” links to a map built from the address.
        </p>
      </div>
    )
  }

  return null
}
