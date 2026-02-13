import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CommandLineIcon,
  FolderIcon,
  DocumentTextIcon,
  BeakerIcon,
  CheckCircleIcon,
  WrenchScrewdriverIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  PlayIcon,
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

const CodeBlock = ({
  children,
  title,
}: {
  children: string
  title?: string
}) => (
  <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
    {title && (
      <div className="border-b border-gray-200 bg-gray-100 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/80">
        <span className="font-jetbrains text-xs text-gray-500 dark:text-gray-400">
          {title}
        </span>
      </div>
    )}
    <pre className="overflow-x-auto bg-gray-50 p-4 dark:bg-gray-800">
      <code className="font-jetbrains text-sm leading-relaxed text-brand-slate-gray dark:text-gray-200">
        {children}
      </code>
    </pre>
  </div>
)

const Tip = ({
  children,
  variant = 'info',
}: {
  children: React.ReactNode
  variant?: 'info' | 'warning'
}) => {
  const isWarning = variant === 'warning'
  return (
    <div
      className={`flex gap-3 rounded-lg border p-4 ${
        isWarning
          ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/5'
          : 'border-brand-cloud-blue/20 bg-brand-cloud-blue/5 dark:border-blue-500/20 dark:bg-blue-500/5'
      }`}
    >
      {isWarning ? (
        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      ) : (
        <LightBulbIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-cloud-blue" />
      )}
      <div className="font-inter text-sm leading-relaxed text-brand-slate-gray dark:text-gray-300">
        {children}
      </div>
    </div>
  )
}

