import type { Meta, StoryObj } from '@storybook/react'

const meta = {
  title: 'Admin/Overview',
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Documentation: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 font-space-grotesk text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Admin System
        </h1>
        <p className="mb-12 font-inter text-lg text-brand-slate-gray dark:text-gray-300">
          Overview of the admin interface components and patterns used across
          the Cloud Native Days Norway platform.
        </p>

        {/* Access Control */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Access Control
          </h2>
          <div className="rounded-lg border border-brand-frosted-steel bg-brand-sky-mist p-6 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-4 font-inter text-brand-slate-gray dark:text-gray-300">
              Admin pages are protected by authentication middleware checking
              for <code className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-sm dark:bg-gray-700">is_organizer: true</code> in
              the user&apos;s speaker profile.
            </p>
            <div className="rounded-md bg-gray-900 p-4 text-sm text-gray-100">
              <pre>{`// Middleware protection example
if (!session?.user?.is_organizer) {
  redirect('/signin')
}`}</pre>
            </div>
          </div>
        </section>

        {/* Core Components */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Shared Components
          </h2>
          <p className="mb-6 font-inter text-brand-slate-gray dark:text-gray-300">
            These components are designed to be reusable across different admin
            domains.
          </p>

          <div className="grid gap-6">
            {/* EmailModal */}
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-xl font-semibold text-brand-nordic-purple dark:text-purple-400">
                EmailModal
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                A fully-featured email composition modal with rich text editing,
                draft auto-save, and preview capabilities. Used by both Sponsor
                and Speaker systems.
              </p>
              <div className="mb-4 rounded-md bg-gray-50 p-4 dark:bg-gray-900">
                <h4 className="mb-2 font-jetbrains text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Key Features:
                </h4>
                <ul className="space-y-1 font-inter text-sm text-gray-600 dark:text-gray-400">
                  <li>• Rich text editor with Portable Text</li>
                  <li>
                    • Auto-save drafts to localStorage with storage key
                    isolation
                  </li>
                  <li>
                    • Template selector integration for pre-built messages
                  </li>
                  <li>
                    • Email preview with custom preview component support
                  </li>
                  <li>
                    • Disabled send button on localhost (safety feature)
                  </li>
                </ul>
              </div>
              <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">
                {`import { EmailModal } from '@/components/admin'

<EmailModal
  isOpen={isOpen}
  onClose={onClose}
  title="Compose Email"
  recipientInfo={<RecipientBadges />}
  fromAddress="hello@cloudnativedays.no"
  onSend={handleSend}
  previewComponent={EmailPreview}
  templateSelector={TemplateSelector}
  storageKey="unique-draft-key"
/>`}
              </pre>
            </div>

            {/* ConfirmationModal */}
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-xl font-semibold text-brand-nordic-purple dark:text-purple-400">
                ConfirmationModal
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                A simple confirmation dialog for destructive or important actions.
              </p>
              <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">
                {`import { ConfirmationModal } from '@/components/admin'

<ConfirmationModal
  isOpen={isOpen}
  onClose={onClose}
  onConfirm={handleDelete}
  title="Delete Item"
  message="Are you sure? This action cannot be undone."
  confirmButtonText="Delete"
  variant="danger"
  isLoading={isPending}
/>`}
              </pre>
            </div>

            {/* NotificationProvider */}
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-xl font-semibold text-brand-nordic-purple dark:text-purple-400">
                NotificationProvider
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Toast notification system for success, error, warning, and info
                messages.
              </p>
              <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">
                {`import { useNotification } from '@/components/admin'

const { showNotification } = useNotification()

showNotification({
  type: 'success',
  title: 'Saved!',
  message: 'Your changes have been saved.',
})`}
              </pre>
            </div>

            {/* AdminPageHeader */}
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-xl font-semibold text-brand-nordic-purple dark:text-purple-400">
                AdminPageHeader
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Consistent page header with icon, title, description, and
                optional action buttons.
              </p>
              <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">
                {`import { AdminPageHeader } from '@/components/admin'

<AdminPageHeader
  icon={ChartBarIcon}
  title="Sponsor Management"
  description="Manage sponsorships for {conference}"
  backLink="/admin/sponsors"
  actions={<ActionButtons />}
/>`}
              </pre>
            </div>

            {/* FilterDropdown */}
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-xl font-semibold text-brand-nordic-purple dark:text-purple-400">
                FilterDropdown
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Dropdown filter component with multi-select support and badges
                showing active filters.
              </p>
              <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">
                {`import { FilterDropdown } from '@/components/admin'

<FilterDropdown
  label="Status"
  options={statusOptions}
  value={selectedStatuses}
  onChange={setSelectedStatuses}
  multiSelect
/>`}
              </pre>
            </div>

            {/* LoadingSkeleton */}
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-xl font-semibold text-brand-nordic-purple dark:text-purple-400">
                LoadingSkeleton
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Animated loading states for tables, cards, and content areas.
              </p>
              <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">
                {`import { LoadingSkeleton } from '@/components/admin'

<LoadingSkeleton type="table" rows={5} />
<LoadingSkeleton type="card" count={3} />`}
              </pre>
            </div>
          </div>
        </section>

        {/* Admin Domains */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Admin Domains
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Sponsors
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Full CRM pipeline, tier management, contract tracking, email
                templates, and onboarding.
              </p>
              <p className="mt-2 font-jetbrains text-xs text-gray-500 dark:text-gray-500">
                → See Systems/Sponsors
              </p>
            </div>

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Proposals
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                CFP review workflow, scoring, bulk actions, and speaker
                communication.
              </p>
              <p className="mt-2 font-jetbrains text-xs text-gray-500 dark:text-gray-500">
                → See Admin/Proposals
              </p>
            </div>

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Speakers
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Speaker profiles, travel management, and speaker communication
                tools.
              </p>
            </div>

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Schedule
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Drag-and-drop schedule builder, room assignments, and
                time slot management.
              </p>
            </div>

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Tickets
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Sales analytics, discount codes, registration settings, and
                attendee management.
              </p>
            </div>

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Marketing
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Photo galleries, meme generator, featured content curation,
                and social media assets.
              </p>
            </div>
          </div>
        </section>

        {/* Best Practices */}
        <section>
          <h2 className="mb-6 font-space-grotesk text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Best Practices
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg bg-brand-sky-mist p-4 dark:bg-gray-800">
              <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-gray-200">
                1. Use tRPC for data operations
              </h3>
              <p className="mt-1 font-inter text-sm text-brand-slate-gray dark:text-gray-400">
                All admin data operations should use tRPC for type safety and
                automatic cache invalidation.
              </p>
            </div>
            <div className="rounded-lg bg-brand-sky-mist p-4 dark:bg-gray-800">
              <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-gray-200">
                2. Consistent error handling
              </h3>
              <p className="mt-1 font-inter text-sm text-brand-slate-gray dark:text-gray-400">
                Use NotificationProvider for user feedback and ErrorDisplay for
                recoverable errors.
              </p>
            </div>
            <div className="rounded-lg bg-brand-sky-mist p-4 dark:bg-gray-800">
              <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-gray-200">
                3. Dark mode support
              </h3>
              <p className="mt-1 font-inter text-sm text-brand-slate-gray dark:text-gray-400">
                All admin components must support dark mode using Tailwind&apos;s
                dark: variant.
              </p>
            </div>
            <div className="rounded-lg bg-brand-sky-mist p-4 dark:bg-gray-800">
              <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-gray-200">
                4. Responsive design
              </h3>
              <p className="mt-1 font-inter text-sm text-brand-slate-gray dark:text-gray-400">
                Admin interfaces should be functional on mobile devices with
                appropriate breakpoint handling.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
}
