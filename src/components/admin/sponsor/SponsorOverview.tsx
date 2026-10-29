'use client'

import Link from 'next/link'
import { useMemo, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  BanknotesIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  DocumentDuplicateIcon,
  EnvelopeIcon,
  RectangleStackIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import type { SupportedCurrency } from '@/lib/travel-support/types'
import { formatCurrency } from '@/lib/format'
import {
  boardActionHref,
  countSponsorsWaiting,
  organizerWorklist,
  type ActionItem,
} from '@/lib/sponsor-crm/action-items'
import {
  actionTypeCounts,
  moneyTotals,
  MONEY_SEGMENTS,
  NEEDS_YOU_LIMIT,
  pipelineStageTotals,
  sponsorLogoFacts,
  tierCapacity,
  type MoneyKey,
  type ToNOK,
} from '@/lib/sponsor-crm/overview'
import { sponsorEventRows, type ActivationRow } from '@/lib/settings/activation'
import { SponsorActivityTimeline } from './SponsorActivityTimeline'

const card =
  'rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800'
const heading = 'text-base font-semibold text-gray-900 dark:text-white'
const linkClass =
  'font-medium text-indigo-600 hover:text-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300'

function Section({
  id,
  title,
  action,
  children,
}: {
  id: string
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className={card}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className={heading}>
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

const nok = (n: number) => formatCurrency(Math.round(n))

/** Renewal items have no link when their edition has no usable domain. */
function MaybeLink({
  href,
  ...props
}: { href: string } & React.HTMLAttributes<HTMLElement>) {
  return href ? <Link href={href} {...props} /> : <div {...props} />
}

/**
 * One row per sponsor, its most urgent item first (`items` is sorted), capped
 * at `NEEDS_YOU_LIMIT` sponsors.
 */
function bySponsor(items: ActionItem[]): ActionItem[][] {
  const groups = new Map<string, ActionItem[]>()
  for (const item of items) {
    const group = groups.get(item.sponsor.id)
    if (group) group.push(item)
    else groups.set(item.sponsor.id, [item])
  }
  return [...groups.values()].slice(0, NEEDS_YOU_LIMIT)
}

export function NeedsYouSection({ items }: { items: ActionItem[] }) {
  const counts = actionTypeCounts(items)
  const boardTotal = counts.reduce((sum, c) => sum + c.count, 0)
  return (
    <Section
      id="needs-you"
      title="Needs you"
      action={
        boardTotal > 0 && (
          <Link
            href={boardActionHref('all')}
            className={`text-sm ${linkClass}`}
          >
            See all {boardTotal}
          </Link>
        )
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Nothing is waiting on you or on an unassigned sponsor.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {counts.map((c, i) => (
              <span key={c.type}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <Link href={boardActionHref(c.type)} className={linkClass}>
                  {c.label}
                </Link>
              </span>
            ))}
          </p>
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-700">
            {bySponsor(items).map(([item, ...rest]) => (
              <li key={item.id}>
                <MaybeLink
                  href={item.link}
                  className="flex items-baseline justify-between gap-3 py-2 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-gray-700/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                      {item.sponsor.name}
                    </span>
                    <span className="block truncate text-xs text-gray-600 dark:text-gray-400">
                      {item.description}
                    </span>
                  </span>
                  <span
                    className={clsx(
                      'shrink-0 text-xs font-medium',
                      item.priority <= 2
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-gray-700 dark:text-gray-300',
                    )}
                  >
                    {item.title}
                    {rest.length > 0 && (
                      <span className="block text-right font-normal text-gray-500 dark:text-gray-400">
                        <span aria-hidden="true">+{rest.length} more</span>
                        <span className="sr-only">
                          , also: {rest.map((r) => r.title).join(', ')}
                        </span>
                      </span>
                    )}
                  </span>
                </MaybeLink>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

export interface PipelineProgress {
  label: string
  used: number
  total: number
  format: (n: number) => string
}

export function PipelineSection({
  stages,
  progress,
}: {
  stages: ReturnType<typeof pipelineStageTotals>
  progress: PipelineProgress | null
}) {
  const pct = progress?.total
    ? Math.min(100, Math.round((progress.used / progress.total) * 100))
    : 0
  return (
    <Section id="pipeline" title="Pipeline at a glance">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stages.map((s) => (
          <li
            key={s.status}
            className="rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/40"
          >
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {s.label}
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {s.count}
            </p>
            <p className="text-xs text-gray-700 dark:text-gray-300">
              {nok(s.value)}
            </p>
          </li>
        ))}
      </ol>
      {progress && progress.total > 0 && (
        <div className="mt-4">
          <p className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
            <span>{progress.label}</span>
            <span>
              {progress.format(progress.used)} of{' '}
              {progress.format(progress.total)} ({pct}%)
            </span>
          </p>
          <div
            role="progressbar"
            aria-label={progress.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          >
            <div
              className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </Section>
  )
}

const MONEY_COLORS: Record<MoneyKey, string> = {
  signed: 'bg-sky-400 dark:bg-sky-500',
  invoiced: 'bg-indigo-500 dark:bg-indigo-400',
  paid: 'bg-emerald-600 dark:bg-emerald-400',
  overdue: 'bg-red-600 dark:bg-red-400',
}

export function MoneySection({ totals }: { totals: Record<MoneyKey, number> }) {
  const sum = MONEY_SEGMENTS.reduce((s, m) => s + totals[m.key], 0)
  return (
    <Section id="money" title="Money">
      {sum === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No signed deals yet.
        </p>
      ) : (
        <>
          {/* The legend below carries the numbers; the bar is decoration. */}
          <div
            aria-hidden="true"
            className="flex h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          >
            {MONEY_SEGMENTS.map((m) =>
              totals[m.key] > 0 ? (
                <div
                  key={m.key}
                  className={MONEY_COLORS[m.key]}
                  style={{ width: `${(totals[m.key] / sum) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MONEY_SEGMENTS.map((m) => (
              <div key={m.key}>
                <dt className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'h-2 w-2 rounded-full',
                      MONEY_COLORS[m.key],
                    )}
                  />
                  {m.label}
                </dt>
                <dd className="text-sm font-semibold text-gray-900 dark:text-white">
                  {nok(totals[m.key])}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Section>
  )
}

export function BeforeEventSection({ rows }: { rows: ActivationRow[] }) {
  return (
    <Section id="before-event" title="Before the event">
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start gap-2 text-sm">
            <CheckCircleIcon
              aria-hidden="true"
              className={clsx(
                'mt-0.5 h-4 w-4 shrink-0',
                row.done
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-gray-300 dark:text-gray-600',
              )}
            />
            <span>
              <Link href={row.anchor} className={linkClass}>
                {row.label}
              </Link>
              <span className="sr-only">
                {row.done ? ' (done)' : ' (to do)'}
              </span>
              {!row.done && row.hint && (
                <span className="block text-xs text-gray-600 dark:text-gray-400">
                  {row.hint}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function LatestActivitySection() {
  return (
    <Section
      id="latest-activity"
      title="Latest activity"
      action={
        <Link
          href="/admin/sponsors/activity"
          className={`text-sm ${linkClass}`}
        >
          Full activity log
        </Link>
      }
    >
      <SponsorActivityTimeline limit={5} showHeaderFooter={false} compact />
    </Section>
  )
}

const SUB_PAGES = [
  {
    href: '/admin/sponsors/crm',
    label: 'Sponsor CRM',
    icon: RectangleStackIcon,
  },
  { href: '/admin/sponsors/tiers', label: 'Sponsor Tiers', icon: ChartBarIcon },
  {
    href: '/admin/sponsors/contacts',
    label: 'Sponsor Contacts',
    icon: UserGroupIcon,
  },
  {
    href: '/admin/sponsors/activity',
    label: 'Activity Log',
    icon: ClipboardDocumentListIcon,
  },
  {
    href: '/admin/sponsors/contracts',
    label: 'Contract Templates',
    icon: DocumentDuplicateIcon,
  },
  { href: '/admin/sponsors/invoices', label: 'Invoices', icon: BanknotesIcon },
  {
    href: '/admin/sponsors/templates',
    label: 'Email Templates',
    icon: EnvelopeIcon,
  },
]

export function SubPageLinks() {
  return (
    <nav aria-label="Sponsor pages">
      <ul className="flex flex-wrap gap-2">
        {SUB_PAGES.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

interface SponsorOverviewProps {
  organizerId: string | null
  /** `conference.sponsorRevenueGoal`; without one, tier capacity is shown. */
  revenueGoal?: number
  /** `isEventHeroWindow` for the conference, resolved on the server. */
  showBeforeEvent: boolean
}

/**
 * The sponsor overview. Reads `crm.list` and `renewalReminders` (both cached
 * for the board and the old action list), the activity feed, and tiers only
 * when there is no revenue goal to measure against.
 */
export function SponsorOverview({
  organizerId,
  revenueGoal,
  showBeforeEvent,
}: SponsorOverviewProps) {
  const { data: sponsors = [] } = api.sponsor.crm.list.useQuery({})
  const { data: renewals } = api.sponsor.crm.renewalReminders.useQuery()
  const { data: tiers = [] } = api.sponsor.tiers.listByConference.useQuery(
    undefined,
    { enabled: !revenueGoal },
  )
  const { exchangeRates, convertCurrency } = useExchangeRates()

  const toNOK: ToNOK = useMemo(
    () => (amount, currency) =>
      exchangeRates
        ? convertCurrency(amount, currency as SupportedCurrency, 'NOK')
        : amount,
    [exchangeRates, convertCurrency],
  )

  const items = useMemo(
    () => organizerWorklist(sponsors, organizerId, renewals ?? null),
    [sponsors, organizerId, renewals],
  )
  const stages = useMemo(
    () => pipelineStageTotals(sponsors, toNOK),
    [sponsors, toNOK],
  )
  const money = useMemo(() => moneyTotals(sponsors, toNOK), [sponsors, toNOK])

  const won = stages.find((s) => s.status === 'closed-won')!
  const progress: PipelineProgress = revenueGoal
    ? {
        label: 'Won against revenue goal',
        used: won.value,
        total: revenueGoal,
        format: nok,
      }
    : {
        label: 'Tier capacity used',
        ...tierCapacity(sponsors, tiers),
        format: String,
      }

  return (
    <div className="space-y-6">
      <NeedsYouSection items={items} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PipelineSection stages={stages} progress={progress} />
        <MoneySection totals={money} />
      </div>
      {showBeforeEvent && (
        <BeforeEventSection
          rows={sponsorEventRows({
            ...sponsorLogoFacts(sponsors),
            sponsorsWaiting: countSponsorsWaiting(sponsors),
          })}
        />
      )}
      <LatestActivitySection />
      <SubPageLinks />
    </div>
  )
}