export const DeveloperGuide: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-space-grotesk mb-2 text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Developer Guide
        </h1>
        <p className="font-inter mb-14 text-lg text-gray-500 dark:text-gray-400">
          Setup, conventions, and everything you need to contribute to the Cloud
          Native Days Norway component library.
        </p>

        {/* Prerequisites */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 flex items-center gap-3 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <CommandLineIcon className="h-7 w-7 text-brand-cloud-blue" />
            Quick start
          </h2>
          <div className="space-y-3">
            <CodeBlock title="1. Clone and install">
              {`git clone https://github.com/cloudnativebergen/website.git
cd website
pnpm install`}
            </CodeBlock>
            <CodeBlock title="2. Start development">
              {`pnpm run dev          # Next.js dev server (Turbopack)
pnpm storybook        # Storybook on port 6006`}
            </CodeBlock>
            <CodeBlock title="3. Validate before committing">
              {`pnpm run check        # typecheck + lint + knip + format`}
            </CodeBlock>
          </div>
          <Tip>
            Always run{' '}
            <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
              pnpm run check
            </code>{' '}
            before pushing. It runs TypeScript type checking, ESLint, Knip
            (unused exports), and Prettier in sequence.
          </Tip>
        </section>

        {/* Project Structure */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 flex items-center gap-3 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <FolderIcon className="h-7 w-7 text-brand-fresh-green" />
            Project structure
          </h2>
          <CodeBlock>
            {`src/
├── components/              # React components
│   ├── admin/               # Admin interface (organizer-only)
│   │   ├── sponsor/         # Sponsor management
│   │   └── sponsor-crm/     # CRM pipeline & boards
│   ├── program/             # Schedule & agenda views
│   ├── proposal/            # CFP submission flow
│   ├── speaker/             # Speaker profiles
│   ├── email/               # Email templates
│   └── Button.tsx           # Shared components at root
├── docs/                    # Storybook documentation pages
│   └── design-system/       # Brand, foundation, examples
├── lib/                     # Business logic & utilities
│   ├── conference/          # Conference config & phases
│   ├── sponsor/             # Sponsor types & queries
│   ├── speaker/             # Speaker types & queries
│   ├── proposal/            # Proposal state machine
│   └── time.ts              # Date/time utilities
├── server/                  # tRPC routers & schemas
│   ├── routers/             # API route handlers
│   └── schemas/             # Zod validation schemas
└── app/                     # Next.js App Router pages
    ├── (main)/              # Public-facing routes
    └── admin/               # Admin routes`}
          </CodeBlock>
        </section>

        {/* Coding Conventions */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 flex items-center gap-3 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <DocumentTextIcon className="h-7 w-7 text-brand-nordic-purple" />
            Coding conventions
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                TypeScript
              </h3>
              <p className="font-inter text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Strict mode enabled. Export prop interfaces for reuse. Use{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  satisfies
                </code>{' '}
                for type narrowing. Prefer explicit return types on exported
                functions.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                Tailwind CSS
              </h3>
              <p className="font-inter text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Utility-first with brand tokens from{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  tailwind.config.ts
                </code>
                . Use{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  brand-cloud-blue
                </code>
                ,{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  brand-fresh-green
                </code>
                , etc. Always support dark mode.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                Icons
              </h3>
              <p className="font-inter text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Always use{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  @heroicons/react
                </code>
                . Import from{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  /24/outline
                </code>{' '}
                for UI chrome,{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  /24/solid
                </code>{' '}
                for emphasis. Never create custom SVGs.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                Date &amp; time
              </h3>
              <p className="font-inter text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Use helpers from{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  @/lib/time
                </code>{' '}
                instead of raw{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  new Date()
                </code>
                . Conference dates use Europe/Oslo timezone.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                JSX content
              </h3>
              <p className="font-inter text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Use HTML entities ({' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  &amp;apos;
                </code>{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  &amp;quot;
                </code>
                ) instead of raw quotes in JSX text.
              </p>
            </div>
          </div>
        </section>

        {/* Available Commands */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 flex items-center gap-3 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <WrenchScrewdriverIcon className="h-7 w-7 text-brand-sunbeam-yellow" />
            Available commands
          </h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                  <th className="font-space-grotesk px-4 py-3 text-sm font-semibold text-brand-slate-gray dark:text-white">
                    Command
                  </th>
                  <th className="font-space-grotesk px-4 py-3 text-sm font-semibold text-brand-slate-gray dark:text-white">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {[
                  ['pnpm run dev', 'Next.js dev server with Turbopack'],
                  ['pnpm storybook', 'Storybook on localhost:6006'],
                  [
                    'pnpm run check',
                    'Full validation: typecheck + lint + knip + format',
                  ],
                  ['pnpm run test', 'Run Jest test suite'],
                  ['pnpm run test:watch', 'Jest in watch mode'],
                  ['pnpm run lint:fix', 'Auto-fix linting issues'],
                  ['pnpm run build', 'Production build'],
                  [
                    'pnpm run storybook:test-ci',
                    'Build Storybook and run interaction tests',
                  ],
                ].map(([cmd, desc]) => (
                  <tr key={cmd} className="bg-white dark:bg-gray-800/30">
                    <td className="px-4 py-2.5">
                      <code className="font-jetbrains text-sm text-brand-cloud-blue">
                        {cmd}
                      </code>
                    </td>
                    <td className="font-inter px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                      {desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Tip variant="warning">
              Use{' '}
              <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                pnpm sanity
              </code>{' '}
              for Sanity CLI commands &mdash; never{' '}
              <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                npx sanity
              </code>
              .
            </Tip>
          </div>
        </section>

        {/* Writing Stories */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 flex items-center gap-3 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <BeakerIcon className="h-7 w-7 text-brand-cloud-blue" />
            Writing stories
          </h2>

          <p className="font-inter mb-6 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            Story files live alongside their components. Use{' '}
            <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
              tags: [&apos;autodocs&apos;]
            </code>{' '}
            to auto-generate a docs page from props. Documentation-only stories
            (like architecture pages) go in{' '}
            <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
              src/docs/
            </code>
            .
          </p>

          <div className="space-y-4">
            <CodeBlock title="Component story — src/components/MyWidget.stories.tsx">
              {`import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MyWidget } from './MyWidget'

const meta = {
  title: 'Components/Layout/MyWidget',
  component: MyWidget,
  tags: ['autodocs'],
} satisfies Meta<typeof MyWidget>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { variant: 'primary' },
}

export const WithIcon: Story = {
  args: { variant: 'primary', icon: true },
}`}
            </CodeBlock>

            <CodeBlock title="Interaction test with play function">
              {`import { expect, fn, userEvent, within } from 'storybook/test'

export const ClickTest: Story = {
  args: { onClick: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await expect(args.onClick).toHaveBeenCalled()
  },
}`}
            </CodeBlock>
          </div>

          <div className="mt-6 space-y-4">
            <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
              Story organization
            </h3>
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                    <th className="font-space-grotesk px-4 py-3 text-sm font-semibold text-brand-slate-gray dark:text-white">
                      Title prefix
                    </th>
                    <th className="font-space-grotesk px-4 py-3 text-sm font-semibold text-brand-slate-gray dark:text-white">
                      What goes here
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {[
                    [
                      'Components/{Category}/',
                      'Generic reusable UI (layout, forms, feedback, icons)',
                    ],
                    [
                      'Systems/{Name}/',
                      'Domain components (Program, Proposals, Speakers, Sponsors)',
                    ],
                    [
                      'Systems/{Name}/Admin/',
                      'Organizer-only admin components for that system',
                    ],
                    [
                      'Design System/',
                      'Brand tokens, foundation, integration examples',
                    ],
                  ].map(([prefix, desc]) => (
                    <tr key={prefix} className="bg-white dark:bg-gray-800/30">
                      <td className="px-4 py-2.5">
                        <code className="font-jetbrains text-sm text-brand-nordic-purple">
                          {prefix}
                        </code>
                      </td>
                      <td className="font-inter px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                        {desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Tip>
              Match the export name to the last segment of the title to avoid
              Storybook creating a subfolder with a single page. For example,
              title{' '}
              <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                Brand/Typography
              </code>{' '}
              should export{' '}
              <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                Typography
              </code>
              , not{' '}
              <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                TypographySystem
              </code>
              .
            </Tip>
          </div>
        </section>

        {/* Testing */}
        <section className="mb-16">
          <h2 className="font-space-grotesk mb-6 flex items-center gap-3 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <PlayIcon className="h-7 w-7 text-brand-fresh-green" />
            Testing
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                Unit tests
              </h3>
              <p className="font-inter text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Jest with Testing Library. Tests live in{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  __tests__/
                </code>{' '}
                mirroring the{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  src/
                </code>{' '}
                structure. Run with{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  pnpm run test
                </code>
                .
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                Storybook interaction tests
              </h3>
              <p className="font-inter text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Stories with{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  play
                </code>{' '}
                functions are tested automatically in CI via{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  pnpm run storybook:test-ci
                </code>
                . Run locally with{' '}
                <code className="font-jetbrains rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                  pnpm run storybook:test
                </code>{' '}
                (requires Storybook running).
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
              <h3 className="font-space-grotesk mb-2 font-semibold text-brand-slate-gray dark:text-white">
                Visual regression
              </h3>
              <p className="font-inter text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                Chromatic runs on every PR, comparing visual snapshots against
                the main branch. Changes to main are auto-accepted as the new
                baseline.
              </p>
            </div>
          </div>
        </section>

        {/* Best Practices */}
        <section>
          <h2 className="font-space-grotesk mb-6 flex items-center gap-3 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            <CheckCircleIcon className="h-7 w-7 text-brand-fresh-green" />
            Best practices
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              'Run pnpm run check before every commit',
              'Support both light and dark themes',
              'Keep components focused on a single responsibility',
              'Use semantic HTML for accessibility',
              'Wrap admin components with NotificationProvider in stories',
              'Export TypeScript interfaces for component props',
              'Minimize comments — prefer self-documenting code',
              'Use Heroicons, never custom SVGs',
            ].map((practice, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800/30"
              >
                <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-fresh-green" />
                <span className="font-inter text-sm text-brand-slate-gray dark:text-gray-300">
                  {practice}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  ),
}
