import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ProgramFilters } from './ProgramFilters'
import { Format, Level, Audience } from '@/lib/proposal/types'
import type {
  ProgramViewMode,
  ViewModeConfig,
} from '@/hooks/useProgramViewMode'

const mockTopics = [
  {
    _id: 'topic-1',
    _type: 'topic' as const,
    title: 'Kubernetes',
    slug: { current: 'kubernetes' },
    color: '326CE5',
  },
  {
    _id: 'topic-2',
    _type: 'topic' as const,
    title: 'DevOps',
    slug: { current: 'devops' },
    color: 'FF6B35',
  },
  {
    _id: 'topic-3',
    _type: 'topic' as const,
    title: 'Observability',
    slug: { current: 'observability' },
    color: '00C7B7',
  },
]

const mockViewModes: ViewModeConfig[] = [
  {
    id: 'schedule',
    label: 'Schedule View',
    description: 'Traditional time-based schedule layout',
    icon: 'calendar',
    suitableFor: ['time-oriented navigation', 'conference flow'],
  },
  {
    id: 'grid',
    label: 'Card Grid',
    description: 'Browse talks as cards with filtering',
    icon: 'grid',
    suitableFor: ['talk discovery', 'content browsing'],
  },
  {
    id: 'list',
    label: 'List View',
    description: 'Compact list with detailed information',
    icon: 'list',
    suitableFor: ['quick scanning', 'mobile browsing'],
  },
  {
    id: 'agenda',
    label: 'Personal Agenda',
    description: 'Build your personalized conference agenda',
    icon: 'bookmark',
    suitableFor: ['planning', 'personal schedule'],
  },
]

const defaultFilters = {
  searchQuery: '',
  selectedDay: '',
  selectedTrack: '',
  selectedFormat: '' as const,
  selectedLevel: '' as const,
  selectedAudience: '' as const,
  selectedTopic: '',
}

const defaultAvailableFilters = {
  days: ['2025-09-15', '2025-09-16'],
  tracks: ['Main Stage', 'Workshop Room', 'Community Track'],
  formats: [
    Format.lightning_10,
    Format.presentation_25,
    Format.presentation_45,
    Format.workshop_120,
  ],
  levels: [Level.beginner, Level.intermediate, Level.advanced],
  audiences: [
    Audience.developer,
    Audience.architect,
    Audience.operator,
    Audience.devopsEngineer,
  ],
  topics: mockTopics,
}

const meta = {
  title: 'Systems/Program/ProgramFilters',
  component: ProgramFilters,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Filter bar for the program page. Includes search input, expandable dropdowns for day/track/format/level/audience/topic, a count indicator, and an integrated ViewModeSelector. Filters expand on click to reveal additional options.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    filters: defaultFilters,
    availableFilters: defaultAvailableFilters,
    onFilterChange: fn(),
    onClearFilters: fn(),
    hasActiveFilters: false,
    totalTalks: 42,
    filteredTalks: 42,
    viewMode: 'schedule' as ProgramViewMode,
    viewModes: mockViewModes,
    onViewModeChange: fn(),
    currentViewConfig: mockViewModes[0],
  },
} satisfies Meta<typeof ProgramFilters>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithActiveFilters: Story = {
  args: {
    filters: {
      ...defaultFilters,
      selectedLevel: Level.intermediate,
      selectedTrack: 'Main Stage',
    },
    hasActiveFilters: true,
    filteredTalks: 12,
  },
  parameters: {
    docs: {
      description: {
        story:
          'When filters are active, a Clear button appears and the count indicator updates.',
      },
    },
  },
}

export const WithSearch: Story = {
  args: {
    filters: {
      ...defaultFilters,
      searchQuery: 'kubernetes',
    },
    hasActiveFilters: true,
    filteredTalks: 8,
  },
}

export const SingleDay: Story = {
  args: {
    availableFilters: {
      ...defaultAvailableFilters,
      days: ['2025-09-15'],
      tracks: ['Main Stage'],
    },
    totalTalks: 15,
    filteredTalks: 15,
  },
  parameters: {
    docs: {
      description: {
        story:
          'When there is only one day or track, those filter dropdowns are hidden.',
      },
    },
  },
}

export const GridViewMode: Story = {
  args: {
    viewMode: 'grid' as ProgramViewMode,
    currentViewConfig: mockViewModes[1],
  },
}
