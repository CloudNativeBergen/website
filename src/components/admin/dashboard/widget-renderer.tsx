import { QuickActionsWidget } from '@/components/admin/dashboard/widgets/QuickActionsWidget'
import { UpcomingDeadlinesWidget } from '@/components/admin/dashboard/widgets/UpcomingDeadlinesWidget'
import { CFPHealthWidget } from '@/components/admin/dashboard/widgets/CFPHealthWidget'
import { TicketSalesDashboardWidget } from '@/components/admin/dashboard/widgets/TicketSalesDashboardWidget'
import { SpeakerEngagementWidget } from '@/components/admin/dashboard/widgets/SpeakerEngagementWidget'
import { SponsorPipelineWidget } from '@/components/admin/dashboard/widgets/SponsorPipelineWidget'
import { RecentActivityFeedWidget } from '@/components/admin/dashboard/widgets/RecentActivityFeedWidget'
import { ProposalPipelineWidget } from '@/components/admin/dashboard/widgets/ProposalPipelineWidget'
import { ReviewProgressWidget } from '@/components/admin/dashboard/widgets/ReviewProgressWidget'
import { TravelSupportQueueWidget } from '@/components/admin/dashboard/widgets/TravelSupportQueueWidget'
import { WorkshopCapacityWidget } from '@/components/admin/dashboard/widgets/WorkshopCapacityWidget'
import { ScheduleBuilderStatusWidget } from '@/components/admin/dashboard/widgets/ScheduleBuilderStatusWidget'
import type { Conference } from '@/lib/conference/types'
import type { Widget } from '@/lib/dashboard/types'

export function renderWidgetContent(
  widget: Widget,
  conference: Conference,
): React.ReactNode {
  switch (widget.type) {
    case 'quick-actions':
      return <QuickActionsWidget conference={conference} />
    case 'upcoming-deadlines':
      return <UpcomingDeadlinesWidget conference={conference} />
    case 'cfp-health':
      return (
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
    case 'ticket-sales':
      return <TicketSalesDashboardWidget conference={conference} />
    case 'speaker-engagement':
      return <SpeakerEngagementWidget conference={conference} />
    case 'sponsor-pipeline':
      return <SponsorPipelineWidget conference={conference} />
    case 'recent-activity':
      return <RecentActivityFeedWidget conference={conference} />
    case 'proposal-pipeline':
      return <ProposalPipelineWidget conference={conference} />
    case 'review-progress':
      return <ReviewProgressWidget conference={conference} />
    case 'travel-support':
      return <TravelSupportQueueWidget conference={conference} />
    case 'workshop-capacity':
      return <WorkshopCapacityWidget conference={conference} />
    case 'schedule-builder':
      return <ScheduleBuilderStatusWidget conference={conference} />
    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Widget not available
        </div>
      )
  }
}
