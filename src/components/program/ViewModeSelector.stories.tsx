import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ViewModeSelector } from './ViewModeSelector'
import { useState } from 'react'
import {
  type ProgramViewMode,
  type ViewModeConfig,
} from '@/hooks/useProgramViewMode'

const defaultViewModes: ViewModeConfig[] = [
  {
    id: 'schedule',
    label: 'Schedule View',
    description: 'View the full schedule with time slots',
    icon: 'calendar',
    suitableFor: ['desktop', 'tablet'],
  },
  {
    id: 'grid',
    label: 'Card Grid',
    description: 'Browse sessions in a card layout',
    icon: 'grid',
    suitableFor: ['desktop', 'tablet', 'mobile'],
  },
  {
    id: 'list',
    label: 'List View',
    description: 'Compact list of all sessions',
    icon: 'list',
    suitableFor: ['desktop', 'tablet', 'mobile'],
  },
  {
    id: 'agenda',
    label: 'Personal Agenda',
    description: 'Your bookmarked sessions',
    icon: 'bookmark',
    suitableFor: ['desktop', 'tablet', 'mobile'],
  },
]

const meta = {
  title: 'Systems/Program/ViewModeSelector',
  component: ViewModeSelector,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A view mode toggle for the program page, allowing users to switch between schedule, grid, list, and personal agenda views.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ViewModeSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    viewMode: 'schedule',
    viewModes: defaultViewModes,
    onViewModeChange: () => {},
    currentViewConfig: defaultViewModes[0],
  },
}

export const GridSelected: Story = {
  args: {
    viewMode: 'grid',
    viewModes: defaultViewModes,
    onViewModeChange: () => {},
    currentViewConfig: defaultViewModes[1],
  },
}

export const ListSelected: Story = {
  args: {
    viewMode: 'list',
    viewModes: defaultViewModes,
    onViewModeChange: () => {},
    currentViewConfig: defaultViewModes[2],
  },
}

export const BookmarkSelected: Story = {
  args: {
    viewMode: 'agenda',
    viewModes: defaultViewModes,
    onViewModeChange: () => {},
    currentViewConfig: defaultViewModes[3],
  },
}

export const ThreeOptions: Story = {
  args: {
    viewMode: 'schedule',
    viewModes: defaultViewModes.slice(0, 3),
    onViewModeChange: () => {},
    currentViewConfig: defaultViewModes[0],
  },
  parameters: {
    docs: {
      description: {
        story: 'With only three view modes (without personal agenda).',
      },
    },
  },
}

export const Interactive: Story = {
  args: {
    viewMode: 'schedule',
    viewModes: defaultViewModes,
    onViewModeChange: () => {},
    currentViewConfig: defaultViewModes[0],
  },
  render: (args) => {
    const InteractiveDemo = () => {
      const [viewMode, setViewMode] = useState<ProgramViewMode>('schedule')
      const currentConfig = defaultViewModes.find((m) => m.id === viewMode)!

      return (
        <div className="space-y-4">
          <ViewModeSelector
            {...args}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            currentViewConfig={currentConfig}
          />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Selected: <strong>{currentConfig.label}</strong> -{' '}
            {currentConfig.description}
          </p>
        </div>
      )
    }
    return <InteractiveDemo />
  },
}
