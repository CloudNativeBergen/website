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
import {
  PencilIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { Conference } from '@/lib/conference/types'
import { Format } from '@/lib/proposal/types'
import {
  getCurrentPhase,
  getPhaseName,
  getPhaseColor,
} from '@/lib/conference/phase'

// Mock conference creator for phase simulation
const createMockConference = (
  phase: 'initialization' | 'planning' | 'execution' | 'post-conference',
): Conference => {
  const now = new Date()
  const addDays = (days: number) =>
    new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

  const baseConference: Partial<Conference> = {
    _id: `conf-${phase}`,
    title: `Cloud Native Bergen 2025 (${phase})`,
    organizer: 'Cloud Native Bergen',
    city: 'Bergen',
    country: 'Norway',
    cfp_email: 'cfp@cloudnativebergen.no',
    contact_email: 'info@cloudnativebergen.no',
    registration_enabled: phase === 'execution' || phase === 'post-conference',
    registration_link:
      phase === 'execution' || phase === 'post-conference'
        ? 'https://tickets.cloudnativebergen.no'
        : undefined,
    domains: ['2025.cloudnativebergen.no'],
    formats: [
      Format.presentation_20,
      Format.presentation_45,
      Format.workshop_120,
    ],
    topics: [],
    organizers: [],
  }

  switch (phase) {
    case 'initialization':
      return {
        ...baseConference,
        cfp_start_date: addDays(30),
        cfp_end_date: addDays(120),
        cfp_notify_date: addDays(135),
        program_date: addDays(150),
        start_date: addDays(180),
        end_date: addDays(181),
      } as Conference

    case 'planning':
      return {
        ...baseConference,
        cfp_start_date: addDays(-30),
        cfp_end_date: addDays(30),
        cfp_notify_date: addDays(45),
        program_date: addDays(60),
        start_date: addDays(90),
        end_date: addDays(91),
      } as Conference

    case 'execution':
      return {
        ...baseConference,
        cfp_start_date: addDays(-120),
        cfp_end_date: addDays(-30),
        cfp_notify_date: addDays(-15),
        program_date: addDays(-10),
        start_date: addDays(5),
        end_date: addDays(6),
      } as Conference

    case 'post-conference':
      return {
        ...baseConference,
        cfp_start_date: addDays(-210),
        cfp_end_date: addDays(-120),
        cfp_notify_date: addDays(-105),
        program_date: addDays(-100),
        start_date: addDays(-10),
        end_date: addDays(-9),
      } as Conference
  }
}

const PHASES = [
  'initialization',
  'planning',
  'execution',
  'post-conference',
] as const

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
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(1) // Start with 'planning'
  const [mockConference, setMockConference] = useState<Conference>(() =>
    createMockConference(PHASES[1]),
  )

  useEffect(() => {
    const handleResize = () => {
      const newColumnCount = getColumnCountForWidth(window.innerWidth)
      setColumnCount(newColumnCount)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handlePhaseChange = useCallback((direction: 'prev' | 'next') => {
    setCurrentPhaseIndex((prev) => {
      const newIndex =
        direction === 'next'
          ? (prev + 1) % PHASES.length
          : (prev - 1 + PHASES.length) % PHASES.length
      setMockConference(createMockConference(PHASES[newIndex]))
      return newIndex
    })
  }, [])

  const currentPhase = getCurrentPhase(mockConference)
  const phaseName = getPhaseName(currentPhase)
  const phaseColor = getPhaseColor(currentPhase)
  const phaseLabel = `${PHASES[currentPhaseIndex]} (${phaseName})`

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
          content = <QuickActionsWidget conference={mockConference} />
          break
        case 'review-progress':
          content = <ReviewProgressWidget conference={mockConference} />
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
          content = <CFPHealthWidget conference={mockConference} />
          break
        case 'schedule-status':
          content = <ScheduleBuilderStatusWidget conference={mockConference} />
          break
        case 'ticket-sales':
          content = (
            <TicketSalesDashboardWidget
              conference={mockConference}
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
          content = <SpeakerEngagementWidget conference={mockConference} />
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
    [editMode, columnCount, widgets, handleResize, mockConference],
  )

  return (
    <div className="min-h-screen">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Phase simulation enabled - {phaseLabel}
          </p>
        </div>

        <div className="flex gap-2">
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
              className="min-w-[120px] px-2 text-center text-xs font-semibold"
              style={{ color: phaseColor.text }}
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
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${editMode
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
