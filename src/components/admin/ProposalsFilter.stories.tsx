import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalsFilter, FilterState, ReviewStatus } from './ProposalsFilter'
import { Status, Format, Level, Language, Audience } from '@/lib/proposal/types'
import { Flags } from '@/lib/speaker/types'
import { fn } from 'storybook/test'

const defaultFilters: FilterState = {
  status: [],
  format: [],
  level: [],
  language: [],
  audience: [],
  speakerFlags: [],
  reviewStatus: ReviewStatus.all,
  hideMultipleTalks: false,
  searchQuery: '',
  sortBy: 'created',
  sortOrder: 'desc',
}

const meta = {
  title: 'Systems/Proposals/ProposalsFilter',
  component: ProposalsFilter,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    onFilterChange: { action: 'filterChanged' },
    onReviewStatusChange: { action: 'reviewStatusChanged' },
    onSearchChange: { action: 'searchChanged' },
    onMultipleTalksFilterChange: { action: 'multipleTalksFilterChanged' },
    onSortChange: { action: 'sortChanged' },
    onSortOrderToggle: { action: 'sortOrderToggled' },
    onClearAll: { action: 'clearedAll' },
  },
} satisfies Meta<typeof ProposalsFilter>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    filters: defaultFilters,
    onFilterChange: fn(),
    onReviewStatusChange: fn(),
    onSearchChange: fn(),
    onMultipleTalksFilterChange: fn(),
    onSortChange: fn(),
    onSortOrderToggle: fn(),
    onClearAll: fn(),
    activeFilterCount: 0,
    currentUserId: 'organizer-1',
  },
}

export const WithActiveFilters: Story = {
  args: {
    ...Default.args,
    filters: {
      ...defaultFilters,
      status: [Status.submitted, Status.confirmed],
      format: [Format.presentation_45],
      level: [Level.intermediate],
      language: [Language.english],
      audience: [Audience.developer],
      speakerFlags: [Flags.localSpeaker],
    },
    activeFilterCount: 6,
  },
}

export const SpeakerFilters: Story = {
  args: {
    ...Default.args,
    filters: {
      ...defaultFilters,
      speakerFlags: [Flags.firstTimeSpeaker, Flags.diverseSpeaker],
      hideMultipleTalks: true,
    },
    activeFilterCount: 3,
  },
}

export const ReviewFilters: Story = {
  args: {
    ...Default.args,
    filters: {
      ...defaultFilters,
      reviewStatus: ReviewStatus.unreviewed,
    },
    activeFilterCount: 1,
  },
}

export const NoUserContext: Story = {
  args: {
    ...Default.args,
    currentUserId: undefined,
  },
}

export const LimitedFormats: Story = {
  args: {
    ...Default.args,
    allowedFormats: [
      Format.lightning_10,
      Format.presentation_25,
      Format.presentation_45,
    ],
  },
}

export const CustomLayout: Story = {
  render: (args) => (
    <div className="max-w-4xl">
      <ProposalsFilter
        {...args}
        onFilterChange={(type, val) => console.log('Filter:', type, val)}
        onReviewStatusChange={(val) => console.log('Review:', val)}
        onSearchChange={(val) => console.log('Search:', val)}
      />
    </div>
  ),
  args: {
    filters: defaultFilters,
    onFilterChange: fn(),
    onReviewStatusChange: fn(),
    onSearchChange: fn(),
    onMultipleTalksFilterChange: fn(),
    onSortChange: fn(),
    onSortOrderToggle: fn(),
    onClearAll: fn(),
    activeFilterCount: 0,
    currentUserId: 'organizer-1',
  },
}

export const DarkMode: Story = {
  parameters: {
    themes: {
      themeOverride: 'dark',
    },
  },
  args: {
    ...Default.args,
  },
}
