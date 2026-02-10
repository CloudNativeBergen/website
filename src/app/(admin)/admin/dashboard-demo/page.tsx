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
import { ContentCalendarWidget } from '@/components/admin/dashboard/widgets/ContentCalendarWidget'
import { GalleryManagementWidget } from '@/components/admin/dashboard/widgets/GalleryManagementWidget'
import { TeamStatusWidget } from '@/components/admin/dashboard/widgets/TeamStatusWidget'
import { VolunteerShiftsWidget } from '@/components/admin/dashboard/widgets/VolunteerShiftsWidget'
import { WidgetPicker } from '@/components/admin/dashboard/WidgetPicker'
import { getWidgetMetadata } from '@/lib/dashboard/widget-registry'
import { findAvailablePosition } from '@/lib/dashboard/placement-utils'
import {
  PencilIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Squares2X2Icon,
  PlusIcon,
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
        cfp_start_date: addDays(50),
        cfp_end_date: addDays(120),
        cfp_notify_date: addDays(150),
        program_date: addDays(180),
        start_date: addDays(247),
        end_date: addDays(248),
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

type PresetConfig = {
  name: string
  description: string
  widgets: Widget[]
}

const PRESET_CONFIGS: Record<string, PresetConfig> = {
  planning: {
    name: 'Planning Focus',
    description:
      'Sponsor pipeline, CFP preparation, speaker outreach, and early bird tickets',
    widgets: [
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
    ],
  },
  execution: {
    name: 'Execution Focus',
    description: 'Event operations, tickets, workshops, and volunteers',
    widgets: [
      {
        id: 'quick-actions',
        type: 'quick-actions',
        title: 'Quick Actions',
        position: { row: 0, col: 0, rowSpan: 2, colSpan: 3 },
      },
      {
        id: 'ticket-sales',
        type: 'ticket-sales',
        title: 'Ticket Sales',
        position: { row: 0, col: 3, rowSpan: 4, colSpan: 6 },
      },
      {
        id: 'upcoming-deadlines',
        type: 'upcoming-deadlines',
        title: 'Upcoming Deadlines',
        position: { row: 0, col: 9, rowSpan: 2, colSpan: 3 },
      },
      {
        id: 'schedule-status',
        type: 'schedule-status',
        title: 'Schedule Builder',
        position: { row: 2, col: 0, rowSpan: 3, colSpan: 3 },
      },
      {
        id: 'team-status',
        type: 'team-status',
        title: 'Team Status',
        position: { row: 2, col: 9, rowSpan: 3, colSpan: 3 },
      },
      {
        id: 'workshop-capacity',
        type: 'workshop-capacity',
        title: 'Workshop Capacity',
        position: { row: 4, col: 3, rowSpan: 3, colSpan: 4 },
      },
      {
        id: 'volunteer-shifts',
        type: 'volunteer-shifts',
        title: 'Volunteer Shifts',
        position: { row: 4, col: 7, rowSpan: 3, colSpan: 5 },
      },
      {
        id: 'gallery-management',
        type: 'gallery-management',
        title: 'Gallery Management',
        position: { row: 5, col: 0, rowSpan: 2, colSpan: 3 },
      },
      {
        id: 'recent-activity',
        type: 'recent-activity',
        title: 'Recent Activity',
        position: { row: 7, col: 0, rowSpan: 3, colSpan: 12 },
      },
    ],
  },
  financial: {
    name: 'Financial Focus',
    description: 'Sponsors, ticket revenue, and travel budgets',
    widgets: [
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
        position: { row: 0, col: 3, rowSpan: 4, colSpan: 6 },
      },
      {
        id: 'ticket-sales',
        type: 'ticket-sales',
        title: 'Ticket Sales',
        position: { row: 0, col: 9, rowSpan: 4, colSpan: 3 },
      },
      {
        id: 'travel-support',
        type: 'travel-support',
        title: 'Travel Support',
        position: { row: 2, col: 0, rowSpan: 3, colSpan: 3 },
      },
      {
        id: 'upcoming-deadlines',
        type: 'upcoming-deadlines',
        title: 'Upcoming Deadlines',
        position: { row: 4, col: 3, rowSpan: 2, colSpan: 6 },
      },
      {
        id: 'team-status',
        type: 'team-status',
        title: 'Team Status',
        position: { row: 4, col: 9, rowSpan: 2, colSpan: 3 },
      },
      {
        id: 'recent-activity',
        type: 'recent-activity',
        title: 'Recent Activity',
        position: { row: 6, col: 0, rowSpan: 3, colSpan: 12 },
      },
    ],
  },
  comprehensive: {
    name: 'Comprehensive',
    description: 'Balanced view across all conference domains',
    widgets: [
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
        position: { row: 12, col: 0, rowSpan: 4, colSpan: 6 },
      },
      {
        id: 'team-status',
        type: 'team-status',
        title: 'Team Status',
        position: { row: 12, col: 6, rowSpan: 4, colSpan: 3 },
      },
      {
        id: 'recent-activity',
        type: 'recent-activity',
        title: 'Recent Activity',
        position: { row: 12, col: 9, rowSpan: 4, colSpan: 3 },
      },
    ],
  },
}

