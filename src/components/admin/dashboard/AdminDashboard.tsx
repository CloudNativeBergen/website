'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Widget } from '@/lib/dashboard/types'
import { getColumnCountForWidth } from '@/lib/dashboard/grid-utils'
import { DASHBOARD_SAVE_DEBOUNCE_MS } from '@/lib/dashboard/constants'
import { DashboardGrid } from '@/components/admin/dashboard/DashboardGrid'
import { WidgetContainer } from '@/components/admin/dashboard/WidgetContainer'
import { WidgetErrorBoundary } from '@/components/admin/dashboard/WidgetErrorBoundary'
import { renderWidgetContent } from '@/components/admin/dashboard/widget-renderer'
import { WidgetPicker } from '@/components/admin/dashboard/WidgetPicker'
import { getWidgetMetadata } from '@/lib/dashboard/widget-registry'
import { findAvailablePosition } from '@/lib/dashboard/placement-utils'
import { PRESET_CONFIGS } from '@/lib/dashboard/presets'
import {
  PencilIcon,
  ArrowPathIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import { getCurrentPhase } from '@/lib/conference/phase'
import {
  loadDashboardConfig,
  saveDashboardConfig,
  type SerializedWidget,
} from '@/app/(admin)/admin/actions'

const DEFAULT_WIDGETS = PRESET_CONFIGS.planning.widgets

interface AdminDashboardProps {
  conference: Conference
}

export function AdminDashboard({ conference }: AdminDashboardProps) {
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS)
  const [editMode, setEditMode] = useState(false)
  const [columnCount, setColumnCount] = useState(4)
  const [showWidgetPicker, setShowWidgetPicker] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentPhase = getCurrentPhase(conference)

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

  // Load saved config on mount
  useEffect(() => {
    loadDashboardConfig(conference._id)
      .then((saved) => {
        if (saved && saved.length > 0) {
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
        setConfigLoaded(true)
      })
      .catch(() => setConfigLoaded(true))
  }, [conference._id])

  // Debounced save whenever widgets change (after initial load)
  const persistWidgets = useCallback(
    (widgetsToSave: Widget[]) => {
      if (!configLoaded) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const serialized: SerializedWidget[] = widgetsToSave.map((w) => ({
          id: w.id,
          type: w.type,
          title: w.title,
          position: w.position,
          config: w.config as Record<string, unknown> | undefined,
        }))
        saveDashboardConfig(conference._id, serialized).catch(() => {
          // Silently fail — widget state is still in React
        })
      }, DASHBOARD_SAVE_DEBOUNCE_MS)
    },
    [conference._id, configLoaded],
  )

  useEffect(() => {
    persistWidgets(widgets)
  }, [widgets, persistWidgets])

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      setColumnCount(getColumnCountForWidth(window.innerWidth))
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleReset = useCallback(() => {
    setWidgets(DEFAULT_WIDGETS)
    // persistWidgets will fire via the useEffect on widget change
  }, [])

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

      setWidgets((prev) => [...prev, newWidget])
      setShowWidgetPicker(false)
    },
    [widgets, columnCount],
  )

  const handleRemoveWidget = useCallback((widgetId: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId))
  }, [])

  const handleWidgetsChange = useCallback((newWidgets: Widget[]) => {
    setWidgets(newWidgets)
  }, [])

  const handleResize = useCallback(
    (widgetId: string, newPosition: Widget['position']) => {
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
      setWidgets((prev) =>
        prev.map((w) => (w.id === widgetId ? { ...w, config } : w)),
      )
    },
    [],
  )

  const renderWidget = useCallback(
    (widget: Widget, isDragging: boolean, cellWidth: number) => {
      return (
        <WidgetErrorBoundary widgetName={widget.title}>
          <WidgetContainer
            widget={widget}
            editMode={editMode}
            isDragging={isDragging}
            columnCount={columnCount}
            cellWidth={cellWidth}
            allWidgets={visibleWidgets}
            onResize={handleResize}
            onRemove={handleRemoveWidget}
            onConfigChange={handleConfigChange}
          >
            {renderWidgetContent(widget, conference)}
          </WidgetContainer>
        </WidgetErrorBoundary>
      )
    },
    [
      editMode,
      columnCount,
      visibleWidgets,
      handleResize,
      handleRemoveWidget,
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

      {/* Floating edit controls */}
      <div className="fixed right-6 bottom-6 z-40 flex items-center gap-2">
        {editMode && (
          <>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-lg transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Reset
            </button>

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
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium shadow-lg transition-colors ${editMode
              ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
        >
          <PencilIcon className="h-3.5 w-3.5" />
          {editMode ? 'Done' : 'Edit'}
        </button>
      </div>

      <DashboardGrid
        widgets={visibleWidgets}
        onWidgetsChange={handleWidgetsChange}
        columnCount={columnCount}
        editMode={editMode}
      >
        {renderWidget}
      </DashboardGrid>
    </div>
  )
}
