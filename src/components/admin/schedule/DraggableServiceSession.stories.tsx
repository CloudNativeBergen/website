import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DndContext } from '@dnd-kit/core'
import { DraggableServiceSession } from './DraggableServiceSession'
import { TrackTalk } from '@/lib/conference/types'

const createMockServiceSession = (
  overrides: Partial<TrackTalk> = {},
): TrackTalk => ({
  placeholder: 'Coffee Break',
  startTime: '10:00',
  endTime: '10:15',
  ...overrides,
})

const meta: Meta<typeof DraggableServiceSession> = {
  title: 'Systems/Program/Admin/DraggableServiceSession',
  component: DraggableServiceSession,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A draggable service session card (breaks, lunch, networking, etc.) used in the schedule editor. Visual size scales with session duration. Shows title, duration, and time range for longer sessions.',
      },
    },
  },
  decorators: [
    (Story) => (
      <DndContext>
        <div className="w-80 p-4">
          <Story />
        </div>
      </DndContext>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof DraggableServiceSession>

export const ShortBreak: Story = {
  args: {
    serviceSession: createMockServiceSession(),
  },
}

export const MediumBreak: Story = {
  args: {
    serviceSession: createMockServiceSession({
      placeholder: 'Morning Break',
      startTime: '10:30',
      endTime: '10:50',
    }),
  },
}

export const LunchBreak: Story = {
  args: {
    serviceSession: createMockServiceSession({
      placeholder: 'Lunch',
      startTime: '12:00',
      endTime: '13:00',
    }),
  },
}

export const NetworkingSession: Story = {
  args: {
    serviceSession: createMockServiceSession({
      placeholder: 'Networking & Socializing',
      startTime: '17:00',
      endTime: '19:00',
    }),
  },
}

export const Dragging: Story = {
  args: {
    serviceSession: createMockServiceSession(),
    isDragging: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Reduced opacity state shown while the card is being dragged.',
      },
    },
  },
}
