import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BoltIcon } from '@heroicons/react/24/solid'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { within, userEvent, waitFor } from 'storybook/test'
import { SponsorActivityTimeline } from './SponsorActivityTimeline'

const now = new Date().toISOString()

// A user-authored note (editable) and a system stage_change (locked). Only the
// note exposes the edit pencil; SE-4's edit affordance is type-gated.
const editableActivities = [
  {
    _id: 'act-note',
    _createdAt: now,
    _updatedAt: now,
    sponsorForConference: {
      _id: 'sfc-1',
      sponsor: { _id: 'sp-1', name: 'Tieto Tech Consulting' },
    },
    activityType: 'note',
    description: 'Met at the booth — very interested in the Gold tier.',
    createdBy: { _id: 'org-1', name: 'Hans K.', email: 'hans@example.com' },
    createdAt: now,
  },
  {
    _id: 'act-stage',
    _createdAt: now,
    _updatedAt: now,
    sponsorForConference: {
      _id: 'sfc-1',
      sponsor: { _id: 'sp-1', name: 'Tieto Tech Consulting' },
    },
    activityType: 'stage_change',
    description: 'Status changed from Prospect to Negotiating',
    createdBy: null,
    createdAt: now,
  },
]

const editHandlers = [
  http.get('/api/trpc/sponsor.crm.activities.list', () =>
    HttpResponse.json({ result: { data: editableActivities } }),
  ),
  http.post('/api/trpc/sponsor.crm.activities.update', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const meta = {
  title: 'Systems/Sponsors/Admin/Dashboard/Activity Timeline',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Chronological feed of sponsor activities grouped by day. Shows status changes, emails sent, contract events, and registration milestones with icons and timestamps.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function ActivityIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    status_change: (
      <svg
        className="h-3 w-3 text-blue-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
    created: (
      <svg
        className="h-3 w-3 text-green-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    contract_change: (
      <svg
        className="h-3 w-3 text-purple-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  }
  return (
    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
      {icons[type] || icons.status_change}
    </div>
  )
}

export const ActivityTimeline: Story = {
  render: () => (
    <div className="w-full max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="font-space-grotesk text-3xl font-bold text-gray-900 dark:text-white">
          Sponsor Activity Timeline
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Shows a chronological feed of sponsor-related activities grouped by
          day and sponsor.
        </p>
      </div>

      {/* Live Example */}
      <div>
        <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Live Example
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Activity
          </h3>

          <div className="mt-4 space-y-5">
            {/* Today */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">
                  Today
                </span>
                <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700/50" />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    Tieto Tech Consulting
                  </span>
                </div>
                <div className="flex items-start gap-2.5 py-1.5">
                  <ActivityIcon type="status_change" />
                  <p className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-300">
                    Status changed from Prospect to Negotiating
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <img
                      src="https://i.pravatar.cc/20?u=hans"
                      alt="Hans K."
                      className="h-5 w-5 rounded-full object-cover"
                      title="Hans K."
                    />
                    <time className="text-xs text-gray-400">
                      about 2 hours ago
                    </time>
                  </div>
                </div>
              </div>
            </div>

            {/* Yesterday */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">
                  Yesterday
                </span>
                <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700/50" />
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      Aiven
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5 py-1.5">
                    <ActivityIcon type="created" />
                    <p className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-300">
                      Sponsor opportunity created in pipeline
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <img
                        src="https://i.pravatar.cc/20?u=erik"
                        alt="Erik S."
                        className="h-5 w-5 rounded-full object-cover"
                        title="Erik S."
                      />
                      <time className="text-xs text-gray-400">
                        about 15 hours ago
                      </time>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      KS Digital
                    </span>
                    <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      2
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    <div className="flex items-start gap-2.5 py-1.5">
                      <ActivityIcon type="contract_change" />
                      <p className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-300">
                        Contract status changed from None to Verbal Agreement
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <div
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30"
                          title="Automatic"
                        >
                          <BoltIcon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <time className="text-xs text-gray-400">
                          about 20 hours ago
                        </time>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 py-1.5">
                      <ActivityIcon type="status_change" />
                      <p className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-300">
                        Status changed from Negotiating to Closed Won
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <img
                          src="https://i.pravatar.cc/20?u=hans"
                          alt="Hans K."
                          className="h-5 w-5 rounded-full object-cover"
                          title="Hans K."
                        />
                        <time className="text-xs text-gray-400">
                          about 20 hours ago
                        </time>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
            <a
              href="#"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              View all in CRM →
            </a>
          </div>
        </div>
      </div>

      {/* Activity Types */}
      <div>
        <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Activity Types
        </h2>
        <div className="grid gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <ActivityIcon type="created" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Created
              </p>
              <p className="text-sm text-gray-500">Sponsor added to pipeline</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <ActivityIcon type="status_change" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Status Change
              </p>
              <p className="text-sm text-gray-500">Pipeline stage transition</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <ActivityIcon type="contract_change" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Contract Change
              </p>
              <p className="text-sm text-gray-500">Contract status updated</p>
            </div>
          </div>
        </div>
      </div>

      {/* Usage */}
      <div className="rounded-lg bg-gray-50 p-6 dark:bg-gray-800/50">
        <h2 className="font-space-grotesk mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          Usage
        </h2>
        <pre className="overflow-x-auto rounded-md bg-gray-900 p-4 text-sm text-gray-100">
          {`import { SponsorActivityTimeline } from '@/components/admin/sponsor'

// Dashboard view (with header and footer)
<SponsorActivityTimeline
  limit={10}
  showHeaderFooter={true}
/>

// Single sponsor view (inline)
<SponsorActivityTimeline
  sponsorForConferenceId={sponsorId}
  showHeaderFooter={false}
  limit={20}
/>`}
        </pre>
      </div>
    </div>
  ),
}

/**
 * SE-4 — real component with the inline edit affordance. The play function
 * opens the editor on the user-authored note so the shoot captures the edit UI.
 */
export const EditActivity: Story = {
  parameters: {
    layout: 'centered',
    msw: { handlers: editHandlers },
  },
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
        <div className="w-[32rem] bg-white p-6">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
  render: () => (
    <SponsorActivityTimeline sponsorForConferenceId="sfc-1" showHeaderFooter />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const editButton = await waitFor(() =>
      canvas.getByLabelText('Edit activity'),
    )
    await userEvent.click(editButton)
    await canvas.findByLabelText('Edit activity description')
  },
}

export const EditActivityDark: Story = {
  parameters: {
    layout: 'centered',
    theme: 'dark',
    backgrounds: { default: 'dark' },
    msw: { handlers: editHandlers },
  },
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" forcedTheme="dark" enableSystem={false}>
        <div className="dark">
          <div className="w-[32rem] bg-gray-950 p-6">
            <Story />
          </div>
        </div>
      </ThemeProvider>
    ),
  ],
  render: () => (
    <SponsorActivityTimeline sponsorForConferenceId="sfc-1" showHeaderFooter />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const editButton = await waitFor(() =>
      canvas.getByLabelText('Edit activity'),
    )
    await userEvent.click(editButton)
    await canvas.findByLabelText('Edit activity description')
  },
}
