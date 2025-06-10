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
} from '@headlessui/react'
import {
  Bars3Icon,
  ChartPieIcon,
  DocumentTextIcon,
  HomeIcon,
  UsersIcon,
  XMarkIcon,
  PresentationChartLineIcon,
  CalendarDaysIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline'
import { Logomark } from '@/components/Logo'

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: HomeIcon },
  { name: 'Proposals', href: '/admin/proposals', icon: DocumentTextIcon },
  { name: 'Speakers', href: '/admin/speakers', icon: UsersIcon },
  { name: 'Schedule', href: '/admin/schedule', icon: CalendarDaysIcon },
  { name: 'Sponsors', href: '/admin/sponsors', icon: BuildingOfficeIcon },
  { name: 'Analytics', href: '/admin/analytics', icon: ChartPieIcon },
  { name: 'Reports', href: '/admin/reports', icon: PresentationChartLineIcon },
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

        {/* Static sidebar for desktop */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
          <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-gray-900 px-6">
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
        </div>

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

        <main className="py-10 lg:pl-72">
          <div className="px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </>
  )
}
