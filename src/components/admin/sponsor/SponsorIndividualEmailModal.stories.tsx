import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { XMarkIcon, EyeIcon, ClockIcon } from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Sponsors/Admin/Email/SponsorIndividualEmailModal',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Modal for composing and sending individual emails to sponsor contacts. Built on top of the base EmailModal component, it adds CRM-aware default subjects based on sponsor pipeline status, a SponsorTemplatePicker for applying pre-built templates, and BroadcastTemplate-based email preview. Sends via the `/admin/api/sponsors/email/send` endpoint.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const mockTemplates = [
  { id: 'welcome', name: 'Welcome Email', subject: 'Welcome as a sponsor!' },
  {
    id: 'reminder',
    name: 'Payment Reminder',
    subject: 'Invoice reminder for Cloud Native Days Norway 2025',
  },
  {
    id: 'registration',
    name: 'Registration Link',
    subject: 'Complete your sponsor profile',
  },
  {
    id: 'contract',
    name: 'Contract Ready',
    subject: 'Your sponsorship contract is ready',
  },
]

function EmailModalMockup({
  showDraftIndicator = false,
}: {
  showDraftIndicator?: boolean
}) {
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [subject, setSubject] = useState(
    'Partnership opportunity: Cloud Native Days Norway 2025',
  )
  const [body, setBody] = useState(
    'Dear TechGiant Corp team,\n\nWe would love to have you as a sponsor for our upcoming conference.\n\nBest regards,\nThe Cloud Native Days Team',
  )
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 p-6 pb-4 dark:border-gray-700">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-space-grotesk text-xl font-semibold text-gray-900 dark:text-white">
              Compose Sponsor Email
            </h2>
            {showDraftIndicator && (
              <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                <ClockIcon className="h-3 w-3" />
                <span>Draft saved</span>
              </div>
            )}
          </div>
          <p className="font-inter mt-1 text-sm text-gray-600 dark:text-gray-400">
            Sponsor: TechGiant Corp
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
                Maria Jensen &lt;maria@techgiant.com&gt;
              </span>
              <span className="font-inter rounded-full bg-brand-sky-mist px-3 py-1 text-sm text-brand-slate-gray dark:bg-gray-700 dark:text-gray-300">
                Erik Olsen &lt;erik@techgiant.com&gt;
              </span>
            </div>
          </div>

          <div className="flex items-center border-b border-gray-200/50 px-6 py-3 dark:border-gray-700/50">
            <div className="flex w-1/2 items-center">
              <label className="font-space-grotesk w-16 text-sm font-medium text-gray-600 dark:text-gray-300">
                From:
              </label>
              <span className="font-inter text-sm text-gray-600 dark:text-gray-300">
                conference@cloudnativebergen.no
              </span>
            </div>
            <div className="flex w-1/2 items-center border-l border-gray-200/50 pl-4 dark:border-gray-700/50">
              <label className="font-space-grotesk mr-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                Template:
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Select template...</option>
                {mockTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
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
        </div>

        <div className="px-6 pt-2 pb-6">
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
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p className="mb-4">Dear TechGiant Corp team,</p>
                  <p className="mb-4">
                    We would love to have you as a sponsor for our upcoming
                    conference.
                  </p>
                  <p>Best regards,</p>
                  <p>The Cloud Native Days Team</p>
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
      <EmailModalMockup />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The compose view with To recipients as badges, From address, template picker, CRM-aware subject, and rich text editor.',
      },
    },
  },
}

export const WithDraftSaved: Story = {
  render: () => (
    <div className="p-6">
      <EmailModalMockup showDraftIndicator />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Drafts auto-save to localStorage keyed per sponsor. A badge in the header shows when a draft has been saved.',
      },
    },
  },
}

export const Documentation: Story = {
  render: () => (
    <div className="max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SponsorIndividualEmailModal
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Modal for composing and sending individual emails to sponsor contacts.
          Built on the base EmailModal with CRM-specific features.
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
              onSent
            </code>{' '}
            - Optional callback after successful send
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              sponsorForConference
            </code>{' '}
            - SponsorForConferenceExpanded with contacts
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              domain / fromEmail / senderName
            </code>{' '}
            - Sending configuration
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              conference
            </code>{' '}
            - Conference context (title, dates, domains, social links)
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Key Features
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            • <strong>Smart subject defaults</strong> — Auto-generated from CRM
            pipeline status (prospect, contacted, negotiating, closed-won)
          </li>
          <li>
            • <strong>Template picker</strong> — SponsorTemplatePicker with
            CRM-aware context (tags, status, currency)
          </li>
          <li>
            • <strong>BroadcastTemplate preview</strong> — Rendered email
            preview matching the actual sent format
          </li>
          <li>
            • <strong>Auto-save drafts</strong> — Per-sponsor localStorage
            persistence
          </li>
          <li>
            • <strong>Localhost protection</strong> — Disables sending on
            localhost with a warning
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Subject Generation Logic
        </h3>
        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-600">
                <th className="py-1 pr-2">Status</th>
                <th className="py-1">Subject Pattern</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 pr-2">prospect</td>
                <td className="py-1">Partnership opportunity: ...</td>
              </tr>
              <tr>
                <td className="py-1 pr-2">contacted</td>
                <td className="py-1">Following up: Sponsorship for ...</td>
              </tr>
              <tr>
                <td className="py-1 pr-2">negotiating</td>
                <td className="py-1">Sponsorship proposal - ...</td>
              </tr>
              <tr>
                <td className="py-1 pr-2">closed-won + invoice</td>
                <td className="py-1">Sponsorship Invoice: ...</td>
              </tr>
              <tr>
                <td className="py-1 pr-2">closed-won + contract</td>
                <td className="py-1">Sponsorship Contract: ...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}
