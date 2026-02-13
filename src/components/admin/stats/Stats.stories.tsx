import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  UsersIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  TicketIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { StatCard, MetricCard, StatsGrid } from './index'

const meta = {
  title: 'Components/Data Display/Stats',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
A flexible stats display system for admin dashboards.

## Components

- **StatCard** - Simple stat card with value, label, optional subtitle, and color
- **MetricCard** - Enhanced card with icon, trend indicator, and loading state
- **StatsGrid** - Responsive grid wrapper that auto-calculates columns

## Usage

Use \`StatCard\` for simple inline statistics in headers or summaries.
Use \`MetricCard\` for dashboard metrics with visual indicators.
Use \`StatsGrid\` to wrap multiple cards in a responsive layout.
        `,
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta

export default meta

// StatCard Stories

export const BasicStatCard: StoryObj = {
  render: () => <StatCard value={42} label="Total Items" />,
  parameters: {
    docs: {
      description: {
        story: 'Basic stat card with just a value and label.',
      },
    },
  },
}

export const StatCardWithSubtitle: StoryObj = {
  render: () => (
    <StatCard
      value="1,234"
      label="Total Revenue"
      subtitle="Up 12% from last month"
    />
  ),
}

export const StatCardColors: StoryObj = {
  render: () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard value={24} label="Total" color="slate" />
      <StatCard value={8} label="Pending" color="yellow" />
      <StatCard value={14} label="Confirmed" color="green" />
      <StatCard value={2} label="Cancelled" color="red" />
      <StatCard value={12} label="Blue" color="blue" />
      <StatCard value={5} label="Purple" color="purple" />
      <StatCard value={7} label="Indigo" color="indigo" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'StatCard supports various color themes: slate, blue, green, purple, indigo, yellow, red.',
      },
    },
  },
}

// MetricCard Stories

export const BasicMetricCard: StoryObj = {
  render: () => (
    <MetricCard
      title="Total Users"
      value={1234}
      subtitle="Active this month"
      icon={UsersIcon}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'MetricCard with icon and subtitle.',
      },
    },
  },
}

export const MetricCardTrends: StoryObj = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard
        title="Revenue"
        value="$45,000"
        subtitle="Up 12% from last month"
        icon={CurrencyDollarIcon}
        trend="up"
      />
      <MetricCard
        title="Churn Rate"
        value="2.4%"
        subtitle="Down from 3.1%"
        icon={ChartBarIcon}
        trend="down"
      />
      <MetricCard
        title="Active Users"
        value="892"
        subtitle="No change"
        icon={UsersIcon}
        trend="neutral"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'MetricCard supports trend indicators that change the icon background color.',
      },
    },
  },
}

export const MetricCardLoading: StoryObj = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <MetricCard
        title="Loading Metric"
        value={0}
        icon={ChartBarIcon}
        isLoading
      />
      <MetricCard
        title="Loaded Metric"
        value="$12,345"
        subtitle="Ready to display"
        icon={CurrencyDollarIcon}
        trend="up"
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'MetricCard shows a skeleton loader when isLoading is true.',
      },
    },
  },
}

// StatsGrid Stories

export const StatsGridAuto: StoryObj = {
  render: () => (
    <StatsGrid>
      <StatCard value={150} label="Attendees" color="blue" />
      <StatCard value={24} label="Speakers" color="green" />
      <StatCard value={8} label="Workshops" color="purple" />
      <StatCard value={12} label="Sponsors" color="indigo" />
    </StatsGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'StatsGrid automatically calculates responsive columns based on the number of children.',
      },
    },
  },
}

export const StatsGridFixedColumns: StoryObj = {
  render: () => (
    <StatsGrid columns={3}>
      <StatCard value={100} label="Confirmed" color="green" />
      <StatCard value={25} label="Pending" color="yellow" />
      <StatCard value={5} label="Declined" color="red" />
    </StatsGrid>
  ),
  parameters: {
    docs: {
      description: {
        story: 'StatsGrid with fixed column count.',
      },
    },
  },
}

