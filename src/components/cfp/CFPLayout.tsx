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
  HomeIcon,
  XMarkIcon,
  UserCircleIcon,
  PlusCircleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { Logomark } from '@/components/Logo'
import clsx from 'clsx'

const navigation = [
  { name: 'Dashboard', href: '/cfp/list', icon: HomeIcon },
  { name: 'Submit Proposal', href: '/cfp/submit', icon: PlusCircleIcon },
  { name: 'Profile', href: '/cfp/profile', icon: UserCircleIcon },
]

interface CFPLayoutProps {
  children: React.ReactNode
}

export function CFPLayout({ children }: CFPLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <>
      <div>
        {/* Mobile sidebar */}
        <Dialog
          open={sidebarOpen}
          onClose={setSidebarOpen}
          className="relative z-50 lg:hidden"
        >
          <DialogBackdrop
            transition
            className="fixed inset-0 bg-brand-slate-gray/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
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

              <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-brand-nordic-purple px-6 pb-2 ring-1 ring-white/10">
                <div className="flex h-16 shrink-0 items-center">
                  <Logomark className="h-8 w-auto text-white" />
                </div>
                <nav className="flex flex-1 flex-col">
                  <ul role="list" className="-mx-2 flex-1 space-y-1">
                    {navigation.map((item) => {
                      const isCurrent = pathname === item.href
                      return (
                        <li key={item.name}>
                          <Link
                            href={item.href}
                            className={clsx(
                              isCurrent
                                ? 'bg-brand-nordic-purple/90 text-white'
                                : 'text-brand-sky-mist hover:bg-brand-nordic-purple/90 hover:text-white',
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
          <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-brand-nordic-purple px-3 py-4">
            <div className="flex h-16 shrink-0 items-center justify-center">
              <Logomark className="h-8 w-auto text-white" />
            </div>
            <nav className="flex flex-1 flex-col">
              <ul role="list" className="flex-1 space-y-1">
                {navigation.map((item) => {
                  const isCurrent =
                    pathname === item.href ||
                    (item.name === 'My Proposals' && pathname === '/cfp/list')
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        title={item.name}
                        className={clsx(
                          isCurrent
                            ? 'bg-brand-nordic-purple/90 text-white'
                            : 'text-brand-sky-mist hover:bg-brand-nordic-purple/90 hover:text-white',
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
        <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-brand-slate-gray px-4 py-4 shadow-sm sm:px-6 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-m-2.5 p-2.5 text-brand-frosted-steel lg:hidden"
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>
          <div className="flex flex-1 items-center justify-between">
            <span className="text-sm font-semibold text-white">
              Call for Papers
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="focus:outline-none"
            >
              <span className="sr-only">Sign out</span>
              <Image
                alt=""
                src={
                  session?.user?.picture ||
                  `https://placehold.co/32x32/4f46e5/ffffff?text=${encodeURIComponent((session?.user?.name || 'Admin').split(' ').map(n => n[0]).join('').toUpperCase())}`
                }
                width={32}
                height={32}
                className="size-8 rounded-full bg-brand-slate-gray/90 transition-opacity hover:opacity-80"
              />
            </button>
          </div>
        </div>

        {/* Desktop top menu bar */}
        <div className="sticky top-0 z-40 hidden h-16 shrink-0 items-center gap-x-4 border-b border-brand-frosted-steel bg-brand-glacier-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:flex lg:px-8 lg:pl-28">
          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1 items-center">
              {/* Keep this empty to match admin layout */}
            </div>
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              {/* Separator */}
              <div
                aria-hidden="true"
                className="hidden lg:block lg:h-6 lg:w-px lg:bg-brand-frosted-steel"
              />

              {/* Profile dropdown */}
              <Menu as="div" className="relative">
                <MenuButton className="-m-1.5 flex items-center p-1.5">
                  <span className="sr-only">Open user menu</span>
                  <Image
                    alt=""
                    src={
                      session?.user?.picture ||
                      `https://placehold.co/32x32/4f46e5/ffffff?text=${encodeURIComponent((session?.user?.name || 'Admin').split(' ').map(n => n[0]).join('').toUpperCase())}`
                    }
                    width={32}
                    height={32}
                    className="size-8 rounded-full bg-brand-sky-mist"
                  />
                  <span className="hidden lg:flex lg:items-center">
                    <span
                      aria-hidden="true"
                      className="ml-4 text-sm leading-6 font-semibold text-brand-slate-gray"
                    >
                      {session?.user?.name || 'Admin'}
                    </span>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="ml-2 size-5 text-brand-frosted-steel"
                    />
                  </span>
                </MenuButton>
                <MenuItems
                  transition
                  className="absolute right-0 z-10 mt-2.5 w-32 origin-top-right rounded-md bg-brand-glacier-white py-2 shadow-lg ring-1 ring-brand-slate-gray/5 transition focus:outline-none data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                >
                  <MenuItem>
                    <button
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="block w-full px-3 py-1 text-left text-sm leading-6 text-brand-slate-gray data-focus:bg-brand-sky-mist"
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
    </>
  )
}
