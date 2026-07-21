'use client'

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react'
import { Widget } from '@/lib/dashboard/types'
import {
  getColumnCountForWidth,
  reflowWidgetsForColumns,
} from '@/lib/dashboard/grid-utils'
import { GRID_CONFIG } from '@/lib/dashboard/constants'
import { DASHBOARD_SAVE_DEBOUNCE_MS } from '@/lib/dashboard/constants'
import { DashboardGrid } from '@/components/admin/dashboard/DashboardGrid'
import { WidgetContainer } from '@/components/admin/dashboard/WidgetContainer'
import { WidgetErrorBoundary } from '@/components/admin/dashboard/WidgetErrorBoundary'
import { renderWidgetContent } from '@/components/admin/dashboard/widget-renderer'
import { WidgetPicker } from '@/components/admin/dashboard/WidgetPicker'
import { PresetMenu } from '@/components/admin/dashboard/PresetMenu'
import { getWidgetMetadata } from '@/lib/dashboard/widget-registry'
import { findAvailablePosition } from '@/lib/dashboard/placement-utils'
import { ALL_PRESETS, PRESET_CONFIGS } from '@/lib/dashboard/presets'
import { PencilIcon, PlusIcon } from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import { getCurrentPhase } from '@/lib/conference/phase'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  loadDashboardConfig,
  saveDashboardConfig,
  type SerializedWidget,
} from '@/app/(admin)/admin/actions'

const DEFAULT_WIDGETS = PRESET_CONFIGS.planning.widgets

/**
 * Outcome of the initial loadDashboardConfig call. Persistence is only ever
 * enabled after a successful load ('loaded'): if the load FAILED we never saw
 * the stored layout, so any save would overwrite it with local defaults —
 * a silent data wipe. In that case saves stay disabled for the whole session.
 */
type LoadStatus = 'loading' | 'loaded' | 'failed'

interface AdminDashboardProps {
  conference: Conference
}

