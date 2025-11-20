'use client'

import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { DiamondIcon } from '@/components/DiamondIcon'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useSession, signOut } from 'next-auth/react'
import Image from 'next/image'
import { UserCircleIcon } from '@heroicons/react/24/solid'
import Link from 'next/link'
import { Conference } from '@/lib/conference/types'
import {
  isRegistrationAvailable,
  isConferenceOver,
} from '@/lib/conference/state'
import { formatDatesSafe } from '@/lib/time'
import { useEffect, useState } from 'react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'

export function Header({ c }: { c: Conference }) {
  const { data: session } = useSession()
  const [isPast, setIsPast] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    setIsPast(isConferenceOver(c))
  }, [c])

  const currentDomain = c.domains?.[0] ?? 'cloudnativebergen.dev'
  const currentYear = parseInt(currentDomain.split('.')[0])
  const previousYear = currentYear - 1
  const previousDomain = `${previousYear}.cloudnativebergen.dev`

  return (
    <header className="relative z-50 flex-none lg:pt-11">
      <Container className="flex flex-wrap items-center justify-center sm:justify-between lg:flex-nowrap">
        <div className="mt-10 lg:mt-0">
          <Link href="/">
            <Logo className="h-12 w-auto text-brand-slate-gray dark:text-white" />
          </Link>
        </div>
        <div className="font-jetbrains order-first -mx-4 flex flex-auto basis-full overflow-x-auto border-b border-brand-cloud-blue/10 py-4 text-sm whitespace-nowrap sm:-mx-6 lg:order-0 lg:mx-0 lg:basis-auto lg:border-0 lg:py-0">
          {isClient ? (
            <div
              className={`mx-auto flex items-center gap-4 px-4 ${
                isPast ? 'text-brand-cloud-gray' : 'text-brand-cloud-blue'
              }`}
            >
              <p>
                <time dateTime={c.start_date}>
                  {formatDatesSafe(c.start_date, c.end_date)}
                </time>
              </p>
              <DiamondIcon className="h-1.5 w-1.5 overflow-visible fill-current stroke-current" />
              <p>
                {c.city}, {c.country}
              </p>
              {isPast && (
                <span className="ml-2 rounded-full bg-brand-cloud-gray/20 px-2 py-0.5 text-sm font-semibold text-brand-cloud-gray">
                  Past Event
                </span>
              )}
              <DiamondIcon className="h-1.5 w-1.5 overflow-visible fill-current stroke-current" />
              <a
                href={`https://${previousDomain}`}
                className="text-brand-cloud-blue hover:text-brand-slate-gray"
              >
                {previousYear} Conference
              </a>
            </div>
          ) : (
            <div className="mx-auto flex items-center gap-4 px-4 text-brand-cloud-blue">
              <p>
                <time dateTime={c.start_date}>
                  {formatDatesSafe(c.start_date, c.end_date)}
                </time>
              </p>
              <DiamondIcon className="h-1.5 w-1.5 overflow-visible fill-current stroke-current" />
              <p>
                {c.city}, {c.country}
              </p>
              <DiamondIcon className="h-1.5 w-1.5 overflow-visible fill-current stroke-current" />
              <a
                href={`https://${previousDomain}`}
                className="text-brand-cloud-blue hover:text-brand-slate-gray"
              >
                {previousYear} Conference
              </a>
            </div>
          )}
        </div>
        <div className="hidden whitespace-nowrap sm:mt-10 sm:flex lg:mt-0 lg:grow lg:basis-0 lg:justify-end">
          {isRegistrationAvailable(c) && (
            <Button
              href={c.registration_link ?? '#'}
              variant="primary"
              className="flex h-12 items-center px-6 py-0"
            >
              Get your ticket
            </Button>
          )}
        </div>
        <div className="mt-10 ml-10 sm:flex lg:mt-0 lg:ml-4">
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {session ? (
              <Popover className="relative">
                <PopoverButton className="flex items-center focus:outline-none">
                  <Image
                    src={session.user.picture || '/images/default-avatar.png'}
                    alt={session.user.name || 'User'}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full"
                  />
                </PopoverButton>

                <PopoverPanel
                  transition
                  className="absolute right-0 z-10 mt-3 w-56 transition data-closed:translate-y-1 data-closed:opacity-0 data-enter:duration-200 data-enter:ease-out data-leave:duration-150 data-leave:ease-in"
                >
                  <div className="overflow-hidden rounded-xl bg-white p-2 text-sm font-semibold shadow-lg ring-1 ring-gray-900/5 dark:bg-gray-800 dark:ring-white/10">
                    <Link
                      href="/cfp/list"
                      className="block rounded-lg px-3 py-2 text-gray-900 transition hover:bg-gray-50 dark:text-white dark:hover:bg-gray-700"
                    >
                      My Dashboard
                    </Link>
                    <button
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="block w-full rounded-lg px-3 py-2 text-left text-gray-900 transition hover:bg-gray-50 dark:text-white dark:hover:bg-gray-700"
                    >
                      Sign Out
                    </button>
                  </div>
                </PopoverPanel>
              </Popover>
            ) : (
              <Link href="/cfp/list" className="flex items-center">
                <UserCircleIcon className="h-10 w-10 text-brand-slate-gray dark:text-white" />
              </Link>
            )}
          </div>
        </div>
      </Container>
    </header>
  )
}
