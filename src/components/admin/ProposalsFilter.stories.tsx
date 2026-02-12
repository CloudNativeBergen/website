import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'
import { ProposalsFilter, FilterState, ReviewStatus } from './ProposalsFilter'
import { Status, Format, Level, Language, Audience } from '@/lib/proposal/types'
import { Flags } from '@/lib/speaker/types'

const defaultFilters: FilterState = {
  status: [],
  format: [],
  level: [],
  language: [],
  audience: [],
  speakerFlags: [],
  reviewStatus: ReviewStatus.all,
  hideMultipleTalks: false,
  sortBy: 'created',
  sortOrder: 'desc',
}

const meta = {
  title: 'Admin/Proposals/ProposalsFilter',
  component: ProposalsFilter,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Filter controls for the proposals list. Supports filtering by status, format, level, speaker flags, and review status. Includes sorting options and a clear all button when filters are active.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ProposalsFilter>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    filters: defaultFilters,
    onFilterChange: fn(),
    onReviewStatusChange: fn(),
    onMultipleTalksFilterChange: fn(),
    onSortChange: fn(),
    onSortOrderToggle: fn(),
    onClearAll: fn(),
    activeFilterCount: 0,
    currentUserId: 'user-1',
  },
}

export const WithActiveFilters: Story = {
  args: {
    filters: {
      ...defaultFilters,
      status: [Status.submitted, Status.confirmed],
      format: [Format.presentation_45],
      level: [Level.intermediate],
    },
    onFilterChange: fn(),
    onReviewStatusChange: fn(),
    onMultipleTalksFilterChange: fn(),
    onSortChange: fn(),
    onSortOrderToggle: fn(),
    onClearAll: fn(),
    activeFilterCount: 4,
    currentUserId: 'user-1',
  },
  parameters: {
    docs: {
      description: {
        story: 'Filter dropdowns show badge counts when filters are active.',
      },
    },
  },
}

export const WithSpeakerFilters: Story = {
  args: {
    filters: {
      ...defaultFilters,
      speakerFlags: [Flags.diverseSpeaker, Flags.firstTimeSpeaker],
      hideMultipleTalks: true,
    },
    onFilterChange: fn(),
    onReviewStatusChange: fn(),
    onMultipleTalksFilterChange: fn(),
    onSortChange: fn(),
    onSortOrderToggle: fn(),
    onClearAll: fn(),
    activeFilterCount: 3,
    currentUserId: 'user-1',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Speaker filters help organizers find diverse and new speakers while avoiding speakers with existing acceptances.',
      },
    },
  },
}

export const ReviewMode: Story = {
  args: {
    filters: {
      ...defaultFilters,
      reviewStatus: ReviewStatus.unreviewed,
    },
    onFilterChange: fn(),
    onReviewStatusChange: fn(),
    onMultipleTalksFilterChange: fn(),
    onSortChange: fn(),
    onSortOrderToggle: fn(),
    onClearAll: fn(),
    activeFilterCount: 1,
    currentUserId: 'user-1',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Review mode filters help reviewers see only proposals they have or have not reviewed.',
      },
    },
  },
}

export const WithoutReviewFeature: Story = {
  args: {
    filters: defaultFilters,
    onFilterChange: fn(),
    onReviewStatusChange: fn(),
    onMultipleTalksFilterChange: fn(),
    onSortChange: fn(),
    onSortOrderToggle: fn(),
    onClearAll: fn(),
    activeFilterCount: 0,
    currentUserId: undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'Without a currentUserId, the review filter dropdown is hidden.',
      },
    },
  },
}

export const LimitedFormats: Story = {
  args: {
    filters: defaultFilters,
    onFilterChange: fn(),
    onReviewStatusChange: fn(),
    onMultipleTalksFilterChange: fn(),
    onSortChange: fn(),
    onSortOrderToggle: fn(),
    onClearAll: fn(),
    activeFilterCount: 0,
    currentUserId: 'user-1',
    allowedFormats: [
      Format.lightning_10,
      Format.presentation_25,
      Format.presentation_45,
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'The format dropdown can be limited to only show certain formats (e.g., excluding workshops).',
      },
    },
  },
}

const InteractiveTemplate = () => {
  const [filters, setFilters] = useState<FilterState>(defaultFilters)

  const handleFilterChange = (
    filterType: keyof FilterState,
    value: Status | Format | Level | Language | Audience | Flags,
  ) => {
    setFilters((prev) => {
      const currentArray = prev[filterType] as (typeof value)[]
      const isActive = currentArray.includes(value)

      return {
        ...prev,
        [filterType]: isActive
          ? currentArray.filter((v) => v !== value)
          : [...currentArray, value],
      }
    })
  }

  const handleReviewStatusChange = (reviewStatus: ReviewStatus) => {
    setFilters((prev) => ({ ...prev, reviewStatus }))
  }

  const handleMultipleTalksFilterChange = (hideMultipleTalks: boolean) => {
    setFilters((prev) => ({ ...prev, hideMultipleTalks }))
  }

  const handleSortChange = (sortBy: FilterState['sortBy']) => {
    setFilters((prev) => ({ ...prev, sortBy }))
  }

  const handleSortOrderToggle = () => {
    setFilters((prev) => ({
      ...prev,
      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }))
  }

  const handleClearAll = () => {
    setFilters(defaultFilters)
  }

  const activeFilterCount =
    filters.status.length +
    filters.format.length +
    filters.level.length +
    filters.speakerFlags.length +
    (filters.hideMultipleTalks ? 1 : 0) +
    (filters.reviewStatus !== ReviewStatus.all ? 1 : 0)

  return (
    <div className="space-y-4">
      <ProposalsFilter
        filters={filters}
        onFilterChange={handleFilterChange}
        onReviewStatusChange={handleReviewStatusChange}
        onMultipleTalksFilterChange={handleMultipleTalksFilterChange}
        onSortChange={handleSortChange}
        onSortOrderToggle={handleSortOrderToggle}
        onClearAll={handleClearAll}
        activeFilterCount={activeFilterCount}
        currentUserId="user-1"
      />

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <h4 className="mb-2 font-medium text-gray-900 dark:text-white">
          Current Filter State
        </h4>
        <pre className="overflow-auto text-xs text-gray-600 dark:text-gray-300">
          {JSON.stringify(filters, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export const Interactive: Story = {
  args: {
    filters: defaultFilters,
    onFilterChange: fn(),
    onReviewStatusChange: fn(),
    onMultipleTalksFilterChange: fn(),
    onSortChange: fn(),
    onSortOrderToggle: fn(),
    onClearAll: fn(),
    activeFilterCount: 0,
    currentUserId: 'user-1',
  },
  render: () => <InteractiveTemplate />,
  parameters: {
    docs: {
      description: {
        story:
          'Interactive demo showing how filter state changes as you interact with the controls.',
      },
    },
  },
}
