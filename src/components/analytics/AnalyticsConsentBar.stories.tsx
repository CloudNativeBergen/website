import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AnalyticsConsentBar } from './AnalyticsConsentBar'
import { AnalyticsChoice } from './AnalyticsChoice'
import type { ConsentStatus } from '@/lib/posthog/consent'
import {
  publishAnalyticsRuntime,
  type TenantAnalyticsRuntime,
} from '@/lib/posthog/runtime'

/**
 * The bar talks to PostHog through the window runtime, never by importing the
 * SDK, so a story stands in a fake client and publishes it exactly the way
 * `instrumentation-client.ts` would after init. The fake keeps the consent
 * status in memory, so Accept/Decline behave end to end.
 */
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
    landingUtm: { utm_campaign: 'story', utm_content: 'bar' },
  }
}

const meta = {
  title: 'Components/Analytics/AnalyticsConsentBar',
  component: AnalyticsConsentBar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Slim bottom bar shown to visitors of an organization on PostHog until they choose. Accept sets the analytics cookie; Decline keeps them counted anonymously. Only the runtime publication differs between stories.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AnalyticsConsentBar>

export default meta
type Story = StoryObj<typeof meta>

function withRuntime(status: ConsentStatus) {
  return (Story: React.ComponentType) => {
    delete window.__tenantAnalytics
    publishAnalyticsRuntime(window, fakeRuntime(status))
    return (
      <div className="min-h-[60vh] bg-white p-8 dark:bg-gray-950">
        <p className="text-sm text-gray-500">
          Page content (the bar is fixed to the bottom of the viewport).
        </p>
        <div className="mt-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Privacy page control
          </p>
          <AnalyticsChoice />
        </div>
        <Story />
      </div>
    )
  }
}

/** First visit: no choice yet, so the bar shows. */
export const Pending: Story = {
  decorators: [withRuntime('pending')],
}

/** Already accepted: no bar; the privacy control offers to decline. */
export const Accepted: Story = {
  decorators: [withRuntime('granted')],
}

/** Already declined: no bar; the privacy control offers to accept. */
export const Declined: Story = {
  decorators: [withRuntime('denied')],
}