export const StatsGridGapSizes: StoryObj = {
  render: () => (
    <div className="space-y-8">
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Small gap
        </h3>
        <StatsGrid gap="sm">
          <StatCard value={10} label="A" />
          <StatCard value={20} label="B" />
          <StatCard value={30} label="C" />
        </StatsGrid>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Medium gap (default)
        </h3>
        <StatsGrid gap="md">
          <StatCard value={10} label="A" />
          <StatCard value={20} label="B" />
          <StatCard value={30} label="C" />
        </StatsGrid>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Large gap
        </h3>
        <StatsGrid gap="lg">
          <StatCard value={10} label="A" />
          <StatCard value={20} label="B" />
          <StatCard value={30} label="C" />
        </StatsGrid>
      </div>
    </div>
  ),
}

// Complete Examples

export const DashboardMetrics: StoryObj = {
  render: () => (
    <StatsGrid columns={4}>
      <MetricCard
        title="Total Revenue"
        value="kr 450,000"
        subtitle="kr 380,000 collected"
        icon={CurrencyDollarIcon}
        trend="up"
      />
      <MetricCard
        title="Closed Deals"
        value={12}
        subtitle="5 in pipeline"
        icon={CheckCircleIcon}
        trend="up"
      />
      <MetricCard
        title="Ticket Sales"
        value="324 / 500"
        subtitle="65% sold"
        icon={TicketIcon}
        trend="neutral"
      />
      <MetricCard
        title="Pending Tasks"
        value={7}
        subtitle="3 overdue"
        icon={ClockIcon}
        trend="down"
      />
    </StatsGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Example dashboard metrics layout using MetricCard with StatsGrid.',
      },
    },
  },
}

export const HeaderStats: StoryObj = {
  render: () => (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Proposal Statistics
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Overview for Cloud Native Days Norway 2026
        </p>
      </div>
      <StatsGrid>
        <StatCard value={156} label="Total Proposals" color="slate" />
        <StatCard value={42} label="Under Review" color="yellow" />
        <StatCard value={38} label="Accepted" color="green" />
        <StatCard value={24} label="Rejected" color="red" />
        <StatCard value={52} label="Pending" color="blue" />
      </StatsGrid>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Example of stats used in a page header context with StatCard and StatsGrid.',
      },
    },
  },
}

export const CompactStats: StoryObj = {
  render: () => (
    <div className="inline-flex gap-6">
      <div className="text-center">
        <p className="text-2xl font-bold text-gray-900 dark:text-white">24</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Speakers</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-brand-fresh-green dark:text-green-300">
          18
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Confirmed</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-300">
          6
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Pending</p>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'For very compact inline stats, you can use simple styled divs. Use StatCard or MetricCard for more structured displays.',
      },
    },
  },
}

export const MixedLayout: StoryObj = {
  render: () => (
    <div className="space-y-6">
      <StatsGrid columns={4}>
        <MetricCard
          title="Total Submissions"
          value={156}
          icon={DocumentTextIcon}
          trend="up"
        />
        <MetricCard
          title="Speakers"
          value={48}
          subtitle="32 confirmed"
          icon={UsersIcon}
          trend="up"
        />
        <MetricCard
          title="Workshops"
          value={8}
          subtitle="2 spots left"
          icon={TicketIcon}
          trend="neutral"
        />
        <MetricCard
          title="Days Until Event"
          value={45}
          icon={ClockIcon}
          trend="neutral"
        />
      </StatsGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 font-medium text-gray-900 dark:text-white">
            Proposal Breakdown
          </h3>
          <StatsGrid columns={3} gap="sm">
            <StatCard value={42} label="Talk" color="blue" />
            <StatCard value={18} label="Workshop" color="purple" />
            <StatCard value={12} label="Lightning" color="green" />
          </StatsGrid>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 font-medium text-gray-900 dark:text-white">
            Ticket Status
          </h3>
          <StatsGrid columns={3} gap="sm">
            <StatCard value={324} label="Sold" color="green" />
            <StatCard value={176} label="Available" color="slate" />
            <StatCard value={24} label="Comped" color="indigo" />
          </StatsGrid>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Complex layout mixing MetricCard for top-level metrics and StatCard for detailed breakdowns.',
      },
    },
  },
}
