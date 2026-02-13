import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  HomeIcon,
  DocumentTextIcon,
  UsersIcon,
  UserGroupIcon,
  CalendarDaysIcon,
  BuildingOfficeIcon,
  TicketIcon,
  PresentationChartBarIcon,
  AcademicCapIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  BellIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { ThemeToggle } from '@/components/ThemeToggle'
import clsx from 'clsx'

const meta = {
  title: 'Systems/Proposals/Admin/AdminLayout',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Admin shell that wraps DashboardLayout with admin-specific navigation (Core, People, Events & Content, System sections), SearchModal, and NotificationProvider. Stories use a mock wrapper to avoid session/router dependencies.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface NavSection {
  label: string
  items: {
    name: string
    href: string
    icon: React.ForwardRefExoticComponent<
      Omit<React.SVGProps<SVGSVGElement>, 'ref'> &
      React.RefAttributes<SVGSVGElement>
    >
  }[]
}

const navigation: NavSection[] = [
  {
    label: 'Core',
    items: [
      { name: 'Dashboard', href: '/admin', icon: HomeIcon },
      { name: 'Proposals', href: '/admin/proposals', icon: DocumentTextIcon },
      { name: 'Schedule', href: '/admin/schedule', icon: CalendarDaysIcon },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'Speakers', href: '/admin/speakers', icon: UsersIcon },
      { name: 'Volunteers', href: '/admin/volunteers', icon: UserGroupIcon },
      { name: 'Workshops', href: '/admin/workshops', icon: AcademicCapIcon },
    ],
  },
  {
    label: 'Events & Content',
    items: [
      { name: 'Tickets', href: '/admin/tickets', icon: TicketIcon },
      { name: 'Sponsors', href: '/admin/sponsors', icon: BuildingOfficeIcon },
      {
        name: 'Marketing',
        href: '/admin/marketing',
        icon: PresentationChartBarIcon,
      },
    ],
  },
  {
    label: 'System',
    items: [{ name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon }],
  },
]

function MockAdminLayout({
  activeItem = 'Dashboard',
  children,
}: {
  activeItem?: string
  children?: React.ReactNode
}) {
  return (
    <div>
      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-20 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-gray-900 px-3 py-4">
          <div className="flex h-16 shrink-0 items-center justify-center">
            <ConferenceLogo
              variant="mark"
              className="h-8 w-auto text-white"
              fallbackVariant="gradient"
            />
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex-1 space-y-1">
              {navigation.map((section, i) => (
                <li key={section.label}>
                  {i > 0 && (
                    <div className="mx-1 my-2 border-t border-white/10" />
                  )}
                  <ul role="list" className="space-y-1">
                    {section.items.map((item) => {
                      const isCurrent = item.name === activeItem
                      return (
                        <li key={item.name}>
                          <a
                            href={item.href}
                            title={item.name}
                            className={clsx(
                              isCurrent
                                ? 'bg-gray-800 text-white'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                              'group flex justify-center rounded-md p-3 text-sm leading-6 font-semibold',
                            )}
                          >
                            <item.icon
                              aria-hidden="true"
                              className="size-6 shrink-0"
                            />
                            <span className="sr-only">{item.name}</span>
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {/* Top bar */}
      <div className="sticky top-0 z-40 hidden h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:flex lg:px-8 lg:pl-28 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          <div className="flex flex-1 items-center">
            <button
              type="button"
              className="flex w-full max-w-xs items-center gap-x-3 rounded-lg bg-white px-3 py-2 text-sm text-gray-500 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700"
            >
              <MagnifyingGlassIcon
                className="h-5 w-5 shrink-0"
                aria-hidden="true"
              />
              <span className="flex-1 text-left">Search proposals...</span>
              <kbd className="ml-auto flex h-5 items-center gap-0.5 rounded border border-gray-200 bg-gray-50 px-1.5 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          </div>
          <div className="flex items-center gap-x-4 lg:gap-x-6">
            <ThemeToggle />
            <button
              type="button"
              className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500 dark:text-gray-500"
            >
              <BellIcon aria-hidden="true" className="size-6" />
            </button>
            <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200 dark:bg-gray-700" />
            <button className="-m-1.5 flex items-center p-1.5">
              <img
                alt=""
                src="https://placehold.co/32x32/4f46e5/fff/png?text=AD"
                className="size-8 rounded-full bg-gray-50 dark:bg-gray-800"
              />
              <span className="hidden lg:flex lg:items-center">
                <span className="ml-4 text-sm leading-6 font-semibold text-gray-900 dark:text-white">
                  Admin User
                </span>
                <ChevronDownIcon className="ml-2 size-5 text-gray-400" />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="py-10 lg:pl-20">
        <div className="px-2 sm:px-4 lg:px-8">
          {children || (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Admin page content
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export const Default: Story = {
  render: () => <MockAdminLayout />,
  parameters: {
    docs: {
      description: {
        story:
          'Admin layout with Dashboard active. Shows all four navigation sections (Core, People, Events & Content, System) in the icon-only sidebar.',
      },
    },
  },
}

export const ProposalsPage: Story = {
  render: () => (
    <MockAdminLayout activeItem="Proposals">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <DocumentTextIcon className="h-8 w-8 text-brand-cloud-blue" />
          <div>
            <h1 className="font-space-grotesk text-2xl font-bold text-gray-900 dark:text-white">
              Proposals
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Review and manage conference talk proposals
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: 'Total', value: '142' },
            { label: 'Accepted', value: '38' },
            { label: 'Pending', value: '87' },
            { label: 'Rejected', value: '17' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
            >
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {s.label}
              </p>
              <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </MockAdminLayout>
  ),
}

export const SettingsPage: Story = {
  render: () => (
    <MockAdminLayout activeItem="Settings">
      <div className="flex items-center gap-3">
        <Cog6ToothIcon className="h-8 w-8 text-brand-cloud-blue" />
        <div>
          <h1 className="font-space-grotesk text-2xl font-bold text-gray-900 dark:text-white">
            Settings
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure conference and system settings
          </p>
        </div>
      </div>
    </MockAdminLayout>
  ),
}
