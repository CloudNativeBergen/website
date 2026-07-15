'use client'

import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { DiamondIcon } from '@/components/DiamondIcon'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useSession } from 'next-auth/react'
import { UserCircleIcon } from '@heroicons/react/24/solid'
import Link from 'next/link'
import { Conference } from '@/lib/conference/types'
import {
  isRegistrationAvailable,
  isConferenceOver,
} from '@/lib/conference/state'
import { formatDatesSafe } from '@/lib/time'
import { PIRSCH_EVENTS } from '@/lib/analytics'
import { UserMenu } from '@/components/UserMenu'

export function Header({ c }: { c: Conference }) {
  const { data: session } = useSession()
  const isPast = isConferenceOver(c)

  const currentDomain = c.domains?.[0] ?? 'cloudnativedays.no'
  const currentYear = parseInt(currentDomain.split('.')[0])
  const previousYear = currentYear - 1
  const previousDomain =
    currentYear <= 2026
      ? `${previousYear}.cloudnativebergen.dev`
      : `${previousYear}.cloudnativedays.no`

  return (
    <header className="relative z-50 flex-none lg:pt-11">
      <Container className="flex flex-wrap items-center justify-center sm:justify-between lg:flex-nowrap">
        <div className="mt-10 lg:mt-0">
          <Link href="/">
            <ConferenceLogo
              conference={c}
              variant="horizontal"
              className="h-14 w-auto text-brand-slate-gray dark:text-white"
            />
          </Link>
        </div>
        <div className="font-jetbrains order-first -mx-4 flex flex-auto basis-full overflow-x-auto border-b border-brand-cloud-blue/10 py-4 text-sm whitespace-nowrap sm:-mx-6 lg:order-0 lg:mx-0 lg:basis-auto lg:border-0 lg:py-0">
          <div
            className={`mx-auto flex items-center gap-4 px-4 ${
              isPast ? 'text-brand-cloud-gray' : 'text-brand-cloud-blue'
            }`}
          >
            <p>
              <time dateTime={c.startDate}>
                {formatDatesSafe(c.startDate, c.endDate)}
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
        </div>
        <div className="hidden whitespace-nowrap sm:mt-10 sm:flex lg:mt-0 lg:grow lg:basis-0 lg:justify-end">
          {isRegistrationAvailable(c) && (
            <Button
              href="/tickets"
              variant="primary"
              className="flex h-12 items-center px-6 py-0"
              data-pirsch-event={PIRSCH_EVENTS.ticketsHeader}
            >
              Get your ticket
            </Button>
          )}
        </div>
        <div className="mt-10 ml-10 sm:flex lg:mt-0 lg:ml-4">
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {session ? (
              <UserMenu
                name={session.user.name}
                picture={session.user.picture}
                speaker={session.speaker}
                account={session.account}
              />
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
