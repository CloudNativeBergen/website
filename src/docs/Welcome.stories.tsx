/* eslint-disable @next/next/no-html-link-for-pages */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CloudIcon,
  RocketLaunchIcon,
  PaintBrushIcon,
  CodeBracketIcon,
  Squares2X2Icon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ArrowRightIcon,
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

const systems = [
  {
    name: 'Program',
    description:
      'Schedule views, talk cards, filtering, and multi-format agenda display for conference attendees.',
    icon: CalendarDaysIcon,
    color: 'from-brand-cloud-blue to-cyan-500',
    stories: 9,
    href: '/?path=/docs/systems-program--docs',
  },
  {
    name: 'Proposals',
    description:
      'Call for Papers submission flow, co-speaker management, admin review pipeline, and featured talks.',
    icon: ChatBubbleLeftRightIcon,
    color: 'from-brand-fresh-green to-teal-500',
    stories: 14,
    href: '/?path=/docs/systems-proposals--docs',
  },
  {
    name: 'Speakers',
    description:
      'Speaker profiles, avatar components, details forms, admin management, and featured speaker curation.',
    icon: UserGroupIcon,
    color: 'from-brand-nordic-purple to-violet-500',
    stories: 10,
    href: '/?path=/docs/systems-speakers--docs',
  },
  {
    name: 'Sponsors',
    description:
      'Full CRM pipeline, contract workflows, tiered management, registration portal, and email templates.',
    icon: CurrencyDollarIcon,
    color: 'from-brand-sunbeam-yellow to-orange-400',
    stories: 43,
    href: '/?path=/docs/systems-sponsors--docs',
  },
]

const techStack = [
  { name: 'Next.js', version: '16', url: 'https://nextjs.org' },
  { name: 'React', version: '19', url: 'https://react.dev' },
  { name: 'TypeScript', version: '5.9', url: 'https://typescriptlang.org' },
  { name: 'Tailwind CSS', version: '4', url: 'https://tailwindcss.com' },
  { name: 'tRPC', version: '11', url: 'https://trpc.io' },
  { name: 'Sanity', version: '5', url: 'https://sanity.io' },
  { name: 'Storybook', version: '10', url: 'https://storybook.js.org' },
  { name: 'Heroicons', version: '2', url: 'https://heroicons.com' },
]