export function AdminDashboard({ conference }: AdminDashboardProps) {
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS)
  const [editMode, setEditMode] = useState(false)
  // Initial column count matters twice: this client component is still
  // SSR-rendered, so the server markup and the hydration render must agree
  // (initializing from window.innerWidth here would be a hydration mismatch on
  // non-desktop viewports). Both start from the desktop default; the layout
  // effect below measures the real viewport and corrects it BEFORE first
  // paint, so mobile never flashes the desktop layout. (The old initial value
  // of 4 matched no breakpoint at all and flashed a bogus 4-column layout.)
  const [columnCount, setColumnCount] = useState<number>(
    GRID_CONFIG.breakpoints.desktop.cols,
  )
  const [showWidgetPicker, setShowWidgetPicker] = useState(false)
  // Preset-apply confirmation. `selectedPresetKey` is intentionally NOT
  // cleared on close so the modal's text stays intact during the leave
  // transition; `presetConfirmOpen` alone controls visibility.
  const [presetConfirmOpen, setPresetConfirmOpen] = useState(false)
  const [selectedPresetKey, setSelectedPresetKey] = useState<string | null>(
    null,
  )
  // Widget-removal confirmation. Removal is single-click-destructive with no
  // undo (the toast API has no action buttons), so it must be confirmed.
  // `removeTarget` keeps the last target through the close transition.
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Widget | null>(null)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Widgets scheduled for the debounced save but not yet sent. Lets the
  // unmount cleanup FLUSH a pending save immediately instead of dropping
  // edits made less than the debounce interval before navigation.
  const pendingSaveRef = useRef<Widget[] | null>(null)

  // The user must be told when the layout won't persist, but the toast
  // context value has a new identity on every toast change; going through a
  // ref (kept current by the effect below) keeps `persistWidgets` (and the
  // persist effect) stable.
  const { showNotification } = useNotification()
  const showNotificationRef = useRef(showNotification)
  useEffect(() => {
    showNotificationRef.current = showNotification
  }, [showNotification])

  // True once the USER has changed the layout this session (add/remove/drag/
  // resize/config/reset). The persist effect below fires on EVERY `widgets`
  // change — including the mount-time default state and the load-applied
  // state — so without this flag the dashboard would echo freshly-loaded (or
  // default) widgets straight back to the server with zero user action.
  const dirtyRef = useRef(false)

  // Deduplicates the save-failure toast: notify on the first failure of a
  // burst, then stay quiet until a save succeeds again.
  const saveFailureNotifiedRef = useRef(false)

  const currentPhase = getCurrentPhase(conference)

  const selectedPreset = selectedPresetKey
    ? (ALL_PRESETS[selectedPresetKey] ?? null)
    : null

  const isDesktop = columnCount >= GRID_CONFIG.breakpoints.desktop.cols

  // Derive effective edit mode — disabled on mobile/tablet
  const effectiveEditMode = isDesktop && editMode

  // Filter out widgets that should be hidden in the current phase
  const visibleWidgets = useMemo(() => {
    return widgets.filter((w) => {
      const meta = getWidgetMetadata(w.type)
      if (!meta?.phaseConfig) return true
      const { hideInIrrelevantPhases, relevantPhases } = meta.phaseConfig
      if (!hideInIrrelevantPhases) return true
      return relevantPhases.includes(currentPhase)
    })
  }, [widgets, currentPhase])

  // Reflow widget positions for current column count
  const displayWidgets = useMemo(
    () => reflowWidgetsForColumns(visibleWidgets, columnCount),
    [visibleWidgets, columnCount],
  )

  // Load saved config on mount.
  //
  // Mount-time effect ordering with the persist effect below: this effect and
  // the persist effect both run on mount, and the persist effect re-runs when
  // this one resolves (setWidgets and/or setLoadStatus change its deps). None
  // of those runs may write: `dirtyRef` is still false, so the persist effect
  // is a no-op until the user actually mutates the layout.
  useEffect(() => {
    loadDashboardConfig()
      .then((saved) => {
        // `[]` is a DELIBERATELY EMPTY personal layout and must render an
        // empty grid — defaults apply only when NO config exists (null).
        if (saved) {
          setWidgets(
            saved.map((w) => ({
              id: w.id,
              type: w.type,
              title: w.title,
              position: w.position,
              config: w.config,
            })),
          )
        }
        setLoadStatus('loaded')
      })
      .catch(() => {
        // Load failed: we never saw the stored layout, so persisting anything
        // this session could overwrite it with defaults. Editing still works
        // locally; tell the user once that changes won't stick.
        setLoadStatus('failed')
        showNotificationRef.current({
          type: 'warning',
          title: "Couldn't load your dashboard layout",
          message:
            'Showing the default layout. Changes you make will not be saved this session.',
        })
      })
  }, [])

  // Serialize + fire the actual save. Stable helper (refs only) shared by the
  // debounce timer and the unmount flush so both send the same payload shape.
  const performSave = useCallback((widgetsToSave: Widget[]) => {
    pendingSaveRef.current = null
    const serialized: SerializedWidget[] = widgetsToSave.map((w) => ({
      id: w.id,
      type: w.type,
      title: w.title,
      position: w.position,
      config: w.config as Record<string, unknown> | undefined,
    }))
    saveDashboardConfig(serialized)
      .then(() => {
        saveFailureNotifiedRef.current = false
      })
      .catch(() => {
        // Widget state is still in React, so the layout keeps working
        // locally — but the user must know it didn't persist. Notify once
        // per failure burst, not on every debounced retry.
        if (!saveFailureNotifiedRef.current) {
          saveFailureNotifiedRef.current = true
          showNotificationRef.current({
            type: 'error',
            title: "Couldn't save your dashboard layout",
            message: 'Your latest changes are visible here but were not saved.',
          })
        }
      })
  }, [])

  // Debounced save after user edits (see gates below)
  const persistWidgets = useCallback(
    (widgetsToSave: Widget[]) => {
      // Persistence gates:
      // - loadStatus 'loading'/'failed': never save before a SUCCESSFUL load
      //   (saving would overwrite the stored layout with local state).
      // - dirtyRef false: this `widgets` change came from mount or from
      //   applying the loaded config, not from the user — persisting it would
      //   be a pointless echo-write of what the server just sent us.
      if (loadStatus !== 'loaded' || !dirtyRef.current) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      pendingSaveRef.current = widgetsToSave
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null
        if (pendingSaveRef.current) performSave(pendingSaveRef.current)
      }, DASHBOARD_SAVE_DEBOUNCE_MS)
    },
    [loadStatus, performSave],
  )

  useEffect(() => {
    persistWidgets(widgets)
  }, [widgets, persistWidgets])

  // On unmount: clear the debounce timer, then FLUSH any pending save
  // (fire-and-forget) so edits made less than the debounce interval before
  // navigating away are not silently dropped.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (pendingSaveRef.current) performSave(pendingSaveRef.current)
    }
  }, [performSave])

  // useLayoutEffect: the first measurement must land before the browser
  // paints, otherwise mobile briefly renders the desktop grid (see the
  // columnCount comment above). Subsequent resize events go through the same
  // handler. This never runs during SSR (client-only), so no server warning.
  useLayoutEffect(() => {
    const handleResize = () => {
      setColumnCount(getColumnCountForWidth(window.innerWidth))
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handlePresetSelect = useCallback((presetKey: string) => {
    setSelectedPresetKey(presetKey)
    setPresetConfirmOpen(true)
  }, [])

  // Destructive: replaces the whole layout with the chosen preset (and
  // persists it), so it only runs after explicit confirmation in the modal.
  const handleConfirmedPresetApply = useCallback(() => {
    const preset = selectedPresetKey ? ALL_PRESETS[selectedPresetKey] : null
    if (!preset) return
    dirtyRef.current = true
    // Clone positions so later in-place edits can never mutate the shared
    // preset module constants.
    setWidgets(
      preset.widgets.map((w) => ({ ...w, position: { ...w.position } })),
    )
    setPresetConfirmOpen(false)
    // persistWidgets will fire via the useEffect on widget change
  }, [selectedPresetKey])

  const handleAddWidget = useCallback(
    (widgetType: string) => {
      const metadata = getWidgetMetadata(widgetType)
      if (!metadata) return

      const position = findAvailablePosition(
        metadata.defaultSize.colSpan,
        metadata.defaultSize.rowSpan,
        widgets,
        columnCount,
      )

      const newWidget: Widget = {
        id: `${widgetType}-${Date.now()}`,
        type: widgetType,
        title: metadata.displayName,
        position,
        metadata,
      }

      dirtyRef.current = true
      setWidgets((prev) => [...prev, newWidget])
      setShowWidgetPicker(false)
    },
    [widgets, columnCount],
  )

  const handleRemoveRequest = useCallback(
    (widgetId: string) => {
      const target = widgets.find((w) => w.id === widgetId)
      if (!target) return
      setRemoveTarget(target)
      setRemoveConfirmOpen(true)
    },
    [widgets],
  )

  const handleConfirmedRemove = useCallback(() => {
    if (!removeTarget) return
    dirtyRef.current = true
    setWidgets((prev) => prev.filter((w) => w.id !== removeTarget.id))
    setRemoveConfirmOpen(false)
  }, [removeTarget])

  const handleWidgetsChange = useCallback((widgetsFromGrid: Widget[]) => {
    dirtyRef.current = true
    // MERGE the grid's array back into full state by id — never replace
    // wholesale. The grid only ever receives the phase-FILTERED display list
    // (`displayWidgets`), so its callback array is missing any widget hidden
    // in the current phase (`hideInIrrelevantPhases`); replacing state with it
    // would silently delete those hidden widgets on the next drag.
    setWidgets((prev) => {
      const fromGrid = new Map(widgetsFromGrid.map((w) => [w.id, w]))
      return prev.map((w) => fromGrid.get(w.id) ?? w)
    })
  }, [])

  const handleResize = useCallback(
    (widgetId: string, newPosition: Widget['position']) => {
      dirtyRef.current = true
      setWidgets((prev) =>
        prev.map((w) =>
          w.id === widgetId ? { ...w, position: newPosition } : w,
        ),
      )
    },
    [],
  )

  const handleConfigChange = useCallback(
    (widgetId: string, config: Record<string, unknown>) => {
      dirtyRef.current = true
      setWidgets((prev) =>
        prev.map((w) => (w.id === widgetId ? { ...w, config } : w)),
      )
    },
    [],
  )

  const renderWidget = useCallback(
    (widget: Widget, isDragging: boolean, cellWidth: number) => {
      return (
        <WidgetErrorBoundary key={widget.id} widgetName={widget.title}>
          <WidgetContainer
            widget={widget}
            editMode={effectiveEditMode}
            isDragging={isDragging}
            columnCount={columnCount}
            cellWidth={cellWidth}
            allWidgets={displayWidgets}
            onResize={handleResize}
            onRemove={handleRemoveRequest}
            onConfigChange={handleConfigChange}
          >
            {renderWidgetContent(widget, conference)}
          </WidgetContainer>
        </WidgetErrorBoundary>
      )
    },
    [
      effectiveEditMode,
      columnCount,
      displayWidgets,
      handleResize,
      handleRemoveRequest,
      handleConfigChange,
      conference,
    ],
  )

  return (
    <div className="relative min-h-screen">
      {showWidgetPicker && (
        <WidgetPicker
          onSelect={handleAddWidget}
          onClose={() => setShowWidgetPicker(false)}
        />
      )}

      <ConfirmationModal
        isOpen={presetConfirmOpen}
        onClose={() => setPresetConfirmOpen(false)}
        onConfirm={handleConfirmedPresetApply}
        title={`Apply "${selectedPreset?.name ?? ''}" layout?`}
        message={
          selectedPreset && selectedPreset.widgets.length === 0
            ? 'This removes every widget from your dashboard so you can start from scratch. This cannot be undone.'
            : `This replaces your current widgets and layout with the ${selectedPreset?.name ?? ''} preset. This cannot be undone.`
        }
        confirmButtonText="Apply layout"
        variant="danger"
      />

      <ConfirmationModal
        isOpen={removeConfirmOpen}
        onClose={() => setRemoveConfirmOpen(false)}
        onConfirm={handleConfirmedRemove}
        title="Remove widget?"
        message={`This removes the "${removeTarget?.title ?? ''}" widget from your dashboard. You can add it back later from the widget picker.`}
        confirmButtonText="Remove widget"
        variant="danger"
      />

      {/* Floating edit controls — desktop only */}
      {isDesktop && (
        <div className="fixed right-6 bottom-6 z-40 flex items-center gap-2">
          {editMode && (
            <>
              <PresetMenu onSelect={handlePresetSelect} />

              <button
                onClick={() => setShowWidgetPicker(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-lg transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add
              </button>
            </>
          )}

          <button
            onClick={() => setEditMode(!editMode)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium shadow-lg transition-colors ${
              editMode
                ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <PencilIcon className="h-3.5 w-3.5" />
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
      )}

      <DashboardGrid
        widgets={displayWidgets}
        onWidgetsChange={handleWidgetsChange}
        columnCount={columnCount}
        editMode={effectiveEditMode}
      >
        {renderWidget}
      </DashboardGrid>
    </div>
  )
}
