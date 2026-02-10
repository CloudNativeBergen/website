'use client'

import { useState, useEffect, useCallback } from 'react'
import { Widget } from '@/lib/dashboard/types'
import { getColumnCountForWidth } from '@/lib/dashboard/grid-utils'
import { DashboardGrid } from '@/components/admin/dashboard/DashboardGrid'
import { WidgetContainer } from '@/components/admin/dashboard/WidgetContainer'
import { WidgetErrorBoundary } from '@/components/admin/dashboard/WidgetErrorBoundary'
import { QuickActionsWidget } from '@/components/admin/dashboard/widgets/QuickActionsWidget'
import { UpcomingDeadlinesWidget } from '@/components/admin/dashboard/widgets/UpcomingDeadlinesWidget'
import { CFPHealthWidget } from '@/components/admin/dashboard/widgets/CFPHealthWidget'
import { TicketSalesDashboardWidget } from '@/components/admin/dashboard/widgets/TicketSalesDashboardWidget'
import { SpeakerEngagementWidget } from '@/components/admin/dashboard/widgets/SpeakerEngagementWidget'
import { SponsorPipelineWidget } from '@/components/admin/dashboard/widgets/SponsorPipelineWidget'
import { RecentActivityFeedWidget } from '@/components/admin/dashboard/widgets/RecentActivityFeedWidget'
import { WidgetPicker } from '@/components/admin/dashboard/WidgetPicker'
import { getWidgetMetadata } from '@/lib/dashboard/widget-registry'
import { findAvailablePosition } from '@/lib/dashboard/placement-utils'
import {
  PencilIcon,
  ArrowPathIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import {
  getCurrentPhase,
  getPhaseName,
  getPhaseColor,
} from '@/lib/conference/phase'

const PLANNING_WIDGETS: Widget[] = [
  {
    id: 'quick-actions',
    type: 'quick-actions',
    title: 'Quick Actions',
    position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
  },
  {
    id: 'sponsor-pipeline',
    type: 'sponsor-pipeline',
    title: 'Sponsor Pipeline',
    position: { row: 0, col: 3, rowSpan: 4, colSpan: 5 },
  },
  {
    id: 'upcoming-deadlines',
    type: 'upcoming-deadlines',
    title: 'Upcoming Deadlines',
    position: { row: 0, col: 8, rowSpan: 3, colSpan: 4 },
  },
  {
    id: 'cfp-health',
    type: 'cfp-health',
    title: 'CFP Health',
    position: { row: 2, col: 0, rowSpan: 3, colSpan: 3 },
  },
  {
    id: 'speaker-engagement',
    type: 'speaker-engagement',
    title: 'Speaker Outreach',
    position: { row: 3, col: 8, rowSpan: 4, colSpan: 4 },
  },
  {
    id: 'ticket-sales',
    type: 'ticket-sales',
    title: 'Ticket Sales',
    position: { row: 4, col: 3, rowSpan: 3, colSpan: 5 },
  },
  {
    id: 'recent-activity',
    type: 'recent-activity',
    title: 'Recent Activity',
    position: { row: 5, col: 0, rowSpan: 2, colSpan: 3 },
  },
]

interface AdminDashboardProps {
  conference: Conference
}

export function AdminDashboard({ conference }: AdminDashboardProps) {
  const [widgets, setWidgets] = useState<Widget[]>(PLANNING_WIDGETS)
  const [editMode, setEditMode] = useState(false)
  const [columnCount, setColumnCount] = useState(4)
  const [showWidgetPicker, setShowWidgetPicker] = useState(false)

  const currentPhase = getCurrentPhase(conference)
  const phaseName = getPhaseName(currentPhase)
  const phaseColor = getPhaseColor(currentPhase)

  useEffect(() => {
    const handleResize = () => {
      setColumnCount(getColumnCountForWidth(window.innerWidth))
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleReset = useCallback(() => {
    setWidgets(PLANNING_WIDGETS)
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
      let content: React.ReactNode

      switch (widget.type) {
        case 'quick-actions':
          content = <QuickActionsWidget conference={conference} />
          break
        case 'upcoming-deadlines':
          content = <UpcomingDeadlinesWidget conference={conference} />
          break
        case 'cfp-health':
          content = (
            <CFPHealthWidget
              conference={conference}
              config={
                widget.config as {
                  submissionTarget?: number
                  showTrend?: boolean
                  showFormatBreakdown?: boolean
                }
              }
            />
          )
          break
        case 'ticket-sales':
          content = <TicketSalesDashboardWidget conference={conference} />
          break
        case 'speaker-engagement':
          content = <SpeakerEngagementWidget conference={conference} />
          break
        case 'sponsor-pipeline':
          content = <SponsorPipelineWidget conference={conference} />
          break
        case 'recent-activity':
          content = <RecentActivityFeedWidget conference={conference} />
          break
        default:
          content = (
            <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              Widget not available
            </div>
          )
      }

      return (
        <WidgetErrorBoundary widgetName={widget.title}>
          <WidgetContainer
            widget={widget}
            editMode={editMode}
            isDragging={isDragging}
            columnCount={columnCount}
            cellWidth={cellWidth}
            allWidgets={widgets}
            onResize={handleResize}
            onRemove={handleRemoveWidget}
            onConfigChange={handleConfigChange}
          >
            {content}
          </WidgetContainer>
        </WidgetErrorBoundary>
      )
    },
    [
      editMode,
      columnCount,
      widgets,
      handleResize,
      handleRemoveWidget,
      handleConfigChange,
      conference,
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
            Dashboard
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {conference.title} &mdash;{' '}
            <span style={{ color: phaseColor.text }}>{phaseName}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setEditMode(!editMode)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${editMode
                ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
          >
            <PencilIcon className="h-3.5 w-3.5" />
            {editMode ? 'Exit Edit' : 'Edit'}
          </button>

          {editMode && (
            <>
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