export const Introduction: Story = {
  render: () => (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Hero */}
      <div className="relative overflow-hidden bg-linear-to-br from-brand-cloud-blue via-brand-nordic-purple to-brand-cloud-blue">
        <div className="absolute inset-0">
          <div className="absolute top-10 left-10 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute right-20 bottom-10 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-8 py-20">
          <div className="flex items-center gap-3 text-white/70">
            <CloudIcon className="h-8 w-8" />
            <span className="font-space-grotesk text-sm font-medium tracking-wide uppercase">
              Cloud Native Days Norway
            </span>
          </div>
          <h1 className="font-space-grotesk mt-6 text-5xl font-bold tracking-tight text-white md:text-6xl">
            Design System &amp;
            <br />
            Component Library
          </h1>
          <p className="font-inter mt-6 max-w-2xl text-lg leading-relaxed text-white/85">
            Interactive documentation for the conference website, admin
            interfaces, and sponsor portal. Browse live components, review
            architecture decisions, and build with confidence.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a
              href="/?path=/docs/getting-started-developer-guide--docs"
              target="_top"
              className="font-inter inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-cloud-blue shadow-lg transition-all hover:bg-gray-50 hover:shadow-xl"
            >
              Get started
              <ArrowRightIcon className="h-4 w-4" />
            </a>
            <a
              href="/?path=/docs/design-system-brand-brand-story--docs"
              target="_top"
              className="font-inter inline-flex items-center gap-2 rounded-lg border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:border-white/50 hover:bg-white/10"
            >
              Brand &amp; Design
            </a>
          </div>
        </div>
      </div>

      {/* Quick navigation */}
      <div className="mx-auto max-w-6xl px-8 py-16">
        <h2 className="font-space-grotesk mb-2 text-2xl font-semibold text-brand-slate-gray dark:text-white">
          Explore the library
        </h2>
        <p className="font-inter mb-10 text-gray-500 dark:text-gray-400">
          109 stories across 4 top-level categories.
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <a
            href="/?path=/docs/getting-started-developer-guide--docs"
            target="_top"
            className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-brand-cloud-blue/40 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <CodeBracketIcon className="mb-3 h-7 w-7 text-brand-cloud-blue" />
            <h3 className="font-space-grotesk text-base font-semibold text-brand-slate-gray group-hover:text-brand-cloud-blue dark:text-white">
              Getting Started
            </h3>
            <p className="font-inter mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Developer guide with setup instructions, project structure, and
              coding conventions.
            </p>
            <span className="font-jetbrains mt-auto pt-4 text-xs text-gray-400 dark:text-gray-500">
              2 pages
            </span>
          </a>

          <a
            href="/?path=/docs/design-system-brand-brand-story--docs"
            target="_top"
            className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-brand-fresh-green/40 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <PaintBrushIcon className="mb-3 h-7 w-7 text-brand-fresh-green" />
            <h3 className="font-space-grotesk text-base font-semibold text-brand-slate-gray group-hover:text-brand-fresh-green dark:text-white">
              Design System
            </h3>
            <p className="font-inter mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Brand identity, color palette, typography, spacing tokens, and
              integration examples.
            </p>
            <span className="font-jetbrains mt-auto pt-4 text-xs text-gray-400 dark:text-gray-500">
              11 pages
            </span>
          </a>

          <a
            href="/?path=/docs/components-layout-button--docs"
            target="_top"
            className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-brand-nordic-purple/40 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <Squares2X2Icon className="mb-3 h-7 w-7 text-brand-nordic-purple" />
            <h3 className="font-space-grotesk text-base font-semibold text-brand-slate-gray group-hover:text-brand-nordic-purple dark:text-white">
              Components
            </h3>
            <p className="font-inter mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Reusable UI building blocks: buttons, modals, form elements,
              icons, and layout primitives.
            </p>
            <span className="font-jetbrains mt-auto pt-4 text-xs text-gray-400 dark:text-gray-500">
              22 pages
            </span>
          </a>

          <a
            href="/?path=/docs/systems-program--docs"
            target="_top"
            className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-brand-sunbeam-yellow/40 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            <RocketLaunchIcon className="mb-3 h-7 w-7 text-brand-sunbeam-yellow" />
            <h3 className="font-space-grotesk text-base font-semibold text-brand-slate-gray group-hover:text-brand-sunbeam-yellow dark:text-white">
              Systems
            </h3>
            <p className="font-inter mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Domain-specific features with architecture docs, admin tools, and
              public-facing components.
            </p>
            <span className="font-jetbrains mt-auto pt-4 text-xs text-gray-400 dark:text-gray-500">
              75 pages
            </span>
          </a>
        </div>
      </div>

      {/* Systems overview */}
      <div className="border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
        <div className="mx-auto max-w-6xl px-8 py-16">
          <h2 className="font-space-grotesk mb-2 text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Systems
          </h2>
          <p className="font-inter mb-10 text-gray-500 dark:text-gray-400">
            Each system has an architecture overview, admin interface
            components, and public-facing UI.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            {systems.map((system) => (
              <a
                key={system.name}
                href={system.href}
                target="_top"
                className="group flex gap-5 rounded-xl border border-gray-200 bg-white p-6 transition-all hover:shadow-lg dark:border-gray-700 dark:bg-gray-800"
              >
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${system.color}`}
                >
                  <system.icon className="h-7 w-7 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray group-hover:text-brand-cloud-blue dark:text-white">
                      {system.name}
                    </h3>
                    <span className="font-jetbrains rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      {system.stories} stories
                    </span>
                  </div>
                  <p className="font-inter mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    {system.description}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Tech stack */}
      <div className="mx-auto max-w-6xl px-8 py-16">
        <h2 className="font-space-grotesk mb-2 text-2xl font-semibold text-brand-slate-gray dark:text-white">
          Tech stack
        </h2>
        <p className="font-inter mb-8 text-gray-500 dark:text-gray-400">
          The tools and frameworks powering this project.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {techStack.map((tech) => (
            <a
              key={tech.name}
              href={tech.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-baseline gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-all hover:border-brand-cloud-blue/30 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <span className="font-inter text-sm font-medium text-brand-slate-gray group-hover:text-brand-cloud-blue dark:text-white">
                {tech.name}
              </span>
              <span className="font-jetbrains text-xs text-gray-400 dark:text-gray-500">
                v{tech.version}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-8">
          <p className="font-inter text-sm text-gray-400 dark:text-gray-500">
            Cloud Native Days Norway &bull; Bergen, Norway
          </p>
          <a
            href="https://github.com/cloudnativebergen/website"
            target="_blank"
            rel="noopener noreferrer"
            className="font-inter text-sm text-brand-cloud-blue hover:underline"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  ),
}
