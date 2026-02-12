import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CloudIcon,
  CubeIcon,
  ShieldCheckIcon,
  SparklesIcon,
  RocketLaunchIcon,
  PaintBrushIcon,
  CodeBracketIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Getting Started/Introduction',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const version = '1.0.0'

export const Introduction: Story = {
  render: () => (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-linear-to-br from-brand-cloud-blue via-brand-nordic-purple to-brand-cloud-blue">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 left-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute right-10 bottom-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-8 py-20">
          <div className="flex items-center gap-4 text-white/80">
            <CloudIcon className="h-10 w-10" />
            <span className="font-space-grotesk text-lg font-medium">
              Cloud Native Days Norway
            </span>
          </div>
          <h1 className="font-space-grotesk mt-6 text-6xl font-bold text-white">
            Component Library
          </h1>
          <p className="font-jetbrains mt-2 text-xl text-white/70">
            v{version}
          </p>
          <p className="font-inter mt-6 max-w-2xl text-xl text-white/90">
            Interactive documentation for the Cloud Native Days Norway design
            system. Build consistent, accessible interfaces with our curated
            component collection.
          </p>
        </div>
      </div>

      {/* What&apos;s New Section */}
      <div className="mx-auto max-w-6xl px-8 py-16">
        <h2 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray dark:text-white">
          What&apos;s new
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="group rounded-xl border border-gray-200 bg-gray-50 p-6 transition-all hover:border-brand-cloud-blue/30 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-linear-to-br from-brand-cloud-blue to-brand-nordic-purple">
              <CubeIcon className="h-8 w-8 text-white" />
            </div>
            <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
              Sponsor CRM Components
            </h3>
            <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
              Complete pipeline management with kanban boards, contract
              generation, and onboarding workflows.
            </p>
          </div>

          <div className="group rounded-xl border border-gray-200 bg-gray-50 p-6 transition-all hover:border-brand-fresh-green/30 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-linear-to-br from-brand-fresh-green to-teal-500">
              <SparklesIcon className="h-8 w-8 text-white" />
            </div>
            <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
              Design System Tokens
            </h3>
            <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
              Comprehensive color palette, typography system, and spacing scale
              aligned with Nordic design principles.
            </p>
          </div>

          <div className="group rounded-xl border border-gray-200 bg-gray-50 p-6 transition-all hover:border-brand-nordic-purple/30 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-linear-to-br from-brand-nordic-purple to-violet-500">
              <ShieldCheckIcon className="h-8 w-8 text-white" />
            </div>
            <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-slate-gray dark:text-white">
              Accessibility First
            </h3>
            <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
              All components meet WCAG 2.1 AA standards with proper contrast,
              focus states, and screen reader support.
            </p>
          </div>
        </div>
      </div>

      {/* Overview Section */}
      <div className="border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
        <div className="mx-auto max-w-6xl px-8 py-16">
          <h2 className="font-space-grotesk mb-4 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Overview
          </h2>
          <p className="font-inter mb-12 max-w-3xl text-lg text-gray-600 dark:text-gray-300">
            Cloud Native Days Norway Component Library is a collection of React
            components and design tokens built with Next.js 15, Tailwind CSS 4,
            and TypeScript. It powers the conference website, sponsor portal,
            and admin interfaces.
          </p>

          {/* Quick Links */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <a
              href="?path=/docs/getting-started-developer-guide--docs"
              className="group flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-brand-cloud-blue hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <CodeBracketIcon className="h-8 w-8 text-brand-cloud-blue" />
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray group-hover:text-brand-cloud-blue dark:text-white">
                  Developer Guide
                </h3>
                <p className="font-inter text-sm text-gray-500 dark:text-gray-400">
                  Get started building
                </p>
              </div>
            </a>

            <a
              href="?path=/docs/design-system-colors--docs"
              className="group flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-brand-fresh-green hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <PaintBrushIcon className="h-8 w-8 text-brand-fresh-green" />
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray group-hover:text-brand-fresh-green dark:text-white">
                  Design System
                </h3>
                <p className="font-inter text-sm text-gray-500 dark:text-gray-400">
                  Colors, typography, spacing
                </p>
              </div>
            </a>

            <a
              href="?path=/docs/components-button--docs"
              className="group flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-brand-nordic-purple hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <Squares2X2Icon className="h-8 w-8 text-brand-nordic-purple" />
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray group-hover:text-brand-nordic-purple dark:text-white">
                  Components
                </h3>
                <p className="font-inter text-sm text-gray-500 dark:text-gray-400">
                  Browse all components
                </p>
              </div>
            </a>

            <a
              href="?path=/docs/systems-sponsor-system--docs"
              className="group flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-brand-sunbeam-yellow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <RocketLaunchIcon className="h-8 w-8 text-brand-sunbeam-yellow" />
              <div>
                <h3 className="font-space-grotesk font-semibold text-brand-slate-gray group-hover:text-brand-sunbeam-yellow dark:text-white">
                  Systems
                </h3>
                <p className="font-inter text-sm text-gray-500 dark:text-gray-400">
                  Architecture patterns
                </p>
              </div>
            </a>
          </div>
        </div>
      </div>

      {/* Tech Stack */}
      <div className="mx-auto max-w-6xl px-8 py-16">
        <h2 className="font-space-grotesk mb-8 text-2xl font-semibold text-brand-slate-gray dark:text-white">
          Built with
        </h2>
        <div className="flex flex-wrap gap-3">
          {[
            'Next.js 15',
            'React 19',
            'TypeScript 5.8',
            'Tailwind CSS 4',
            'tRPC',
            'Sanity.io',
            'Storybook 10',
            'Heroicons',
          ].map((tech) => (
            <span
              key={tech}
              className="font-jetbrains rounded-full bg-gray-100 px-4 py-2 text-sm text-brand-slate-gray dark:bg-gray-800 dark:text-gray-300"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <p className="font-inter text-sm text-gray-500 dark:text-gray-400">
            Cloud Native Days Norway • Bergen, Norway •{' '}
            <a
              href="https://cloudnativedays.no"
              className="text-brand-cloud-blue hover:underline"
            >
              cloudnativedays.no
            </a>
          </p>
        </div>
      </div>
    </div>
  ),
}
