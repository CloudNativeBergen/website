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

export function Header({ c }: { c: Conference }) {
  const { data: session } = useSession()
  
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
            <Logo className="h-12 w-auto text-slate-900" />
          </Link>
        </div>
        <div className="order-first -mx-4 flex flex-auto basis-full overflow-x-auto whitespace-nowrap border-b border-blue-600/10 py-4 font-mono text-sm sm:-mx-6 lg:order-none lg:mx-0 lg:basis-auto lg:border-0 lg:py-0">
          {(() => {
            const isPast = new Date(c.start_date) < new Date();
            const textColor = isPast ? 'text-slate-400' : 'text-blue-600';

            return (
              <div className={`mx-auto flex items-center gap-4 px-4 ${textColor}`}>
                <p>
                  <time dateTime={c.start_date}>{formatDates(c.start_date, c.end_date)}</time>
                </p>
                <DiamondIcon className="h-1.5 w-1.5 overflow-visible fill-current stroke-current" />
                <p>{c.city}, {c.country}</p>
                {isPast && (
                  <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-sm font-semibold text-slate-600">
                    Past Event
                  </span>
                )}
                <DiamondIcon className="h-1.5 w-1.5 overflow-visible fill-current stroke-current" />
                <a 
                  href={`https://${previousDomain}`}
                  className="text-blue-600 hover:text-blue-800"
                >
                  {previousYear} Conference
                </a>
              </div>
            );
          })()}
        </div>
        <div className="hidden whitespace-nowrap sm:mt-10 sm:flex lg:mt-0 lg:grow lg:basis-0 lg:justify-end">
          {c.registration_enabled && (
            <Button href={c.registration_link ?? '#'}>Get your ticket</Button>
          )}
        </div>
        <div className="ml-10 mt-10 sm:flex lg:ml-4 lg:mt-0">
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
              <UserCircleIcon className="h-12 w-12 text-slate-900" />
            )}
          </a>
        </div>
      </Container>
    </header>
  )
}
