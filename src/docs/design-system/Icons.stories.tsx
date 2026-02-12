import type { Meta, StoryObj } from '@storybook/react'
import {
  CloudIcon,
  ServerIcon,
  CubeIcon,
  CircleStackIcon,
  GlobeAltIcon,
  CommandLineIcon,
  CogIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  BoltIcon,
  LinkIcon,
  ArrowPathIcon,
  CloudArrowUpIcon,
  RocketLaunchIcon,
  UserGroupIcon,
  CalendarIcon,
  TicketIcon,
  MicrophoneIcon,
  VideoCameraIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline'
import {
  CloudIcon as CloudSolid,
  ShieldCheckIcon as ShieldCheckSolid,
  BoltIcon as BoltSolid,
} from '@heroicons/react/24/solid'

const meta = {
  title: 'Design System/Foundation/Icons',
  parameters: {
    layout: 'fullscreen',
    options: {
      showPanel: false,
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const IconCard = ({
  name,
  Icon,
  usage,
}: {
  name: string
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  usage: string
}) => (
  <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <Icon className="h-8 w-8 text-brand-cloud-blue" />
    <div className="flex-1">
      <h3 className="font-space-grotesk text-sm font-semibold text-brand-slate-gray dark:text-white">
        {name}
      </h3>
      <p className="font-inter text-xs text-gray-500 dark:text-gray-400">{usage}</p>
    </div>
  </div>
)

export const Icons: Story = {
  render: () => (
    <div className="min-h-screen bg-white p-8 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 font-space-grotesk text-4xl font-bold text-brand-cloud-blue dark:text-blue-400">
          Icons
        </h1>
        <p className="mb-12 font-inter text-lg text-brand-slate-gray dark:text-gray-300">
          Heroicons library with cloud native selections for consistent iconography.
        </p>

        {/* Why Heroicons */}
        <section className="mb-16">
          <div className="rounded-xl border border-brand-cloud-blue/20 bg-brand-sky-mist p-6 dark:border-blue-500/20 dark:bg-gray-800">
            <h2 className="mb-4 font-space-grotesk text-xl font-semibold text-brand-cloud-blue dark:text-blue-400">
              Why Heroicons?
            </h2>
            <ul className="grid gap-2 font-inter text-sm text-brand-slate-gray md:grid-cols-2 dark:text-gray-300">
              <li>✓ Created by Tailwind CSS team</li>
              <li>✓ Two styles: outline and solid</li>
              <li>✓ Full TypeScript support</li>
              <li>✓ Tree-shakeable imports</li>
              <li>✓ Great cloud/tech icon selection</li>
              <li>✓ Consistent 24x24 viewBox</li>
            </ul>
          </div>
        </section>

        {/* Platform & Infrastructure */}
        <section className="mb-12">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Platform & Infrastructure
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <IconCard name="CloudIcon" Icon={CloudIcon} usage="Cloud computing, infrastructure" />
            <IconCard name="ServerIcon" Icon={ServerIcon} usage="Server resources, compute" />
            <IconCard name="CubeIcon" Icon={CubeIcon} usage="Containers, packaging" />
            <IconCard name="CircleStackIcon" Icon={CircleStackIcon} usage="Databases, storage" />
            <IconCard name="GlobeAltIcon" Icon={GlobeAltIcon} usage="Global distribution, CDN" />
          </div>
        </section>

        {/* Development & Operations */}
        <section className="mb-12">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Development & Operations
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <IconCard name="CommandLineIcon" Icon={CommandLineIcon} usage="Developer tools, CLI" />
            <IconCard name="CogIcon" Icon={CogIcon} usage="Configuration, settings" />
            <IconCard name="ShieldCheckIcon" Icon={ShieldCheckIcon} usage="Security, compliance" />
            <IconCard name="ChartBarIcon" Icon={ChartBarIcon} usage="Monitoring, analytics" />
            <IconCard name="BoltIcon" Icon={BoltIcon} usage="Performance, speed" />
          </div>
        </section>

        {/* Connectivity & Flow */}
        <section className="mb-12">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Connectivity & Flow
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <IconCard name="LinkIcon" Icon={LinkIcon} usage="Service mesh, connections" />
            <IconCard name="ArrowPathIcon" Icon={ArrowPathIcon} usage="CI/CD, automation" />
            <IconCard name="CloudArrowUpIcon" Icon={CloudArrowUpIcon} usage="Deployment, upload" />
            <IconCard name="RocketLaunchIcon" Icon={RocketLaunchIcon} usage="Launch, deploy" />
          </div>
        </section>

        {/* Conference Specific */}
        <section className="mb-12">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Conference Specific
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <IconCard name="UserGroupIcon" Icon={UserGroupIcon} usage="Attendees, community" />
            <IconCard name="CalendarIcon" Icon={CalendarIcon} usage="Schedule, events" />
            <IconCard name="TicketIcon" Icon={TicketIcon} usage="Tickets, registration" />
            <IconCard name="MicrophoneIcon" Icon={MicrophoneIcon} usage="Speakers, talks" />
            <IconCard name="VideoCameraIcon" Icon={VideoCameraIcon} usage="Recordings, live" />
            <IconCard name="BuildingOfficeIcon" Icon={BuildingOfficeIcon} usage="Sponsors, companies" />
          </div>
        </section>

        {/* Sizes */}
        <section className="mb-12">
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Sizes
          </h2>
          <div className="flex flex-wrap items-end gap-8 rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-center">
              <CloudIcon className="mx-auto h-4 w-4 text-brand-cloud-blue" />
              <code className="mt-2 block font-jetbrains text-xs text-gray-500">h-4 w-4</code>
            </div>
            <div className="text-center">
              <CloudIcon className="mx-auto h-5 w-5 text-brand-cloud-blue" />
              <code className="mt-2 block font-jetbrains text-xs text-gray-500">h-5 w-5</code>
            </div>
            <div className="text-center">
              <CloudIcon className="mx-auto h-6 w-6 text-brand-cloud-blue" />
              <code className="mt-2 block font-jetbrains text-xs text-gray-500">h-6 w-6</code>
            </div>
            <div className="text-center">
              <CloudIcon className="mx-auto h-8 w-8 text-brand-cloud-blue" />
              <code className="mt-2 block font-jetbrains text-xs text-gray-500">h-8 w-8</code>
            </div>
            <div className="text-center">
              <CloudIcon className="mx-auto h-12 w-12 text-brand-cloud-blue" />
              <code className="mt-2 block font-jetbrains text-xs text-gray-500">h-12 w-12</code>
            </div>
          </div>
        </section>

        {/* Outline vs Solid */}
        <section>
          <h2 className="mb-6 font-space-grotesk text-2xl font-semibold text-brand-slate-gray dark:text-white">
            Outline vs Solid
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-4 font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
                Outline (Default)
              </h3>
              <div className="mb-4 flex gap-4">
                <CloudIcon className="h-8 w-8 text-brand-cloud-blue" />
                <ShieldCheckIcon className="h-8 w-8 text-brand-fresh-green" />
                <BoltIcon className="h-8 w-8 text-brand-sunbeam-yellow" />
              </div>
              <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                Use for general UI elements, navigation, and content
              </p>
              <code className="mt-2 block font-jetbrains text-xs text-gray-500">
                from &apos;@heroicons/react/24/outline&apos;
              </code>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="mb-4 font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
                Solid (Emphasis)
              </h3>
              <div className="mb-4 flex gap-4">
                <CloudSolid className="h-8 w-8 text-brand-cloud-blue" />
                <ShieldCheckSolid className="h-8 w-8 text-brand-fresh-green" />
                <BoltSolid className="h-8 w-8 text-brand-sunbeam-yellow" />
              </div>
              <p className="font-inter text-sm text-gray-600 dark:text-gray-400">
                Use for status indicators, emphasis, and important highlights
              </p>
              <code className="mt-2 block font-jetbrains text-xs text-gray-500">
                from &apos;@heroicons/react/24/solid&apos;
              </code>
            </div>
          </div>
        </section>
      </div>
    </div>
  ),
}
