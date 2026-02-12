import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const meta = {
  title: 'Systems/Sponsors',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Architecture: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 font-space-grotesk text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Sponsor System
        </h1>
        <p className="mb-12 font-inter text-lg text-brand-slate-gray dark:text-gray-300">
          The sponsor system manages the full lifecycle of conference
          sponsorships, from initial prospecting through contract signing
          and onboarding.
        </p>

        {/* Admin Pages Overview */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Admin Interface
          </h2>
          <p className="mb-4 font-inter text-brand-slate-gray dark:text-gray-300">
            The sponsor admin interface provides tools for managing the full
            sponsorship lifecycle. See{' '}
            <strong>Admin/Sponsors</strong> in Storybook for component
            documentation.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <span className="font-jetbrains text-sm text-gray-600 dark:text-gray-400">
                /admin/sponsors
              </span>
              <p className="text-xs text-gray-500">Dashboard</p>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <span className="font-jetbrains text-sm text-gray-600 dark:text-gray-400">
                /admin/sponsors/crm
              </span>
              <p className="text-xs text-gray-500">Pipeline</p>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <span className="font-jetbrains text-sm text-gray-600 dark:text-gray-400">
                /admin/sponsors/tiers
              </span>
              <p className="text-xs text-gray-500">Tier Management</p>
            </div>
          </div>
        </section>

        {/* System Domains */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            System Domains
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-brand-cloud-blue/20 bg-brand-sky-mist p-6 dark:border-blue-500/20 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                Sponsor Management
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Core sponsor entity registry. Conference-independent.
              </p>
              <ul className="space-y-2 font-inter text-sm text-brand-slate-gray dark:text-gray-400">
                <li>• Company profiles</li>
                <li>• Logo management (SVG with light/dark variants)</li>
                <li>• Tier definitions with pricing</li>
                <li>• Public display components</li>
              </ul>
            </div>

            <div className="rounded-lg border border-brand-fresh-green/20 bg-brand-sky-mist p-6 dark:border-green-500/20 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-xl font-semibold text-brand-fresh-green dark:text-green-400">
                Sponsor CRM
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Per-conference relationship pipeline.
              </p>
              <ul className="space-y-2 font-inter text-sm text-brand-slate-gray dark:text-gray-400">
                <li>• Pipeline management (Kanban view)</li>
                <li>• Contract tracking and generation</li>
                <li>• Invoice status tracking</li>
                <li>• Self-service onboarding portal</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Data Model */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Data Model
          </h2>

          <div className="space-y-6">
            {/* Sponsor */}
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-jetbrains text-lg font-semibold text-brand-nordic-purple dark:text-purple-400">
                Sponsor
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Base company record.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue dark:text-blue-400">
                    name
                  </code>
                  <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                    Company name
                  </p>
                </div>
                <div>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue dark:text-blue-400">
                    website
                  </code>
                  <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                    Company URL
                  </p>
                </div>
                <div>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue dark:text-blue-400">
                    logo
                  </code>
                  <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                    Inline SVG logo
                  </p>
                </div>
                <div>
                  <code className="font-jetbrains text-xs text-brand-cloud-blue dark:text-blue-400">
                    logoBright
                  </code>
                  <p className="font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                    Bright variant for dark backgrounds
                  </p>
                </div>
              </div>
            </div>

            {/* Sponsor Tier */}
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-jetbrains text-lg font-semibold text-brand-nordic-purple dark:text-purple-400">
                Sponsor Tier
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Defines sponsorship levels and pricing.
              </p>
              <div className="mb-4">
                <h4 className="mb-2 font-space-grotesk text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                  Tier Types:
                </h4>
                <ul className="space-y-1 font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                  <li>
                    <strong>Standard</strong> - Regular sponsorship packages
                  </li>
                  <li>
                    <strong>Special</strong> - Media partners, community
                    sponsors
                  </li>
                  <li>
                    <strong>Addon</strong> - Additional purchases
                  </li>
                </ul>
              </div>
            </div>

            {/* Sponsor For Conference */}
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-jetbrains text-lg font-semibold text-brand-nordic-purple dark:text-purple-400">
                Sponsor For Conference
              </h3>
              <p className="mb-4 font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                CRM join document linking sponsors to conferences.
              </p>
              <div className="mb-4">
                <h4 className="mb-2 font-space-grotesk text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                  Pipeline Stages:
                </h4>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded bg-brand-sky-mist px-3 py-1 font-inter text-xs text-brand-cloud-blue dark:bg-blue-900/30 dark:text-blue-400">
                    Prospect
                  </span>
                  <span className="rounded bg-brand-sky-mist px-3 py-1 font-inter text-xs text-brand-cloud-blue dark:bg-blue-900/30 dark:text-blue-400">
                    Contacted
                  </span>
                  <span className="rounded bg-brand-sky-mist px-3 py-1 font-inter text-xs text-brand-cloud-blue dark:bg-blue-900/30 dark:text-blue-400">
                    Negotiating
                  </span>
                  <span className="rounded bg-brand-fresh-green/20 px-3 py-1 font-inter text-xs text-brand-fresh-green dark:bg-green-900/30 dark:text-green-400">
                    Closed Won
                  </span>
                  <span className="rounded bg-red-100 px-3 py-1 font-inter text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    Closed Lost
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Features
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Pipeline Management
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Kanban-style board interface with drag-and-drop, bulk
                operations, and multiple board views.
              </p>
            </div>

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Contract Generation
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Automated PDF generation with template-based structure and
                variable substitution.
              </p>
            </div>

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Digital Signatures
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Integration with e-signing providers, status tracking, and
                reminder functionality.
              </p>
            </div>

            <div className="rounded-lg border border-brand-frosted-steel bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Onboarding Portal
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Self-service sponsor portal for logo upload, company info, and
                billing details.
              </p>
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section>
          <h2 className="mb-6 font-space-grotesk text-3xl font-semibold text-brand-cloud-blue dark:text-blue-400">
            Technology Stack
          </h2>
          <div className="rounded-lg bg-brand-sky-mist p-6 dark:bg-gray-800">
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <h3 className="mb-3 font-jetbrains text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                  Frontend
                </h3>
                <ul className="space-y-1 font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                  <li>• Next.js 15</li>
                  <li>• Tailwind CSS 4</li>
                  <li>• TypeScript 5.8</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-3 font-jetbrains text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                  Backend
                </h3>
                <ul className="space-y-1 font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                  <li>• tRPC</li>
                  <li>• Sanity.io</li>
                  <li>• NextAuth.js 5.0</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-3 font-jetbrains text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                  Infrastructure
                </h3>
                <ul className="space-y-1 font-inter text-xs text-brand-slate-gray dark:text-gray-400">
                  <li>• Vercel</li>
                  <li>• Resend</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
}

export const WorkflowDiagram: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 font-space-grotesk text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Sponsor Workflow
        </h1>

        {/* Pipeline Flow */}
        <div className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
            Pipeline Flow
          </h2>
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sky-mist dark:bg-blue-900/30">
                <span className="font-jetbrains text-2xl text-brand-cloud-blue dark:text-blue-400">
                  1
                </span>
              </div>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Prospect
              </p>
            </div>
            <div className="h-1 flex-1 bg-brand-frosted-steel dark:bg-gray-700"></div>
            <div className="text-center">
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sky-mist dark:bg-blue-900/30">
                <span className="font-jetbrains text-2xl text-brand-cloud-blue dark:text-blue-400">
                  2
                </span>
              </div>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Contacted
              </p>
            </div>
            <div className="h-1 flex-1 bg-brand-frosted-steel dark:bg-gray-700"></div>
            <div className="text-center">
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-brand-sky-mist dark:bg-blue-900/30">
                <span className="font-jetbrains text-2xl text-brand-cloud-blue dark:text-blue-400">
                  3
                </span>
              </div>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Negotiating
              </p>
            </div>
            <div className="h-1 flex-1 bg-brand-frosted-steel dark:bg-gray-700"></div>
            <div className="text-center">
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-brand-fresh-green/20 dark:bg-green-900/30">
                <span className="font-jetbrains text-2xl text-brand-fresh-green dark:text-green-400">
                  ✓
                </span>
              </div>
              <p className="font-inter text-sm text-brand-fresh-green dark:text-green-400">
                Closed Won
              </p>
            </div>
          </div>
        </div>

        {/* Contract Workflow */}
        <div className="mb-16">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-gray-200">
            Contract Workflow
          </h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-lg border border-brand-frosted-steel bg-brand-sky-mist p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-cloud-blue text-white">
                1
              </div>
              <div className="flex-1">
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  None
                </h3>
                <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
                  No contract discussion
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-lg border border-brand-frosted-steel bg-brand-sky-mist p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-cloud-blue text-white">
                2
              </div>
              <div className="flex-1">
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Verbal Agreement
                </h3>
                <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
                  Terms agreed verbally
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-lg border border-brand-frosted-steel bg-brand-sky-mist p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-cloud-blue text-white">
                3
              </div>
              <div className="flex-1">
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                  Contract Sent
                </h3>
                <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
                  PDF generated and sent for signing
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-lg border border-brand-fresh-green/20 bg-brand-fresh-green/10 p-4 dark:border-green-500/20 dark:bg-green-900/20">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-fresh-green text-white">
                ✓
              </div>
              <div className="flex-1">
                <h3 className="font-space-grotesk font-semibold text-brand-fresh-green dark:text-green-400">
                  Contract Signed
                </h3>
                <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-400">
                  Digitally signed and executed
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
}
