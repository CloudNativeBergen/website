/* eslint-disable react-hooks/rules-of-hooks */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BoardViewSwitcher } from './BoardViewSwitcher'
import { useState } from 'react'
import type { BoardView } from './BoardViewSwitcher'

const meta: Meta<typeof BoardViewSwitcher> = {
  title: 'Systems/Sponsors/Admin/Pipeline/BoardViewSwitcher',
  component: BoardViewSwitcher,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Navigation control for switching between different sponsor management views. Pipeline view tracks relationship stages, Contract view focuses on agreement status, and Invoice view monitors payment progress. Uses brand colors with Cloud Blue (#1D4ED8) for active states.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof BoardViewSwitcher>

export const BoardViewSwitcher_: Story = {
  name: 'BoardViewSwitcher',
  render: () => {
    const [view, setView] = useState<BoardView>('pipeline')
    return (
      <div className="space-y-4">
        <BoardViewSwitcher currentView={view} onViewChange={setView} />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Current view: <strong>{view}</strong>
        </p>
      </div>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'Click each tab to switch between Pipeline, Contract, and Invoice views. The active view is highlighted with brand blue color.',
      },
    },
  },
}
