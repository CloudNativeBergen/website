'use client'

import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { DiamondIcon } from '@/components/DiamondIcon'
import { Logo } from '@/components/Logo'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import { UserCircleIcon } from '@heroicons/react/24/solid'
import Link from 'next/link'
import { Conference } from '@/lib/conference/types'
import { formatDates } from '@/lib/time'
import { useEffect, useState } from 'react'

export function Header({ c }: { c: Conference }) {
  const { data: session } = useSession()
  const [isPast, setIsPast] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    setIsPast(new Date(c.start_date) < new Date())
  }, [c.start_date])

  // Get the current year's domain and extract the year
  const currentDomain = c.domains?.[0] ?? 'cloudnativebergen.dev'
  const currentYear = parseInt(currentDomain.split('.')[0])
  const previousYear = currentYear - 1
  const previousDomain = `${previousYear}.cloudnativebergen.dev`

  return (
    <header className="relative z-50 flex-none lg:pt-11">
      <Container className="flex flex-wrap items-center justify-center sm:justify-between lg:flex-nowrap">
        <div className="mt-10 lg:mt-0 lg:grow lg:basis-0">
          <Link href="/">
            <Logo className="h-12 w-auto text-brand-slate-gray" />
          </Link>
        </div>
        <div className="font-jetbrains order-first -mx-4 flex flex-auto basis-full overflow-x-auto border-b border-brand-cloud-blue/10 py-4 text-sm whitespace-nowrap sm:-mx-6 lg:order-none lg:mx-0 lg:basis-auto lg:border-0 lg:py-0">
          {isClient ? (
            <div
              className={`mx-auto flex items-center gap-4 px-4 ${
                isPast ? 'text-brand-cloud-gray' : 'text-brand-cloud-blue'
              }`}
            >
              <p>
                <time dateTime={c.start_date}>
                  {formatDates(c.start_date, c.end_date)}
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
                  {formatDates(c.start_date, c.end_date)}
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
          {c.registration_enabled && (
            <Button href={c.registration_link ?? '#'} variant="primary">
              Get your ticket
            </Button>
          )}
        </div>
        <div className="mt-10 ml-10 sm:flex lg:mt-0 lg:ml-4">
          <a href="/cfp/list">
            {session ? (
              <Image
                src={session.user.picture || '/images/default-avatar.png'}
                alt={session.user.name || 'User'}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full"
              />
            ) : (
              <UserCircleIcon className="h-12 w-12 text-brand-slate-gray" />
            )}
          </a>
        </div>
      </Container>
    </header>
  )
}
