import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import {
  HomeIcon,
  DocumentTextIcon,
  UsersIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  BellIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { ThemeToggle } from '@/components/ThemeToggle'
import clsx from 'clsx'
import type {
  NavigationSection,
  NavigationItem,
} from '@/components/common/DashboardLayout'

const meta = {
  title: 'Components/Layout/DashboardLayout',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full dashboard shell with responsive sidebar, top navigation bar, user menu, and ⌘K search shortcut. Supports two modes: `admin` (dark gray sidebar) and `speaker` (brand blue sidebar). Navigation can be flat items or grouped sections. Uses `useSession`, `usePathname`, and `useTheme` — stories use a mock wrapper.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const adminNavigation: NavigationSection[] = [
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
    items: [{ name: 'Speakers', href: '/admin/speakers', icon: UsersIcon }],
  },
  {
    label: 'System',
    items: [{ name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon }],
  },
]

const speakerNavigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/cfp/list', icon: HomeIcon },
  { name: 'My Proposals', href: '/cfp/proposals', icon: DocumentTextIcon },
  { name: 'Profile', href: '/cfp/profile', icon: UsersIcon },
]

interface MockDashboardProps {
  mode: 'admin' | 'speaker'
  navigation: NavigationSection[] | NavigationItem[]
  title: string
  activeItem?: string
  showSearch?: boolean
  children?: React.ReactNode
}

const colorSchemes = {
  admin: {
    sidebar: 'bg-gray-900',
    active: 'bg-gray-800 text-white',
    inactive: 'text-gray-400',
    hover: 'hover:bg-gray-800 hover:text-white',
    topbar: 'bg-white border-gray-200 dark:bg-gray-950 dark:border-gray-800',
  },
  speaker: {
    sidebar: 'bg-brand-cloud-blue dark:bg-gray-900',
    active: 'bg-brand-cloud-blue-hover text-white dark:bg-gray-800',
    inactive: 'text-blue-100 dark:text-gray-400',
    hover:
      'hover:bg-brand-cloud-blue-hover hover:text-white dark:hover:bg-gray-800',
    topbar: 'bg-white border-gray-200 dark:bg-gray-950 dark:border-gray-800',
  },
}

function isNavigationSections(
  config: NavigationSection[] | NavigationItem[],
): config is NavigationSection[] {
  return config.length > 0 && 'label' in config[0] && 'items' in config[0]
}

function MockDashboard({
  mode,
  navigation,
  title,
  activeItem = '',
  showSearch = false,
  children,
}: MockDashboardProps) {
  const colors = colorSchemes[mode]

  const renderNavItems = (items: NavigationItem[]) =>
    items.map((item) => {
      const isCurrent = item.name === activeItem
      return (
        <li key={item.name}>
          <a
            href={item.href}
            title={item.name}
            className={clsx(
              isCurrent ? colors.active : `${colors.inactive} ${colors.hover}`,
              'group flex justify-center rounded-md p-3 text-sm leading-6 font-semibold',
            )}
          >
            <item.icon aria-hidden="true" className="size-6 shrink-0" />
            <span className="sr-only">{item.name}</span>
          </a>
        </li>
      )
    })

  return (
    <div>
      {/* Desktop sidebar — icon-only */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-20 lg:flex-col">
        <div
          className={clsx(
            'flex grow flex-col gap-y-5 overflow-y-auto px-3 py-4',
            colors.sidebar,
          )}
        >
          <div className="flex h-16 shrink-0 items-center justify-center">
            <ConferenceLogo
              variant="mark"
              className="h-8 w-auto text-white"
              fallbackVariant={mode === 'speaker' ? 'monochrome' : 'gradient'}
            />
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex-1 space-y-1">
              {isNavigationSections(navigation)
                ? navigation.map((section, i) => (
                  <li key={section.label}>
                    {i > 0 && (
                      <div className="mx-1 my-2 border-t border-white/10" />
                    )}
                    <ul role="list" className="space-y-1">
                      {renderNavItems(section.items)}
                    </ul>
                  </li>
                ))
                : renderNavItems(navigation)}
            </ul>
          </nav>
        </div>
      </div>

      {/* Top bar */}
      <div
        className={clsx(
          'sticky top-0 z-40 hidden h-16 shrink-0 items-center gap-x-4 border-b px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:flex lg:px-8 lg:pl-28',
          colors.topbar,
        )}
      >
        <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
          <div className="flex flex-1 items-center">
            {showSearch ? (
              <button
                type="button"
                onClick={fn()}
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
            ) : (
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-x-4 lg:gap-x-6">
            <ThemeToggle />
            {mode === 'admin' && (
              <button
                type="button"
                className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500 dark:text-gray-500"
              >
                <BellIcon aria-hidden="true" className="size-6" />
              </button>
            )}
            <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200 dark:bg-gray-700" />
            <button className="-m-1.5 flex items-center p-1.5">
              <img
                alt=""
                src="https://placehold.co/32x32/4f46e5/fff/png?text=JD"
                className="size-8 rounded-full bg-gray-50 dark:bg-gray-800"
              />
              <span className="hidden lg:flex lg:items-center">
                <span className="ml-4 text-sm leading-6 font-semibold text-gray-900 dark:text-white">
                  Jane Doe
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
                Page content area
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export const AdminMode: Story = {
  render: () => (
    <MockDashboard
      mode="admin"
      navigation={adminNavigation}
      title="Admin Dashboard"
      activeItem="Dashboard"
      showSearch
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Admin mode with dark gray sidebar, sectioned navigation, search bar, and notification bell.',
      },
    },
  },
}

export const SpeakerMode: Story = {
  render: () => (
    <MockDashboard
      mode="speaker"
      navigation={speakerNavigation}
      title="Speaker Dashboard"
      activeItem="Dashboard"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Speaker mode with brand-blue sidebar and flat navigation. No search bar or notification bell.',
      },
    },
  },
}

export const AdminWithContent: Story = {
  render: () => (
    <MockDashboard
      mode="admin"
      navigation={adminNavigation}
      title="Admin Dashboard"
      activeItem="Proposals"
      showSearch
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 text-brand-cloud-blue">
            <DocumentTextIcon className="h-full w-full" />
          </div>
          <div>
            <h1 className="font-space-grotesk text-2xl font-bold text-gray-900 dark:text-white">
              Proposals
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Review and manage talk proposals
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              label: 'Total',
              value: '142',
              color: 'text-gray-900 dark:text-white',
            },
            {
              label: 'Accepted',
              value: '38',
              color: 'text-green-600 dark:text-green-400',
            },
            {
              label: 'Pending',
              value: '87',
              color: 'text-blue-600 dark:text-blue-400',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
            >
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {stat.label}
              </p>
              <p className={`mt-1 text-xl font-semibold ${stat.color}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </MockDashboard>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Admin layout with realistic page content showing a proposals overview.',
      },
    },
  },
}
