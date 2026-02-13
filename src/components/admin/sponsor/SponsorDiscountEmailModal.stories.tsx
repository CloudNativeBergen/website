import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { XMarkIcon, EyeIcon, TicketIcon } from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Sponsors/Admin/Email/SponsorDiscountEmailModal',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Specialized modal for sending discount code emails to sponsor contacts. Built on the base EmailModal, it adds template variable processing for sponsor-specific placeholders, a ticket URL field for registration links, and a BroadcastTemplate preview that includes a formatted discount code info block. Sends via the `/admin/api/sponsors/email/discount` endpoint.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function DiscountEmailMockup() {
  const [subject, setSubject] = useState(
    'Your Cloud Native Days Norway 2025 Sponsor Discount Code',
  )
  const [ticketUrl, setTicketUrl] = useState(
    'https://bergen.cloudnativedays.no/tickets',
  )
  const [body, setBody] = useState(
    "Dear TechGiant Corp team,\n\nWe're excited to share your sponsor discount code for Cloud Native Days Norway 2025!\n\nAs a Gold sponsor, you're entitled to 5 complimentary tickets for the conference.",
  )
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 p-6 pb-4 dark:border-gray-700">
        <div className="flex-1">
          <h2 className="font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
            Send Discount Code Email
          </h2>
          <p className="font-inter mt-1 text-sm text-gray-600 dark:text-gray-400">
            <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              <TicketIcon className="h-3 w-3" />
              SPONSOR-GOLD-2025
            </span>
            Gold tier
          </p>
        </div>
        <button className="rounded-xl p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
          <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      {/* Email fields */}
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center border-b border-gray-200/50 px-6 py-3 dark:border-gray-700/50">
            <label className="font-space-grotesk w-16 text-sm font-medium text-gray-600 dark:text-gray-300">
              To:
            </label>
            <div className="flex flex-wrap gap-2">
              <span className="font-inter rounded-full bg-brand-sky-mist px-3 py-1 text-sm text-brand-slate-gray dark:bg-gray-700 dark:text-gray-300">
                TechGiant Corp contact persons
              </span>
            </div>
          </div>

          <div className="flex items-center border-b border-gray-200/50 px-6 py-3 dark:border-gray-700/50">
            <label className="font-space-grotesk w-16 text-sm font-medium text-gray-600 dark:text-gray-300">
              From:
            </label>
            <span className="font-inter text-sm text-gray-600 dark:text-gray-300">
              conference@cloudnativebergen.no
            </span>
          </div>

          <div className="flex items-center border-b border-gray-200/50 px-6 py-3 dark:border-gray-700/50">
            <label className="font-space-grotesk w-16 text-sm font-medium text-gray-600 dark:text-gray-300">
              Subject:
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="font-inter w-full border-none bg-transparent px-0 py-1 text-sm placeholder-gray-400 focus:ring-0 focus:outline-none dark:text-white"
            />
          </div>

          <div className="flex items-center border-b border-gray-200/50 px-6 py-3 dark:border-gray-700/50">
            <label className="font-space-grotesk w-24 text-sm font-medium text-gray-600 dark:text-gray-300">
              Ticket URL:
            </label>
            <input
              type="url"
              value={ticketUrl}
              onChange={(e) => setTicketUrl(e.target.value)}
              className="font-inter w-full border-none bg-transparent px-0 py-1 text-sm placeholder-gray-400 focus:ring-0 focus:outline-none dark:text-white"
              placeholder="https://example.com/tickets"
            />
          </div>
        </div>

        <div className="px-6 pt-2 pb-6">
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Template variables:{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">
              {'{{{SPONSOR_NAME}}}'}
            </code>
            ,{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">
              {'{{{SPONSOR_TIER}}}'}
            </code>
            ,{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">
              {'{{{TICKET_COUNT}}}'}
            </code>
            ,{' '}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">
              {'{{{TICKET_COUNT_PLURAL}}}'}
            </code>
          </p>
          {showPreview ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white">
                  Email Preview
                </h4>
                <button
                  onClick={() => setShowPreview(false)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 dark:border-gray-600 dark:text-white dark:hover:bg-gray-800"
                >
                  Back to Edit
                </button>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="text-sm text-gray-700">
                  <p className="mb-4">Dear TechGiant Corp team,</p>
                  <p className="mb-4">
                    We&apos;re excited to share your sponsor discount code for
                    Cloud Native Days Norway 2025!
                  </p>
                  <p className="mb-4">
                    As a Gold sponsor, you&apos;re entitled to 5 complimentary
                    tickets for the conference.
                  </p>
                </div>
                {/* Discount code info block */}
                <div className="rounded-xl border border-gray-200 bg-blue-50 p-5">
                  <h3 className="mb-3 text-lg font-semibold text-blue-800">
                    Your Discount Code
                  </h3>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li>
                      <strong>Discount Code:</strong>{' '}
                      <code className="rounded bg-gray-100 px-2 py-0.5 font-mono">
                        SPONSOR-GOLD-2025
                      </code>
                    </li>
                    <li>
                      <strong>Ticket Registration:</strong>{' '}
                      <a href="#" className="font-medium text-blue-700">
                        {ticketUrl}
                      </a>
                    </li>
                    <li>
                      <strong>Instructions:</strong> Enter the discount code
                      during checkout to receive your sponsor tickets
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-50 rounded-lg border border-gray-300 p-4 dark:border-gray-600">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                className="w-full border-none bg-transparent text-sm text-gray-900 focus:ring-0 focus:outline-none dark:text-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 justify-between border-t border-gray-200 p-6 dark:border-gray-700">
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
            showPreview
              ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
              : 'border-gray-300 text-gray-900 dark:border-gray-600 dark:text-white'
          }`}
        >
          <EyeIcon className="h-4 w-4" />
          Preview Email
        </button>
        <div className="flex space-x-4">
          <button className="text-sm/6 font-semibold text-gray-900 dark:text-white">
            Cancel
          </button>
          <button className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Send Email
          </button>
        </div>
      </div>
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <div className="p-6">
      <DiscountEmailMockup />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The compose view showing the discount code context badge, ticket URL field, template variable hints, and email body. Click "Preview Email" to see the rendered output with the formatted discount code info block.',
      },
    },
  },
}

export const Documentation: Story = {
  render: () => (
    <div className="max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SponsorDiscountEmailModal
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Specialized modal for sending discount code emails to sponsor
          contacts. Uses the base EmailModal with template variable processing
          and a formatted discount code info block in the preview.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              isOpen
            </code>{' '}
            - Whether modal is visible
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              onClose
            </code>{' '}
            - Callback when closed
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              sponsor
            </code>{' '}
            - SponsorWithTierInfo (id, name, tier, ticketEntitlement)
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              discountCode
            </code>{' '}
            - The discount code to include in the email
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              domain / fromEmail
            </code>{' '}
            - Sending configuration
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              conference
            </code>{' '}
            - Conference context (title, city, country, startDate, domains)
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Template Variables
        </h3>
        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-600">
                <th className="py-1 pr-2">Variable</th>
                <th className="py-1">Replaced With</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 pr-2">
                  <code className="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700">
                    {'{{{SPONSOR_NAME}}}'}
                  </code>
                </td>
                <td className="py-1">Sponsor company name</td>
              </tr>
              <tr>
                <td className="py-1 pr-2">
                  <code className="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700">
                    {'{{{SPONSOR_TIER}}}'}
                  </code>
                </td>
                <td className="py-1">Sponsor tier title (e.g. Gold)</td>
              </tr>
              <tr>
                <td className="py-1 pr-2">
                  <code className="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700">
                    {'{{{TICKET_COUNT}}}'}
                  </code>
                </td>
                <td className="py-1">Number of entitled tickets</td>
              </tr>
              <tr>
                <td className="py-1 pr-2">
                  <code className="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700">
                    {'{{{TICKET_COUNT_PLURAL}}}'}
                  </code>
                </td>
                <td className="py-1">
                  &quot;s&quot; if count &gt; 1, empty otherwise
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Key Features
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            • <strong>Template variable processing</strong> — Replaces
            placeholders in subject, body, and preview with sponsor-specific
            values
          </li>
          <li>
            • <strong>Ticket URL field</strong> — Configurable registration URL,
            defaults to conference domain /tickets
          </li>
          <li>
            • <strong>Discount code info block</strong> — Formatted block
            appended to preview showing code, URL and instructions
          </li>
          <li>
            • <strong>BroadcastTemplate preview</strong> — Full email preview
            with conference branding
          </li>
          <li>
            • <strong>Localhost protection</strong> — Disables sending on
            localhost
          </li>
          <li>
            • <strong>Contact filtering</strong> — Sends to contact persons
            only, excludes billing contacts
          </li>
        </ul>
      </div>
    </div>
  ),
}
