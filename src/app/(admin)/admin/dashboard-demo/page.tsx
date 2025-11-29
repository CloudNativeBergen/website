'use client'

import { useState, useEffect, useCallback } from 'react'
import { Widget } from '@/lib/dashboard/types'
import { getColumnCountForWidth } from '@/lib/dashboard/grid-utils'
import { DashboardGrid } from '@/components/admin/dashboard/DashboardGrid'
import { WidgetContainer } from '@/components/admin/dashboard/WidgetContainer'
import { DummyStatsWidget } from '@/components/admin/dashboard/widgets/DummyStatsWidget'
import { DummyChartWidget } from '@/components/admin/dashboard/widgets/DummyChartWidget'
import { DummyListWidget } from '@/components/admin/dashboard/widgets/DummyListWidget'
import { DummyWideWidget } from '@/components/admin/dashboard/widgets/DummyWideWidget'
import { DummyTallWidget } from '@/components/admin/dashboard/widgets/DummyTallWidget'
import { PencilIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

const INITIAL_WIDGETS: Widget[] = [
  {
    id: 'stats-1',
    type: 'stats',
    title: 'Stats Widget',
    position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
  },
  {
    id: 'chart-1',
    type: 'chart',
    title: 'Chart Widget',
    position: { row: 0, col: 3, rowSpan: 4, colSpan: 6 },
  },
  {
    id: 'tall-1',
    type: 'tall',
    title: 'Vertical Card',
    position: { row: 0, col: 9, rowSpan: 4, colSpan: 3 },
  },
  {
    id: 'list-1',
    type: 'list',
    title: 'Activity List',
    position: { row: 2, col: 0, rowSpan: 2, colSpan: 3 },
  },
  {
    id: 'wide-1',
    type: 'wide',
    title: 'Wide Banner',
    position: { row: 4, col: 0, rowSpan: 2, colSpan: 12 },
  },
]

export default function DashboardDemoPage() {
  const [widgets, setWidgets] = useState<Widget[]>(INITIAL_WIDGETS)
  const [editMode, setEditMode] = useState(true)
  const [columnCount, setColumnCount] = useState(4)

  useEffect(() => {
    const handleResize = () => {
      const newColumnCount = getColumnCountForWidth(window.innerWidth)
      setColumnCount(newColumnCount)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleReset = useCallback(() => {
    setWidgets(INITIAL_WIDGETS)
  }, [])

  const handleWidgetsChange = useCallback((newWidgets: Widget[]) => {
    setWidgets(newWidgets)
  }, [])

  const handleResize = useCallback(
    (widgetId: string, newPosition: Widget['position']) => {
      setWidgets((prev) =>
        prev.map((w) => (w.id === widgetId ? { ...w, position: newPosition } : w)),
      )
    },
    [],
  )

  const renderWidget = useCallback(
    (widget: Widget, isDragging: boolean, cellWidth: number) => {
      let content: React.ReactNode

      switch (widget.type) {
        case 'stats':
          content = <DummyStatsWidget />
          break
        case 'chart':
          content = <DummyChartWidget />
          break
        case 'list':
          content = <DummyListWidget />
          break
        case 'wide':
          content = <DummyWideWidget />
          break
        case 'tall':
          content = <DummyTallWidget />
          break
        default:
          content = <div>Unknown widget type</div>
      }

      return (
        <WidgetContainer
          widget={widget}
          editMode={editMode}
          isDragging={isDragging}
          columnCount={columnCount}
          cellWidth={cellWidth}
          allWidgets={widgets}
          onResize={handleResize}
        >
          {content}
        </WidgetContainer>
      )
    },
    [editMode, columnCount, widgets, handleResize],
  )

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Dashboard Grid Demo
          </h1>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            Phase 0: Drag and resize widgets to customize your dashboard layout
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setEditMode(!editMode)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${editMode
              ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
          >
            <PencilIcon className="h-4 w-4" />
            {editMode ? 'Exit Edit Mode' : 'Edit Mode'}
          </button>

          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Reset Layout
          </button>
        </div>
      </div>

      <div className="mb-3 rounded-lg bg-blue-50 px-4 py-2 dark:bg-blue-900/20">
        <div className="text-xs text-blue-800 dark:text-blue-300">
          <span className="font-medium">Grid Configuration</span>
          {' • '}
          Current viewport: <strong>{columnCount} columns</strong>
          {' • '}
          Cell size: <strong>80px</strong>
          {' • '}
          Gap: <strong>16px</strong>
          {editMode && (
            <>
              {' • '}
              <span className="text-xs">Drag widgets by their handle or resize using the bottom-right corner</span>
            </>
          )}
        </div>
      </div>

      <DashboardGrid
        widgets={widgets}
        onWidgetsChange={handleWidgetsChange}
        columnCount={columnCount}
        editMode={editMode}
      >
        {renderWidget}
      </DashboardGrid>
    </div>
  )
}
