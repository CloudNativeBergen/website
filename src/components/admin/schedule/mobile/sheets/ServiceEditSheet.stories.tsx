import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type React from 'react'
import { fn } from 'storybook/test'
import { ServiceEditSheet } from './ServiceEditSheet'
import type { ScheduleTrack, TrackTalk } from '@/lib/conference/types'
import type { ScheduleAction } from '@/lib/schedule/reducer'

// The REAL mobile bottom sheet — it renders its own overlay and takes plain
// props (the reducer's `dispatch` is passed in), so it stands alone with small
// fixtures. Shown at phone width since it is a mobile-only surface.

const talk: TrackTalk = {
  placeholder: 'Coffee Break',
  startTime: '10:00',
  endTime: '10:15',
}

const track: ScheduleTrack = {
  trackTitle: 'Main Stage',
  trackDescription: '',
  talks: [talk],
}

const noopDispatch = fn() as unknown as React.Dispatch<ScheduleAction>

const meta = {
  title: 'Systems/Program/Admin/ServiceEditSheet',
  component: ServiceEditSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        component:
          'Mobile bottom sheet for editing a service session — rename it or change its duration. Only durations that still fit the surrounding gap are offered, and Save is disabled while the rename field is empty so an empty title can never be committed.',
      },
    },
  },
  args: {
    talk,
    trackIndex: 0,
    talkIndex: 0,
    track,
    dispatch: noopDispatch,
    onClose: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ServiceEditSheet>

export default meta
type Story = StoryObj<typeof meta>

/** Rename mode with the current title prefilled — Save is enabled. */
export const Rename: Story = {
  args: { mode: 'rename' },
}

/** Rename mode with an empty title — Save is disabled until text is entered. */
export const RenameEmpty: Story = {
  args: {
    mode: 'rename',
    talk: { ...talk, placeholder: '' },
  },
}

/** Duration mode — pick a length that fits the surrounding gap. */
export const Duration: Story = {
  args: { mode: 'duration' },
}
