'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
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
  Cog6ToothIcon,
  DocumentTextIcon,
  HomeIcon,
  UsersIcon,
  XMarkIcon,
  CalendarDaysIcon,
  BuildingOfficeIcon,
  TicketIcon,
  MagnifyingGlassIcon,
  BellIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { Logomark } from '@/components/Logo'
import { SearchModal } from './SearchModal'

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: HomeIcon },
  { name: 'Proposals', href: '/admin/proposals', icon: DocumentTextIcon },
  { name: 'Speakers', href: '/admin/speakers', icon: UsersIcon },
  { name: 'Schedule', href: '/admin/schedule', icon: CalendarDaysIcon },
  { name: 'Sponsors', href: '/admin/sponsors', icon: BuildingOfficeIcon },
  { name: 'Tickets', href: '/admin/tickets', icon: TicketIcon },
  { name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon },
]

import clsx from 'clsx'
import { NotificationProvider } from './NotificationProvider'

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchModalOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <NotificationProvider>
      <>
        <div>
          <Dialog
            open={sidebarOpen}
            onClose={setSidebarOpen}
            className="relative z-50 lg:hidden"
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

                <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-gray-900 px-6 pb-2 ring-1 ring-white/10">
                  <div className="flex h-16 shrink-0 items-center">
                    <Logomark className="h-8 w-auto text-white" />
                  </div>
                  <nav className="flex flex-1 flex-col">
                    <ul role="list" className="-mx-2 flex-1 space-y-1">
                      {navigation.map((item) => {
                        const isCurrent =
                          pathname === item.href ||
                          (item.href !== '/admin' &&
                            pathname.startsWith(item.href))
                        return (
                          <li key={item.name}>
                            <Link
                              href={item.href}
                              className={clsx(
                                isCurrent
                                  ? 'bg-gray-800 text-white'
                                  : 'text-gray-400 hover:bg-gray-800 hover:text-white',
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

          {/* Static sidebar for desktop - narrow with icons only */}
          <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-20 lg:flex-col">
            <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-gray-900 px-3 py-4">
              <div className="flex h-16 shrink-0 items-center justify-center">
                <Logomark className="h-8 w-auto text-white" />
              </div>
              <nav className="flex flex-1 flex-col">
                <ul role="list" className="flex-1 space-y-1">
                  {navigation.map((item) => {
                    const isCurrent =
                      pathname === item.href ||
                      (item.href !== '/admin' && pathname.startsWith(item.href))
                    return (
                      <li key={item.name}>
                        <Link
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
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            </div>
          </div>

          {/* Mobile top bar */}
          <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-gray-900 px-4 py-4 shadow-sm sm:px-6 lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="-m-2.5 p-2.5 text-gray-400 lg:hidden"
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3Icon aria-hidden="true" className="size-6" />
            </button>
            <div className="flex flex-1 items-center justify-center">
              <button
                type="button"
                onClick={() => setSearchModalOpen(true)}
                className="flex items-center gap-x-2 rounded-md bg-gray-800 px-3 py-1.5 text-sm text-gray-300 ring-1 ring-gray-600 ring-inset hover:bg-gray-700 hover:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none focus:ring-inset"
              >
                <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="ml-auto flex h-4 items-center gap-1 rounded bg-gray-700 px-1 text-xs font-semibold text-gray-300">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </button>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="focus:outline-none"
            >
              <span className="sr-only">Sign out</span>
              <Image
                alt=""
                src={
                  session?.user?.picture ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(session?.user?.name || 'Admin')}&background=4f46e5&color=fff`
                }
                width={32}
                height={32}
                className="size-8 rounded-full bg-gray-800 transition-opacity hover:opacity-80"
              />
            </button>
          </div>

          {/* Desktop top menu bar */}
          <div className="sticky top-0 z-40 hidden h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:flex lg:px-8 lg:pl-28">
            <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
              <div className="flex flex-1 items-center">
                <button
                  type="button"
                  onClick={() => setSearchModalOpen(true)}
                  className="flex w-full max-w-lg items-center gap-x-3 rounded-lg bg-white px-3 py-2 text-sm text-gray-500 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 hover:text-gray-700 focus:ring-2 focus:ring-indigo-600 focus:outline-none focus:ring-inset lg:max-w-xs"
                >
                  <MagnifyingGlassIcon
                    className="h-5 w-5 flex-shrink-0"
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-left">Search proposals...</span>
                  <kbd className="ml-auto flex h-5 items-center gap-0.5 rounded border border-gray-200 bg-gray-50 px-1.5 text-xs font-semibold text-gray-600">
                    <span className="text-xs">⌘</span>K
                  </kbd>
                </button>
              </div>
              <div className="flex items-center gap-x-4 lg:gap-x-6">
                <button
                  type="button"
                  className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">View notifications</span>
                  <BellIcon aria-hidden="true" className="size-6" />
                </button>

                {/* Separator */}
                <div
                  aria-hidden="true"
                  className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200"
                />

                {/* Profile dropdown */}
                <Menu as="div" className="relative">
                  <MenuButton className="-m-1.5 flex items-center p-1.5">
                    <span className="sr-only">Open user menu</span>
                    <Image
                      alt=""
                      src={
                        session?.user?.picture ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(session?.user?.name || 'Admin')}&background=4f46e5&color=fff`
                      }
                      width={32}
                      height={32}
                      className="size-8 rounded-full bg-gray-50"
                    />
                    <span className="hidden lg:flex lg:items-center">
                      <span
                        aria-hidden="true"
                        className="ml-4 text-sm leading-6 font-semibold text-gray-900"
                      >
                        {session?.user?.name || 'Admin'}
                      </span>
                      <ChevronDownIcon
                        aria-hidden="true"
                        className="ml-2 size-5 text-gray-400"
                      />
                    </span>
                  </MenuButton>
                  <MenuItems
                    transition
                    className="absolute right-0 z-10 mt-2.5 w-32 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 transition focus:outline-none data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                  >
                    <MenuItem>
                      <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="block w-full px-3 py-1 text-left text-sm leading-6 text-gray-900 data-focus:bg-gray-50"
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

        <SearchModal
          open={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
        />
      </>
    </NotificationProvider>
  )
}
