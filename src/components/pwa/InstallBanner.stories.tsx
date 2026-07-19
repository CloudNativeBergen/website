import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { InstallBanner } from './InstallBanner'

const meta = {
  title: 'Components/PWA/InstallBanner',
  component: InstallBanner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Presentational, dismissible install affordance for the PWA. The `chromium` variant surfaces an actionable Install button driven by the `beforeinstallprompt` event; the `ios` variant shows an Add-to-Home-Screen hint since iOS Safari has no install prompt API. Event handling lives in the `InstallPrompt` container; this component is pure so it renders standalone. It is a polite `role="status"` live region (NOT a dialog — nothing traps focus), sits below open dialogs (`z-40`), pads for the safe-area inset, and gives its actions 44px touch targets.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onInstall: fn(),
    onDismiss: fn(),
  },
  argTypes: {
    mode: {
      control: 'radio',
      options: ['chromium', 'ios'],
      description: 'Which affordance to show',
    },
  },
} satisfies Meta<typeof InstallBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Chromium: Story = {
  args: { mode: 'chromium' },
}

export const IOS: Story = {
  args: { mode: 'ios' },
}
