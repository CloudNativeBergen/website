'use client'

import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { DiamondIcon } from '@/components/DiamondIcon'
import { Logo } from '@/components/Logo'
import { useSession } from 'next-auth/react'
import { UserCircleIcon } from '@heroicons/react/24/solid'
import Link from 'next/link'
import { Conference } from '@/lib/conference/types'
import { formatDate } from '@/lib/time'

export function Header({ c }: { c: Conference }) {
  const { data: session } = useSession()

  return (
    <header className="relative z-50 flex-none lg:pt-11">
      <Container className="flex flex-wrap items-center justify-center sm:justify-between lg:flex-nowrap">
        <div className="mt-10 lg:mt-0 lg:grow lg:basis-0">
          <Link href="/">
            <Logo className="h-12 w-auto text-slate-900" />
          </Link>
        </div>
        <div className="order-first -mx-4 flex flex-auto basis-full overflow-x-auto whitespace-nowrap border-b border-blue-600/10 py-4 font-mono text-sm text-blue-600 sm:-mx-6 lg:order-none lg:mx-0 lg:basis-auto lg:border-0 lg:py-0">
          <div className="mx-auto flex items-center gap-4 px-4">
            <p>
              <time dateTime={c.start_date}>{formatDate(c.start_date)}</time>
            </p>
            <DiamondIcon className="h-1.5 w-1.5 overflow-visible fill-current stroke-current" />
            <p>{c.city}, {c.country}</p>
          </div>
        </div>
        <div className="hidden whitespace-nowrap sm:mt-10 sm:flex lg:mt-0 lg:grow lg:basis-0 lg:justify-end">
          <Button href={c.registration_link ?? '#'}>Get your ticket</Button>
        </div>
        <div className="ml-10 mt-10 sm:flex lg:ml-4 lg:mt-0">
          <a href="/cfp/list">
            {session ? (
              <img
                src={session.user.picture}
                alt={session.user.name}
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
