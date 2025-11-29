'use client'

import { useState, useEffect, useCallback } from 'react'
import { Widget } from '@/lib/dashboard/types'
import { getColumnCountForWidth } from '@/lib/dashboard/grid-utils'
import { DashboardGrid } from '@/components/admin/dashboard/DashboardGrid'
import { WidgetContainer } from '@/components/admin/dashboard/WidgetContainer'
import { WidgetErrorBoundary } from '@/components/admin/dashboard/WidgetErrorBoundary'
import { QuickActionsWidget } from '@/components/admin/dashboard/widgets/QuickActionsWidget'
import { ReviewProgressWidget } from '@/components/admin/dashboard/widgets/ReviewProgressWidget'
import { ProposalPipelineWidget } from '@/components/admin/dashboard/widgets/ProposalPipelineWidget'
import { UpcomingDeadlinesWidget } from '@/components/admin/dashboard/widgets/UpcomingDeadlinesWidget'
import { CFPHealthWidget } from '@/components/admin/dashboard/widgets/CFPHealthWidget'
import { ScheduleBuilderStatusWidget } from '@/components/admin/dashboard/widgets/ScheduleBuilderStatusWidget'
import { TicketSalesDashboardWidget } from '@/components/admin/dashboard/widgets/TicketSalesDashboardWidget'
import { SpeakerEngagementWidget } from '@/components/admin/dashboard/widgets/SpeakerEngagementWidget'
import { SponsorPipelineWidget } from '@/components/admin/dashboard/widgets/SponsorPipelineWidget'
import { WorkshopCapacityWidget } from '@/components/admin/dashboard/widgets/WorkshopCapacityWidget'
import { TravelSupportQueueWidget } from '@/components/admin/dashboard/widgets/TravelSupportQueueWidget'
import { RecentActivityFeedWidget } from '@/components/admin/dashboard/widgets/RecentActivityFeedWidget'
import { PencilIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

const INITIAL_WIDGETS: Widget[] = [
  {
    id: 'quick-actions',
    type: 'quick-actions',
    title: 'Quick Actions',
    position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
  },
  {
    id: 'review-progress',
    type: 'review-progress',
    title: 'Review Progress',
    position: { row: 0, col: 3, rowSpan: 2, colSpan: 3 },
  },
  {
    id: 'upcoming-deadlines',
    type: 'upcoming-deadlines',
    title: 'Upcoming Deadlines',
    position: { row: 0, col: 6, rowSpan: 2, colSpan: 6 },
  },
  {
    id: 'proposal-pipeline',
    type: 'proposal-pipeline',
    title: 'Proposal Pipeline',
    position: { row: 2, col: 0, rowSpan: 3, colSpan: 6 },
  },
  {
    id: 'cfp-health',
    type: 'cfp-health',
    title: 'CFP Health',
    position: { row: 2, col: 6, rowSpan: 3, colSpan: 6 },
  },
  {
    id: 'speaker-engagement',
    type: 'speaker-engagement',
    title: 'Speaker Engagement',
    position: { row: 5, col: 0, rowSpan: 3, colSpan: 4 },
  },
  {
    id: 'workshop-capacity',
    type: 'workshop-capacity',
    title: 'Workshop Capacity',
    position: { row: 5, col: 4, rowSpan: 3, colSpan: 4 },
  },
  {
    id: 'travel-support',
    type: 'travel-support',
    title: 'Travel Support',
    position: { row: 5, col: 8, rowSpan: 3, colSpan: 4 },
  },
  {
    id: 'sponsor-pipeline',
    type: 'sponsor-pipeline',
    title: 'Sponsor Pipeline',
    position: { row: 8, col: 0, rowSpan: 4, colSpan: 8 },
  },
  {
    id: 'schedule-status',
    type: 'schedule-status',
    title: 'Schedule Builder',
    position: { row: 8, col: 8, rowSpan: 4, colSpan: 4 },
  },
  {
    id: 'ticket-sales',
    type: 'ticket-sales',
    title: 'Ticket Sales',
    position: { row: 12, col: 0, rowSpan: 4, colSpan: 8 },
  },
  {
    id: 'recent-activity',
    type: 'recent-activity',
    title: 'Recent Activity',
    position: { row: 12, col: 8, rowSpan: 4, colSpan: 4 },
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
        prev.map((w) =>
          w.id === widgetId ? { ...w, position: newPosition } : w,
        ),
      )
    },
    [],
  )

  const renderWidget = useCallback(
    (widget: Widget, isDragging: boolean, cellWidth: number) => {
      let content: React.ReactNode

      switch (widget.type) {
        case 'quick-actions':
          content = <QuickActionsWidget />
          break
        case 'review-progress':
          content = <ReviewProgressWidget />
          break
        case 'proposal-pipeline':
          content = (
            <ProposalPipelineWidget
              data={{
                submitted: 147,
                accepted: 42,
                rejected: 28,
                confirmed: 35,
                total: 147,
                acceptanceRate: 28.6,
                pendingDecisions: 77,
              }}
            />
          )
          break
        case 'upcoming-deadlines':
          content = <UpcomingDeadlinesWidget />
          break
        case 'cfp-health':
          content = (
            <CFPHealthWidget
              data={{
                totalSubmissions: 147,
                submissionGoal: 200,
                daysRemaining: 12,
                averagePerDay: 4.2,
                submissionsPerDay: [
                  { date: '2024-01-01', count: 2 },
                  { date: '2024-01-02', count: 3 },
                  { date: '2024-01-03', count: 5 },
                  { date: '2024-01-04', count: 4 },
                  { date: '2024-01-05', count: 6 },
                  { date: '2024-01-06', count: 8 },
                  { date: '2024-01-07', count: 7 },
                  { date: '2024-01-08', count: 9 },
                  { date: '2024-01-09', count: 11 },
                  { date: '2024-01-10', count: 10 },
                  { date: '2024-01-11', count: 12 },
                  { date: '2024-01-12', count: 14 },
                  { date: '2024-01-13', count: 13 },
                  { date: '2024-01-14', count: 15 },
                ],
                formatDistribution: [
                  { format: 'Talk', count: 98 },
                  { format: 'Workshop', count: 32 },
                  { format: 'Lightning Talk', count: 17 },
                ],
              }}
            />
          )
          break
        case 'schedule-status':
          content = <ScheduleBuilderStatusWidget />
          break
        case 'ticket-sales':
          content = (
            <TicketSalesDashboardWidget
              data={{
                currentSales: 342,
                capacity: 500,
                percentage: 68.4,
                revenue: 85500,
                daysUntilEvent: 45,
                salesVelocity: 7.6,
                salesByDate: [],
                milestones: [],
              }}
            />
          )
          break
        case 'speaker-engagement':
          content = <SpeakerEngagementWidget />
          break
        case 'sponsor-pipeline':
          content = <SponsorPipelineWidget />
          break
        case 'workshop-capacity':
          content = <WorkshopCapacityWidget />
          break
        case 'travel-support':
          content = <TravelSupportQueueWidget />
          break
        case 'recent-activity':
          content = <RecentActivityFeedWidget />
          break
        default:
          content = <div>Unknown widget type: {widget.type}</div>
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
          >
            {content}
          </WidgetContainer>
        </WidgetErrorBoundary>
      )
    },
    [editMode, columnCount, widgets, handleResize],
  )

  return (
    <div className="min-h-screen">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>

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
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Reset
          </button>
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
