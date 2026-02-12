import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import {
  XMarkIcon,
  PaperAirplaneIcon,
  DocumentTextIcon,
  EyeIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Admin/Sponsors/Email/SponsorIndividualEmailModal',
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const mockTemplates = [
  { id: 'welcome', name: 'Welcome Email', subject: 'Welcome as a sponsor!' },
  {
    id: 'reminder',
    name: 'Payment Reminder',
    subject: 'Invoice reminder for {{eventName}}',
  },
  {
    id: 'onboarding',
    name: 'Onboarding Link',
    subject: 'Complete your sponsor profile',
  },
  {
    id: 'contract',
    name: 'Contract Ready',
    subject: 'Your sponsorship contract is ready',
  },
]

function EmailModal() {
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Send Email
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            To: Maria Jensen (TechGiant Corp)
          </p>
        </div>
        <button className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-700">
          <XMarkIcon className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className="p-6">
        {/* Template Selector */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Template (Optional)
          </label>
          <div className="flex gap-2">
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">No template - write custom email</option>
              {mockTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              <DocumentTextIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Subject */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Body */}
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Message
            </label>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              {showPreview ? (
                <>
                  <PencilIcon className="h-4 w-4" />
                  Edit
                </>
              ) : (
                <>
                  <EyeIcon className="h-4 w-4" />
                  Preview
                </>
              )}
            </button>
          </div>
          {showPreview ? (
            <div className="min-h-48 rounded-lg border border-gray-300 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
              <p className="mb-4">Dear Maria,</p>
              <p className="mb-4">
                Thank you for your interest in sponsoring Cloud Native Days
                Bergen 2025!
              </p>
              <p className="mb-4">
                We&apos;re excited to have TechGiant Corp as part of our event.
              </p>
              <p>Best regards,</p>
              <p>The Cloud Native Days Team</p>
            </div>
          ) : (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Write your message... Use {{contactName}}, {{sponsorName}}, {{eventName}} for dynamic values."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          )}
        </div>

        {/* Variable Hints */}
        <div className="mb-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Available variables:
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {[
              '{{contactName}}',
              '{{sponsorName}}',
              '{{eventName}}',
              '{{tierName}}',
              '{{onboardingLink}}',
            ].map((v) => (
              <code
                key={v}
                className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-gray-600 dark:text-gray-300"
              >
                {v}
              </code>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
          Cancel
        </button>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <PaperAirplaneIcon className="h-4 w-4" />
          Send Email
        </button>
      </div>
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <div className="p-6">
      <EmailModal />
    </div>
  ),
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
          Supports template selection, variable substitution, and preview mode.
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
            - SponsorForConference to email
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              templates
            </code>{' '}
            - Available email templates
          </li>
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              conference
            </code>{' '}
            - Conference for context
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Features</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>• Optional template selection</li>
          <li>• Variable substitution (contact name, sponsor, etc.)</li>
          <li>• Live preview of rendered email</li>
          <li>• Sends via Resend API</li>
          <li>• Activity logged to sponsor timeline</li>
        </ul>
      </div>
    </div>
  ),
}
