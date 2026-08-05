import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UnlistedBanner } from './UnlistedBanner'

const meta = {
  title: 'Systems/Admin/UnlistedBanner',
  component: UnlistedBanner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Shown at the top of the admin shell when the current conference is unlisted (M0 trial state). Admin access is never gated on visibility; the banner makes the state legible and points at the one thing the organizer should do next. The CTA tracks activation: "Finish setup" onto the checklist while a required row is outstanding, "Go live" onto the publish switch once only the switch is left.',
      },
    },
  },
} satisfies Meta<typeof UnlistedBanner>

export default meta
type Story = StoryObj<typeof meta>

/** The day-one state: setup incomplete, so the CTA leads to the checklist. */
export const SetupIncomplete: Story = { args: { readyToGoLive: false } }

/** Everything required but the switch is done — now "Go live" is honest. */
export const ReadyToGoLive: Story = { args: { readyToGoLive: true } }

export const SetupIncompleteDark: Story = {
  args: { readyToGoLive: false },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950 py-4">
        <Story />
      </div>
    ),
  ],
}

export const ReadyToGoLiveDark: Story = {
  args: { readyToGoLive: true },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950 py-4">
        <Story />
      </div>
    ),
  ],
}
