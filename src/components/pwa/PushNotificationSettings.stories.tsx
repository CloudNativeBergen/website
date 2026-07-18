import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { PushNotificationSettingsView } from './PushNotificationSettings'
import { DEFAULT_PUSH_PREFERENCES } from '@/lib/push/types'

const meta = {
  title: 'Components/PWA/PushNotificationSettings',
  component: PushNotificationSettingsView,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Opt-in web push settings for speakers (#444). This is the PURE presentational view — the `PushNotificationSettings` container wires it to the browser Push APIs and the `push` tRPC router. Permission is only ever requested from the master-toggle click, never on load. On iOS Safari that is not yet installed to the Home Screen, the toggle is replaced with install guidance (web push needs an installed PWA on iOS 16.4+).',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    preferences: DEFAULT_PUSH_PREFERENCES,
    onToggleMaster: fn(),
    onToggleCategory: fn(),
    onSendTest: fn(),
  },
  argTypes: {
    status: {
      control: 'radio',
      options: [
        'loading',
        'unavailable',
        'unsupported',
        'ios-install',
        'denied',
        'disabled',
        'enabled',
      ],
    },
  },
} satisfies Meta<typeof PushNotificationSettingsView>

export default meta
type Story = StoryObj<typeof meta>

/** Supported browser, not yet subscribed — the soft opt-in toggle. */
export const Disabled: Story = {
  args: { status: 'disabled' },
}

/** Subscribed — master on, per-category toggles revealed. */
export const Enabled: Story = {
  args: { status: 'enabled' },
}

/**
 * Subscribed, with the self-serve "Send test notification" button revealed
 * (only shown when `onSendTest` is wired and the master toggle is on).
 */
export const EnabledWithTestButton: Story = {
  args: { status: 'enabled' },
}

/** Test send in flight — button disabled with a spinner. */
export const EnabledSendingTest: Story = {
  args: { status: 'enabled', sendTestPending: true },
}

/** Test delivered to two devices — success feedback via role="status". */
export const EnabledTestSent: Story = {
  args: {
    status: 'enabled',
    sendTestResult: { sent: 2, gone: 0, total: 2, configured: true },
  },
}

/** Test attempted but no devices are subscribed on this account yet. */
export const EnabledTestNoDevices: Story = {
  args: {
    status: 'enabled',
    sendTestResult: { sent: 0, gone: 0, total: 0, configured: true },
  },
}

/** Devices exist but every send failed — distinct from having no devices. */
export const EnabledTestDeliveryFailed: Story = {
  args: {
    ...EnabledTestNoDevices.args,
    sendTestResult: { sent: 0, gone: 0, total: 2, configured: true },
  },
}

/** Test delivered, and an expired subscription was pruned in the process. */
export const EnabledTestWithExpired: Story = {
  args: {
    status: 'enabled',
    sendTestResult: { sent: 1, gone: 1, total: 2, configured: true },
  },
}

/** Subscribed but two categories (co-speaker + other updates) turned off. */
export const EnabledWithCategoryOff: Story = {
  args: {
    status: 'enabled',
    preferences: {
      ...DEFAULT_PUSH_PREFERENCES,
      coSpeakerInvites: false,
      otherUpdates: false,
    },
  },
}

/** iOS Safari, not installed — show Add-to-Home-Screen guidance instead. */
export const IOSInstallRequired: Story = {
  args: { status: 'ios-install' },
}

/** Permission previously blocked in the browser. */
export const PermissionDenied: Story = {
  args: { status: 'denied' },
}

/** Browser without push support. */
export const Unsupported: Story = {
  args: { status: 'unsupported' },
}

/** Server has no VAPID keys configured — push is unavailable, not broken. */
export const Unavailable: Story = {
  args: { status: 'unavailable' },
}

/** Busy while the subscribe/unsubscribe round-trip is in flight. */
export const Busy: Story = {
  args: { status: 'disabled', busy: true },
}
