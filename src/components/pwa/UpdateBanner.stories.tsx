import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { UpdateBanner } from './UpdateBanner'

const meta = {
  title: 'Components/PWA/UpdateBanner',
  component: UpdateBanner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Presentational "new version available" banner shown after the service worker installs an update. Clicking Reload posts `SKIP_WAITING` to the waiting worker (handled by the `ServiceWorkerRegistrar` container), which then reloads the page exactly once. This component is pure — all service-worker logic lives in the container — so it renders standalone. The entrance animation is suppressed under `prefers-reduced-motion`. It is a polite `role="status"` live region (NOT a dialog — nothing traps focus), sits below open dialogs (`z-40`), pads for the safe-area inset, and gives its actions 44px touch targets.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onReload: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof UpdateBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
