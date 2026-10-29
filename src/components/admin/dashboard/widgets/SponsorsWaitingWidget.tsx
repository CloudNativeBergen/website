'use client'

import Link from 'next/link'
import { fetchSponsorsWaiting } from '@/lib/dashboard/fetchers'
import type { SponsorsWaitingData } from '@/lib/dashboard/data-types'
import type { BaseWidgetProps } from '@/lib/dashboard/types'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import {
  WidgetSkeleton,
  WidgetErrorState,
  WidgetEmptyState,
  WidgetHeader,
  WidgetBody,
} from './shared'

/** A renewal item has no href when its edition has no usable domain. */
function MaybeLink({
  href,
  ...props
}: { href: string } & React.HTMLAttributes<HTMLElement>) {
  return href ? <Link href={href} {...props} /> : <div {...props} />
}

export function SponsorsWaitingWidget({ conference }: BaseWidgetProps) {
  const { data, loading, error, refetch } = useWidgetData<SponsorsWaitingData>(
    conference ? () => fetchSponsorsWaiting() : null,
    [conference?._id],
  )

  return (
    <div className="flex h-full min-w-0 flex-col">
      <WidgetHeader
        title="Sponsors waiting on you"
        link={{ href: '/admin/sponsors/crm', label: 'See all' }}
      />
      {loading ? (
        <WidgetSkeleton />
      ) : error ? (
        <WidgetErrorState onRetry={refetch} />
      ) : !data?.items.length ? (
        <WidgetEmptyState message="Nothing waiting" />
      ) : (
        <WidgetBody>
          <ul className="flex flex-col gap-1.5">
            {data.items.map((item) => (
              <li key={item.id}>
                <MaybeLink
                  href={item.href}
                  className="block min-w-0 rounded-lg border border-gray-200 px-2.5 py-2 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <p
                    className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100"
                    title={item.sponsorName}
                  >
                    {item.sponsorName}
                  </p>
                  <p
                    className={
                      item.priority <= 2
                        ? 'mt-0.5 truncate text-[11px] text-red-700 dark:text-red-400'
                        : 'mt-0.5 truncate text-[11px] text-gray-600 dark:text-gray-400'
                    }
                  >
                    {item.title}
                  </p>
                </MaybeLink>
              </li>
            ))}
          </ul>
        </WidgetBody>
      )}
    </div>
  )
}
