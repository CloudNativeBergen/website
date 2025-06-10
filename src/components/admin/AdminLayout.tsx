'use client'

import { useState } from 'react'
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

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: HomeIcon },
  { name: 'Proposals', href: '/admin/proposals', icon: DocumentTextIcon },
  { name: 'Speakers', href: '/admin/speakers', icon: UsersIcon },
  { name: 'Schedule', href: '/admin/schedule', icon: CalendarDaysIcon },
  { name: 'Sponsors', href: '/admin/sponsors', icon: BuildingOfficeIcon },
  { name: 'Tickets', href: '/admin/tickets', icon: TicketIcon },
  { name: 'Settings', href: '/admin/settings', icon: Cog6ToothIcon },
]

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <>
      <div>
        <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
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
                  <button type="button" onClick={() => setSidebarOpen(false)} className="-m-2.5 p-2.5">
                    <span className="sr-only">Close sidebar</span>
                    <XMarkIcon aria-hidden="true" className="size-6 text-white" />
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
                      const isCurrent = pathname === item.href ||
                        (item.href !== '/admin' && pathname.startsWith(item.href))
                      return (
                        <li key={item.name}>
                          <Link
                            href={item.href}
                            className={classNames(
                              isCurrent
                                ? 'bg-gray-800 text-white'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                              'group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6'
                            )}
                          >
                            <item.icon aria-hidden="true" className="size-6 shrink-0" />
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
                  const isCurrent = pathname === item.href ||
                    (item.href !== '/admin' && pathname.startsWith(item.href))
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        title={item.name}
                        className={classNames(
                          isCurrent
                            ? 'bg-gray-800 text-white'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                          'group flex justify-center rounded-md p-3 text-sm font-semibold leading-6'
                        )}
                      >
                        <item.icon aria-hidden="true" className="size-6 shrink-0" />
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
          <div className="flex-1 text-sm font-semibold leading-6 text-white">Dashboard</div>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="focus:outline-none"
          >
            <span className="sr-only">Sign out</span>
            <Image
              alt=""
              src={session?.user?.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(session?.user?.name || 'Admin')}&background=4f46e5&color=fff`}
              width={32}
              height={32}
              className="size-8 rounded-full bg-gray-800 hover:opacity-80 transition-opacity"
            />
          </button>
        </div>

        {/* Desktop top menu bar */}
        <div className="sticky top-0 z-40 hidden h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:flex lg:px-8 lg:pl-28">
          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <form action="#" method="GET" className="relative flex flex-1">
              <label htmlFor="search-field" className="sr-only">
                Search
              </label>
              <MagnifyingGlassIcon
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 h-full w-5 text-gray-400"
              />
              <input
                id="search-field"
                name="search"
                type="search"
                placeholder="Search..."
                className="block h-full w-full border-0 py-0 pl-8 pr-0 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm"
                disabled
              />
            </form>
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              <button type="button" className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500">
                <span className="sr-only">View notifications</span>
                <BellIcon aria-hidden="true" className="size-6" />
              </button>

              {/* Separator */}
              <div aria-hidden="true" className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" />

              {/* Profile dropdown */}
              <Menu as="div" className="relative">
                <MenuButton className="-m-1.5 flex items-center p-1.5">
                  <span className="sr-only">Open user menu</span>
                  <Image
                    alt=""
                    src={session?.user?.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(session?.user?.name || 'Admin')}&background=4f46e5&color=fff`}
                    width={32}
                    height={32}
                    className="size-8 rounded-full bg-gray-50"
                  />
                  <span className="hidden lg:flex lg:items-center">
                    <span aria-hidden="true" className="ml-4 text-sm font-semibold leading-6 text-gray-900">
                      {session?.user?.name || 'Admin'}
                    </span>
                    <ChevronDownIcon aria-hidden="true" className="ml-2 size-5 text-gray-400" />
                  </span>
                </MenuButton>
                <MenuItems
                  transition
                  className="absolute right-0 z-10 mt-2.5 w-32 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 transition focus:outline-none data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-leave:duration-75 data-enter:ease-out data-leave:ease-in"
                >
                  <MenuItem>
                    <button
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="block px-3 py-1 text-sm leading-6 text-gray-900 data-focus:bg-gray-50 w-full text-left"
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
          <div className="px-2 sm:px-4 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </>
  )
}
