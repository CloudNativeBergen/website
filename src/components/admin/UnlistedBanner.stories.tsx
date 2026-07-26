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
          'Shown at the top of the admin shell when the current conference is unlisted (M0 trial state). Admin access is never gated on visibility; the banner just makes the state legible and links to the Visibility settings card. The "Go live" link is a placeholder for the later activation checklist.',
      },
    },
  },
} satisfies Meta<typeof UnlistedBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CustomSettingsHref: Story = {
  args: { settingsHref: '/admin/settings' },
}
