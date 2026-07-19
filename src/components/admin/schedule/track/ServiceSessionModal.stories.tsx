import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ServiceSessionModal } from './ServiceSessionModal'
import type { ScheduleTrack } from '@/lib/conference/types'

// The REAL modal — it renders its own fixed overlay and derives the fitting
// duration options from the LIVE track passed in, so it stands alone with a
// small track fixture. Footer order follows the house convention: Cancel left,
// primary right.

// A track with a talk at 10:00–10:30 leaves a 60-minute gap from the 09:00
// start, so the standard 5/10/15/… duration options that fit are offered.
const track: ScheduleTrack = {
  trackTitle: 'Main Stage',
  trackDescription: 'Keynotes and headline talks',
  talks: [
    {
      placeholder: 'Opening remarks',
      startTime: '10:00',
      endTime: '10:30',
    },
  ],
}

const meta = {
  title: 'Systems/Program/Admin/ServiceSessionModal',
  component: ServiceSessionModal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal for creating a service session (coffee break, lunch, networking, …) in a track. Only durations that fit the free gap until the next item are offered; the create action re-validates against the live track so a rejected add surfaces an inline error instead of silently closing.',
      },
    },
  },
  args: {
    isOpen: true,
    timeSlot: '09:00',
    track,
    onClose: fn(),
    onSave: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ServiceSessionModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
