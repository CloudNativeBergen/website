'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
import { useTheme } from 'next-themes'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  TransitionChild,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from '@headlessui/react'
import {
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  BellIcon,
} from '@heroicons/react/24/outline'
import { Logomark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import clsx from 'clsx'

export interface NavigationItem {
  name: string
  href: string
  icon: React.ForwardRefExoticComponent<
    Omit<React.SVGProps<SVGSVGElement>, 'ref'> & {
      title?: string | undefined
      titleId?: string | undefined
    } & React.RefAttributes<SVGSVGElement>
  >
}

type DashboardMode = 'admin' | 'speaker'

interface DashboardLayoutProps {
  children: React.ReactNode
  navigation: NavigationItem[]
  mode: DashboardMode
  title: string
  onSearch?: () => void
  searchComponent?: React.ReactNode
}

interface ColorScheme {
  sidebar: {
    background: string
    active: string
    inactive: string
    hover: string
  }
  mobile: {
    background: string
    text: string
  }
  avatar: {
    background: string
  }
}

const colorSchemes: Record<DashboardMode, ColorScheme> = {
  admin: {
    sidebar: {
      background: 'bg-gray-900 dark:bg-gray-950',
      active: 'bg-gray-800 text-white dark:bg-gray-700',
      inactive: 'text-gray-400 dark:text-gray-500',
      hover: 'hover:bg-gray-800 hover:text-white dark:hover:bg-gray-700',
    },
    mobile: {
      background: 'bg-gray-900 dark:bg-gray-950',
      text: 'text-gray-400 dark:text-gray-500',
    },
    avatar: {
      background: '4f46e5', // indigo
    },
  },
  speaker: {
    sidebar: {
      background: 'bg-brand-cloud-blue dark:bg-gray-900',
      active: 'bg-brand-cloud-blue-hover text-white dark:bg-gray-800',
      inactive: 'text-blue-100 dark:text-gray-400',
      hover:
        'hover:bg-brand-cloud-blue-hover hover:text-white dark:hover:bg-gray-800',
    },
    mobile: {
      background: 'bg-brand-cloud-blue dark:bg-gray-900',
      text: 'text-blue-100 dark:text-gray-400',
    },
    avatar: {
      background: '1d4ed8', // brand-cloud-blue
    },
  },
}

export function DashboardLayout({
  children,
  navigation,
  mode,
  title,
  onSearch,
  searchComponent,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const colors = colorSchemes[mode]

  // Handle keyboard shortcuts for search (admin mode only)
  useEffect(() => {
    if (mode === 'admin' && onSearch) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault()
          onSearch()
        }
      }

      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mode, onSearch])

  const getUserName = () => {
    const name = session?.user?.name || 'User'
    return name
  }
  const getAvatarUrl = () => {
    const userPicture = session?.user?.picture

    // Early return if user already has a picture
    if (userPicture) {
      return userPicture
    }

    const userName = getUserName()
    const avatarBackground = colors.avatar.background

    // Safely generate initials with fallback
    let initials = 'U'
    try {
      const processedInitials = userName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) // Limit to 2 characters max

      // Only use alphanumeric characters
      const safeInitials = processedInitials.replace(/[^A-Z0-9]/g, '')

      if (safeInitials.length > 0) {
        initials = safeInitials
      }
    } catch (error) {
      console.warn('Error generating avatar initials:', error)
      initials = 'U'
    }

    return `https://placehold.co/192x192/${avatarBackground}/fff/png?text=${initials}`
  }

  const isCurrentPath = (href: string) => {
    const basePath = mode === 'admin' ? '/admin' : '/cfp'
    return pathname === href || (href !== basePath && pathname.startsWith(href))
  }

  return (
    <>
      <div>
        {/* Mobile sidebar */}
        <Dialog
          open={sidebarOpen}
          onClose={setSidebarOpen}
          className={`relative z-50 lg:hidden ${theme === 'dark' ? 'dark' : ''}`}
        >
          <DialogBackdrop
            transition
            className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
          />

          <div className="fixed inset-0 flex">
            <DialogPanel
              transition
              className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
            >
              <TransitionChild>
                <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="-m-2.5 p-2.5"
                  >
                    <span className="sr-only">Close sidebar</span>
                    <XMarkIcon
                      aria-hidden="true"
                      className="size-6 text-white"
                    />
                  </button>
                </div>
              </TransitionChild>

              <div
                className={clsx(
                  'flex grow flex-col gap-y-5 overflow-y-auto px-6 pb-2 ring-1 ring-white/10',
                  colors.sidebar.background,
                )}
              >
                <div className="flex h-16 shrink-0 items-center">
                  <Logomark
                    className="h-8 w-auto text-white"
                    variant={mode === 'speaker' ? 'white' : 'gradient'}
                  />
                </div>
                <nav className="flex flex-1 flex-col">
                  <ul role="list" className="-mx-2 flex-1 space-y-1">
                    {navigation.map((item) => {
                      const isCurrent = isCurrentPath(item.href)
                      return (
                        <li key={item.name}>
                          <Link
                            href={item.href}
                            className={clsx(
                              isCurrent
                                ? colors.sidebar.active
                                : `${colors.sidebar.inactive} ${colors.sidebar.hover}`,
                              'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold',
                            )}
                          >
                            <item.icon
                              aria-hidden="true"
                              className="size-6 shrink-0"
                            />
                            {item.name}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </nav>
              </div>
            </DialogPanel>
          </div>
        </Dialog>

        {/* Desktop sidebar - narrow with icons only */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-20 lg:flex-col">
          <div
            className={clsx(
              'flex grow flex-col gap-y-5 overflow-y-auto px-3 py-4',
              colors.sidebar.background,
            )}
          >
            <div className="flex h-16 shrink-0 items-center justify-center">
              <Logomark
                className="h-8 w-auto text-white"
                variant={mode === 'speaker' ? 'white' : 'gradient'}
              />
            </div>
            <nav className="flex flex-1 flex-col">
              <ul role="list" className="flex-1 space-y-1">
                {navigation.map((item) => {
                  const isCurrent = isCurrentPath(item.href)
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        title={item.name}
                        className={clsx(
                          isCurrent
                            ? colors.sidebar.active
                            : `${colors.sidebar.inactive} ${colors.sidebar.hover}`,
                          'group flex justify-center rounded-md p-3 text-sm leading-6 font-semibold',
                        )}
                      >
                        <item.icon
                          aria-hidden="true"
                          className="size-6 shrink-0"
                        />
                        <span className="sr-only">{item.name}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </div>

        {/* Mobile top bar */}
        <div
          className={clsx(
            'sticky top-0 z-40 flex items-center gap-x-6 px-4 py-4 shadow-sm sm:px-6 lg:hidden',
            colors.mobile.background,
          )}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className={clsx('-m-2.5 p-2.5 lg:hidden', colors.mobile.text)}
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>

          {/* Mobile center content */}
          <div className="flex flex-1 items-center justify-center">
            {mode === 'admin' && onSearch ? (
              <button
                type="button"
                onClick={onSearch}
                className="flex items-center gap-x-2 rounded-md bg-gray-800 px-3 py-1.5 text-sm text-gray-300 ring-1 ring-gray-600 ring-inset hover:bg-gray-700 hover:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:ring-inset"
              >
                <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="ml-auto flex h-4 items-center gap-1 rounded bg-gray-700 px-1 text-xs font-semibold text-gray-300">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </button>
            ) : (
              <span className="font-semibold text-white">{title}</span>
            )}
          </div>

          <div className="flex items-center gap-x-2">
            <ThemeToggle />
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="focus:outline-none"
            >
              <span className="sr-only">Sign out</span>
              <Image
                alt=""
                src={getAvatarUrl()}
                width={32}
                height={32}
                className={clsx(
                  'size-8 rounded-full transition-opacity hover:opacity-80',
                  mode === 'speaker' ? 'bg-brand-cloud-blue' : 'bg-gray-800',
                )}
              />
            </button>
          </div>
        </div>

        {/* Desktop top menu bar */}
        <div className="sticky top-0 z-40 hidden h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:flex lg:px-8 lg:pl-28 dark:border-gray-800 dark:bg-gray-950">
          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1 items-center">
              {mode === 'admin' && onSearch ? (
                <button
                  type="button"
                  onClick={onSearch}
                  className="flex w-full max-w-lg items-center gap-x-3 rounded-lg bg-white px-3 py-2 text-sm text-gray-500 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 hover:text-gray-700 focus:ring-2 focus:ring-indigo-600 focus:outline-none focus:ring-inset lg:max-w-xs dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300 dark:focus:ring-indigo-500"
                >
                  <MagnifyingGlassIcon
                    className="h-5 w-5 flex-shrink-0"
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
                  className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                >
                  <span className="sr-only">View notifications</span>
                  <BellIcon aria-hidden="true" className="size-6" />
                </button>
              )}

              {/* Separator */}
              <div
                aria-hidden="true"
                className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200 dark:bg-gray-700"
              />

              {/* Profile dropdown */}
              <Menu as="div" className="relative">
                <MenuButton className="-m-1.5 flex items-center p-1.5">
                  <span className="sr-only">Open user menu</span>
                  <Image
                    alt=""
                    src={getAvatarUrl()}
                    width={32}
                    height={32}
                    className="size-8 rounded-full bg-gray-50 dark:bg-gray-800"
                  />
                  <span className="hidden lg:flex lg:items-center">
                    <span
                      aria-hidden="true"
                      className="ml-4 text-sm leading-6 font-semibold text-gray-900 dark:text-white"
                    >
                      {getUserName()}
                    </span>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="ml-2 size-5 text-gray-400 dark:text-gray-500"
                    />
                  </span>
                </MenuButton>
                <MenuItems
                  transition
                  className="absolute right-0 z-10 mt-2.5 w-32 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 transition focus:outline-none data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in dark:bg-gray-900 dark:ring-white/10"
                >
                  <MenuItem>
                    <button
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="block w-full px-3 py-1 text-left text-sm leading-6 text-gray-900 data-focus:bg-gray-50 dark:text-white dark:data-focus:bg-gray-800"
                    >
                      Sign out
                    </button>
                  </MenuItem>
                </MenuItems>
              </Menu>
            </div>
          </div>
        </div>

        <main className="py-10 lg:pl-20">
          <div className="px-2 sm:px-4 lg:px-8">{children}</div>
        </main>
      </div>

      {/* Render search component if provided (admin mode) */}
      {searchComponent}
    </>
  )
}
