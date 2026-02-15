import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  Cog6ToothIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  LinkIcon,
  BoltIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Sponsors/Admin/Contracts/AdobeSignConfigPanel',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Collapsible configuration panel for the Adobe Sign integration. Shows connection status, OAuth connect/disconnect actions, webhook registration, and token expiry. Uses tRPC for all API calls.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function PanelHeader({
  connected,
  webhookActive,
  expanded,
}: {
  connected: boolean
  webhookActive?: boolean
  expanded: boolean
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
          <Cog6ToothIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Adobe Sign Integration
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Digital contract signing &amp; tracking
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {connected && webhookActive && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-500/30">
            <BoltIcon className="h-3 w-3" />
            Webhook
          </span>
        )}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            connected
              ? 'bg-green-50 text-green-700 ring-1 ring-green-600/20 dark:bg-green-900/20 dark:text-green-300 dark:ring-green-500/30'
              : 'bg-red-50 text-red-700 ring-1 ring-red-600/20 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-500/30'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected
                ? 'bg-green-500 dark:bg-green-400'
                : 'bg-red-500 dark:bg-red-400'
            }`}
          />
          {connected ? 'Connected' : 'Not Connected'}
        </span>
        <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">
          <ArrowPathIcon className="h-3.5 w-3.5" />
          Refresh
        </button>
        <button className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">
          {expanded ? (
            <ChevronDownIcon className="h-3.5 w-3.5" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}

export const Collapsed: Story = {
  name: 'Collapsed — Connected',
  render: () => (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <PanelHeader connected webhookActive expanded={false} />
      </div>
    </div>
  ),
}

export const CollapsedDisconnected: Story = {
  name: 'Collapsed — Disconnected',
  render: () => (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <PanelHeader connected={false} expanded={false} />
      </div>
    </div>
  ),
}

export const ExpandedConnected: Story = {
  name: 'Expanded — Connected with Webhook',
  render: () => (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <PanelHeader connected webhookActive expanded />

        <div className="border-t border-gray-200 px-6 py-5 dark:border-gray-700">
          <div className="space-y-5">
            <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 dark:border-green-800/50 dark:bg-green-900/10">
              <div className="flex items-start gap-3">
                <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Connected to Adobe Sign
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
                    <div>
                      <dt className="text-xs text-green-600/70 dark:text-green-400/70">
                        API Endpoint
                      </dt>
                      <dd className="text-xs font-medium text-green-700 dark:text-green-300">
                        https://api.eu2.adobesign.com
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-green-600/70 dark:text-green-400/70">
                        Token Expires
                      </dt>
                      <dd className="text-xs font-medium text-green-700 dark:text-green-300">
                        3/15/2026, 2:30:00 PM
                      </dd>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Webhook section */}
            <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Webhook Configuration
                </h4>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                  Active
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900">
                <LinkIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <code className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-gray-300">
                  https://2026.cloudnativedays.no/api/webhooks/adobe-sign
                </code>
              </div>
              <div className="mt-3">
                <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                  <BoltIcon className="h-3.5 w-3.5" />
                  Re-register Webhook
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-700">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Disconnect to revoke access and clear stored tokens.
              </p>
              <button className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20">
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}

export const ExpandedDisconnected: Story = {
  name: 'Expanded — Not Connected',
  render: () => (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <PanelHeader connected={false} expanded />

        <div className="border-t border-gray-200 px-6 py-5 dark:border-gray-700">
          <div className="space-y-5">
            <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="flex items-start gap-3">
                <XCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    Not connected
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Connect your Adobe Sign account to enable contract sending
                    and digital signatures.
                  </p>
                </div>
              </div>
            </div>

            <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800">
              Connect to Adobe Sign
            </button>
          </div>
        </div>
      </div>
    </div>
  ),
}
