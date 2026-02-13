'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Widget } from '@/lib/dashboard/types'
import { getColumnCountForWidth } from '@/lib/dashboard/grid-utils'
import { DashboardGrid } from '@/components/admin/dashboard/DashboardGrid'
import { WidgetContainer } from '@/components/admin/dashboard/WidgetContainer'
import { WidgetErrorBoundary } from '@/components/admin/dashboard/WidgetErrorBoundary'
import { renderWidgetContent } from '@/components/admin/dashboard/widget-renderer'
import { WidgetPicker } from '@/components/admin/dashboard/WidgetPicker'
import { getWidgetMetadata } from '@/lib/dashboard/widget-registry'
import { findAvailablePosition } from '@/lib/dashboard/placement-utils'
import {
  ALL_PRESETS,
  PRESET_KEYS,
  PRESET_CONFIGS,
} from '@/lib/dashboard/presets'
import {
  PencilIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  Squares2X2Icon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import type { Conference } from '@/lib/conference/types'
import {
  getCurrentPhase,
  getPhaseName,
  getPhaseColor,
} from '@/lib/conference/phase'

const PHASES = [
  'initialization',
  'planning',
  'execution',
  'post-conference',
] as const

/**
 * Create a conference copy with date overrides to simulate a specific phase.
 * Uses the real conference _id so widgets fetch real data from Sanity.
 */
function createPhaseOverride(
  conference: Conference,
  phase: (typeof PHASES)[number],
): Conference {
  const now = new Date()
  const addDays = (days: number) =>
    new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

  const dateOverrides: Record<
    string,
    Pick<
      Conference,
      | 'cfpStartDate'
      | 'cfpEndDate'
      | 'cfpNotifyDate'
      | 'programDate'
      | 'startDate'
      | 'endDate'
    >
  > = {
    initialization: {
      cfpStartDate: addDays(50),
      cfpEndDate: addDays(120),
      cfpNotifyDate: addDays(150),
      programDate: addDays(180),
      startDate: addDays(247),
      endDate: addDays(248),
    },
    planning: {
      cfpStartDate: addDays(-30),
      cfpEndDate: addDays(30),
      cfpNotifyDate: addDays(45),
      programDate: addDays(60),
      startDate: addDays(90),
      endDate: addDays(91),
    },
    execution: {
      cfpStartDate: addDays(-120),
      cfpEndDate: addDays(-30),
      cfpNotifyDate: addDays(-15),
      programDate: addDays(-10),
      startDate: addDays(5),
      endDate: addDays(6),
    },
    'post-conference': {
      cfpStartDate: addDays(-210),
      cfpEndDate: addDays(-120),
      cfpNotifyDate: addDays(-105),
      programDate: addDays(-100),
      startDate: addDays(-10),
      endDate: addDays(-9),
    },
  }

  return { ...conference, ...dateOverrides[phase] }
}

interface DashboardDemoClientProps {
  conference: Conference
}

export function DashboardDemoClient({ conference }: DashboardDemoClientProps) {
  const [widgets, setWidgets] = useState<Widget[]>(
    PRESET_CONFIGS.planning.widgets,
  )
  const [editMode, setEditMode] = useState(true)
  const [columnCount, setColumnCount] = useState(4)
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0)
  const [currentPreset, setCurrentPreset] = useState<string>('planning')
  const [showWidgetPicker, setShowWidgetPicker] = useState(false)

  const activeConference = useMemo(
    () => createPhaseOverride(conference, PHASES[currentPhaseIndex]),
    [conference, currentPhaseIndex],
  )

  const currentPhase = getCurrentPhase(activeConference)
  const phaseName = getPhaseName(currentPhase)
  const phaseColor = getPhaseColor(currentPhase)
  const phaseLabel = `${PHASES[currentPhaseIndex]} (${phaseName})`

  useEffect(() => {
    const handleResize = () => {
      setColumnCount(getColumnCountForWidth(window.innerWidth))
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handlePhaseChange = useCallback((direction: 'prev' | 'next') => {
    setCurrentPhaseIndex((prev) =>
      direction === 'next'
        ? (prev + 1) % PHASES.length
        : (prev - 1 + PHASES.length) % PHASES.length,
    )
  }, [])

  const handleReset = useCallback(() => {
    setWidgets(ALL_PRESETS[currentPreset].widgets)
  }, [currentPreset])

  const handlePresetChange = useCallback((preset: string) => {
    setCurrentPreset(preset)
    setWidgets(ALL_PRESETS[preset].widgets)
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

  const handleResizeWidget = useCallback(
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
            allWidgets={widgets}
            onResize={handleResizeWidget}
            onRemove={handleRemoveWidget}
            onConfigChange={handleConfigChange}
          >
            {renderWidgetContent(widget, activeConference)}
          </WidgetContainer>
        </WidgetErrorBoundary>
      )
    },
    [
      editMode,
      columnCount,
      widgets,
      handleResizeWidget,
      handleRemoveWidget,
      handleConfigChange,
      activeConference,
    ],
  )

  return (
    <div className="min-h-screen">
      {showWidgetPicker && (
        <WidgetPicker
          onSelect={handleAddWidget}
          onClose={() => setShowWidgetPicker(false)}
        />
      )}

      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            Dashboard Playground
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {ALL_PRESETS[currentPreset].description} &bull; {phaseLabel}
          </p>
        </div>

        <div className="flex gap-2">
          {/* Preset Selector */}
          <div className="relative flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800">
            <Squares2X2Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            <select
              value={currentPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="appearance-none border-none bg-transparent py-0 pr-6 pl-1 text-xs font-semibold text-gray-900 focus:ring-0 focus:outline-none dark:text-white"
            >
              {PRESET_KEYS.map((key) => (
                <option key={key} value={key}>
                  {ALL_PRESETS[key].name}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
          </div>

          {/* Phase Selector */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800">
            <button
              onClick={() => handlePhaseChange('prev')}
              className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Previous phase"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
            </button>
            <span
              className={`min-w-30 px-2 text-center text-xs font-semibold ${phaseColor.text}`}
            >
              {phaseName}
            </span>
            <button
              onClick={() => handlePhaseChange('next')}
              className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Next phase"
            >
              <ChevronRightIcon className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setEditMode(!editMode)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                editMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              {editMode ? 'Exit Edit' : 'Edit'}
            </button>

            <button
              onClick={() => setShowWidgetPicker(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add Widget
            </button>

            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className="flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
          <div className="text-center">
            <Squares2X2Icon className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              No widgets yet
            </h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Get started by adding widgets to your dashboard
            </p>
            <button
              onClick={() => setShowWidgetPicker(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              <PlusIcon className="h-4 w-4" />
              Add Your First Widget
            </button>
          </div>
        </div>
      ) : (
        <DashboardGrid
          widgets={widgets}
          onWidgetsChange={handleWidgetsChange}
          columnCount={columnCount}
          editMode={editMode}
        >
          {renderWidget}
        </DashboardGrid>
      )}
    </div>
  )
}
