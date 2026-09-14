import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'
import { AnalyticsChoice } from './AnalyticsChoice'
import type { ConsentStatus } from '@/lib/posthog/consent'
import {
  publishAnalyticsRuntime,
  type TenantAnalyticsRuntime,
} from '@/lib/posthog/runtime'

/** A fake client that keeps the consent status in memory. */
function fakeRuntime(initial: ConsentStatus): TenantAnalyticsRuntime {
  let status = initial
  return {
    client: {
      opt_in_capturing: () => {
        status = 'granted'
      },
      opt_out_capturing: () => {
        status = 'denied'
      },
      register: () => {},
      register_for_session: () => {},
      get_explicit_consent_status: () => status,
    },
    config: { token: 'phc_storybook', conference: 'conf-storybook' },
    landingUtm: {},
  }
}

function withRuntime(status: ConsentStatus | null) {
  return (Story: React.ComponentType) => {
    delete window.__tenantAnalytics
    if (status) publishAnalyticsRuntime(window, fakeRuntime(status))
    return (
      <div className="max-w-xl rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
        <Story />
      </div>
    )
  }
}

const meta = {
  title: 'Systems/Analytics/AnalyticsChoice',
  component: AnalyticsChoice,
  parameters: {
    docs: {
      description: {
        component:
          'The "Your analytics choice" control in the privacy page\'s cookies section: shows the visitor\'s current PostHog consent and offers the opposite choice. Reads the window runtime the client entry publishes; with none it says analytics is not running.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AnalyticsChoice>

export default meta
type Story = StoryObj<typeof meta>

/** Pending visitor: counted anonymously, offered the cookie. Clicking flips it. */
export const Interactive: Story = {
  decorators: [withRuntime('pending')],
  play: async ({ canvas, userEvent }) => {
    // The status is read from the runtime in a passive effect, so wait for
    // the first real sentence before interacting.
    await expect(await canvas.findByText(/not chosen yet/)).toBeInTheDocument()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Accept the cookie' }),
    )
    await expect(await canvas.findByText(/accepted\./)).toBeInTheDocument()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Decline the cookie' }),
    )
    await expect(await canvas.findByText(/declined\./)).toBeInTheDocument()
  },
}

export const Accepted: Story = { decorators: [withRuntime('granted')] }

export const Declined: Story = { decorators: [withRuntime('denied')] }

/** Scripts blocked or no token: nothing to choose, and the control says so. */
export const AnalyticsNotRunning: Story = { decorators: [withRuntime(null)] }