const EMPTY_PRESET: PresetConfig = {
  name: 'Empty',
  description: 'Start from scratch and add your own widgets',
  widgets: [],
}

const ALL_PRESETS: Record<string, PresetConfig> = {
  planning: PRESET_CONFIGS.planning,
  execution: PRESET_CONFIGS.execution,
  financial: PRESET_CONFIGS.financial,
  comprehensive: PRESET_CONFIGS.comprehensive,
  empty: EMPTY_PRESET,
}

const INITIAL_WIDGETS: Widget[] = PRESET_CONFIGS.planning.widgets

const PRESET_KEYS = Object.keys(ALL_PRESETS)
export default function DashboardDemoPage() {
  const [widgets, setWidgets] = useState<Widget[]>(INITIAL_WIDGETS)
  const [editMode, setEditMode] = useState(true)
  const [columnCount, setColumnCount] = useState(4)
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0) // Start with 'initialization'
  const [currentPreset, setCurrentPreset] = useState<string>('planning')
  const [showWidgetPicker, setShowWidgetPicker] = useState(false)
  const [mockConference, setMockConference] = useState<Conference>(() =>
    createMockConference(PHASES[0]),
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

      // Find available position for the new widget
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
          content = <QuickActionsWidget conference={mockConference} />
          break
        case 'review-progress':
          content = <ReviewProgressWidget conference={mockConference} />
          break
        case 'proposal-pipeline':
          content = <ProposalPipelineWidget conference={mockConference} />
          break
        case 'upcoming-deadlines':
          content = <UpcomingDeadlinesWidget conference={mockConference} />
          break
        case 'cfp-health':
          content = (
            <CFPHealthWidget
              conference={mockConference}
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
        case 'schedule-status':
          content = <ScheduleBuilderStatusWidget conference={mockConference} />
          break
        case 'ticket-sales':
          content = <TicketSalesDashboardWidget conference={mockConference} />
          break
        case 'speaker-engagement':
          content = <SpeakerEngagementWidget conference={mockConference} />
          break
        case 'sponsor-pipeline':
          content = <SponsorPipelineWidget conference={mockConference} />
          break
        case 'workshop-capacity':
          content = <WorkshopCapacityWidget />
          break
        case 'travel-support':
          content = <TravelSupportQueueWidget />
          break
        case 'recent-activity':
          content = <RecentActivityFeedWidget conference={mockConference} />
          break
        case 'content-calendar':
          content = <ContentCalendarWidget conference={mockConference} />
          break
        case 'gallery-management':
          content = <GalleryManagementWidget conference={mockConference} />
          break
        case 'team-status':
          content = <TeamStatusWidget conference={mockConference} />
          break
        case 'volunteer-shifts':
          content = <VolunteerShiftsWidget conference={mockConference} />
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
      mockConference,
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
            {ALL_PRESETS[currentPreset].description} • {phaseLabel}
          </p>
        </div>

        <div className="flex gap-2">
          {/* Preset Selector */}
          <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800">
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
            <svg
              className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-gray-500 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
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
              className="min-w-30 px-2 text-center text-xs font-semibold"
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
