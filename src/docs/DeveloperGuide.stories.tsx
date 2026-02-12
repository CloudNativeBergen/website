import type { Meta, StoryObj } from '@storybook/react'
import {
  CommandLineIcon,
  FolderIcon,
  DocumentTextIcon,
  BeakerIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Getting Started/Developer Guide',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const DeveloperGuide: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 font-space-grotesk text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Developer Guide
        </h1>
        <p className="mb-12 font-inter text-lg text-brand-slate-gray dark:text-gray-300">
          Everything you need to start building with the Cloud Native Days
          Norway component library.
        </p>

        {/* Quick Start */}
        <section className="mb-16">
          <h2 className="mb-6 flex items-center gap-3 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <CommandLineIcon className="h-7 w-7 text-brand-cloud-blue" />
            Quick Start
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="mb-2 font-inter text-sm text-gray-600 dark:text-gray-400">
                Clone the repository
              </p>
              <code className="block font-jetbrains text-sm text-brand-slate-gray dark:text-gray-200">
                git clone https://github.com/cloudnativebergen/website.git
              </code>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="mb-2 font-inter text-sm text-gray-600 dark:text-gray-400">
                Install dependencies
              </p>
              <code className="block font-jetbrains text-sm text-brand-slate-gray dark:text-gray-200">
                pnpm install
              </code>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="mb-2 font-inter text-sm text-gray-600 dark:text-gray-400">
                Start Storybook
              </p>
              <code className="block font-jetbrains text-sm text-brand-slate-gray dark:text-gray-200">
                pnpm storybook
              </code>
            </div>
          </div>
        </section>

        {/* Project Structure */}
        <section className="mb-16">
          <h2 className="mb-6 flex items-center gap-3 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <FolderIcon className="h-7 w-7 text-brand-fresh-green" />
            Project Structure
          </h2>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <pre className="font-jetbrains text-sm text-brand-slate-gray dark:text-gray-200">
              {`src/
├── components/           # React components
│   ├── admin/           # Admin interface components
│   │   └── sponsor-crm/ # Sponsor CRM components
│   ├── Button.tsx       # Shared button component
│   └── ...
├── docs/                # Storybook documentation
├── lib/                 # Utility functions
├── server/              # tRPC routers and schemas
└── styles/              # Global styles`}
            </pre>
          </div>
        </section>

        {/* Component Guidelines */}
        <section className="mb-16">
          <h2 className="mb-6 flex items-center gap-3 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <DocumentTextIcon className="h-7 w-7 text-brand-nordic-purple" />
            Component Guidelines
          </h2>
          <div className="space-y-6">
            <div className="rounded-lg border border-brand-cloud-blue/20 bg-brand-sky-mist p-6 dark:border-blue-500/20 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-cloud-blue dark:text-blue-400">
                TypeScript First
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                All components are written in TypeScript with strict type
                checking. Props interfaces are exported for reuse.
              </p>
            </div>

            <div className="rounded-lg border border-brand-fresh-green/20 bg-brand-fresh-green/10 p-6 dark:border-green-500/20 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-fresh-green dark:text-green-400">
                Tailwind CSS
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Use Tailwind utility classes for styling. Custom brand colors
                and tokens are defined in tailwind.config.ts.
              </p>
            </div>

            <div className="rounded-lg border border-brand-nordic-purple/20 bg-brand-nordic-purple/10 p-6 dark:border-purple-500/20 dark:bg-gray-800">
              <h3 className="mb-3 font-space-grotesk text-lg font-semibold text-brand-nordic-purple dark:text-purple-400">
                Heroicons
              </h3>
              <p className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                Always use Heroicons (@heroicons/react) for icons. Import from
                /24/outline for UI or /24/solid for emphasis.
              </p>
            </div>
          </div>
        </section>

        {/* Writing Stories */}
        <section className="mb-16">
          <h2 className="mb-6 flex items-center gap-3 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <BeakerIcon className="h-7 w-7 text-brand-sunbeam-yellow" />
            Writing Stories
          </h2>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <pre className="overflow-x-auto font-jetbrains text-sm text-brand-slate-gray dark:text-gray-200">
              {`import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MyComponent } from './MyComponent'

const meta = {
  title: 'Components/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Description of your component.',
      },
    },
  },
} satisfies Meta<typeof MyComponent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    variant: 'primary',
  },
}`}
            </pre>
          </div>
        </section>

        {/* Best Practices */}
        <section>
          <h2 className="mb-6 flex items-center gap-3 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <CheckCircleIcon className="h-7 w-7 text-brand-fresh-green" />
            Best Practices
          </h2>
          <ul className="space-y-4">
            {[
              'Run pnpm run check before committing changes',
              'Use semantic HTML elements for accessibility',
              'Keep components focused on a single responsibility',
              'Export TypeScript interfaces for component props',
              'Include JSDocs for complex props',
              'Test with both light and dark themes',
            ].map((practice, index) => (
              <li
                key={index}
                className="flex items-start gap-3 font-inter text-brand-slate-gray dark:text-gray-300"
              >
                <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-fresh-green" />
                {practice}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  ),
}
