'use client'

import { useState } from 'react'
import {
  ArrowPathIcon,
  CheckBadgeIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from './NotificationProvider'
import { api } from '@/lib/trpc/client'
import type { DomainVerificationView } from '@/lib/domain-verification'

/**
 * Domain ownership verification, admin surface (#683).
 *
 * Shows, per claimed domain: whether control has been proven, the exact TXT
 * record to publish, whether the host is currently on the sign-in redirect
 * allowlist, and a live re-check action.
 *
 * The allowlist verdict is rendered per row on purpose. It is the one piece of
 * state whose failure mode is completely silent — a domain that quietly drops
 * off the allowlist produces no error anywhere a human would see it — so the
 * card states it explicitly rather than leaving it to be inferred from `status`.
 */

export interface DomainVerificationCardProps {
  /** Server-rendered initial state; the query refetches on mount. */
  initialDomains: DomainVerificationView[]
  /** Storybook/test escape hatch: skip the tRPC query and render the props. */
  staticData?: boolean
}

type Tone = 'green' | 'amber' | 'red' | 'gray'

const TONE_CLASSES: Record<Tone, string> = {
  green:
    'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-500/30',
  amber:
    'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30',
  gray: 'bg-gray-100 text-gray-700 ring-gray-500/20 dark:bg-white/10 dark:text-gray-300 dark:ring-white/15',
}

const STATUS_ICONS = {
  green: CheckBadgeIcon,
  amber: ClockIcon,
  red: ExclamationTriangleIcon,
  gray: WrenchScrewdriverIcon,
} as const

function statusLabel(domain: DomainVerificationView): {
  tone: Tone
  label: string
} {
  if (domain.devOnly)
    return { tone: 'gray', label: 'Local dev — not verifiable' }
  // Before `status`: a subdomain the platform allocated is verified by
  // construction and there is nothing for the organizer to do, so it must never
  // read "Awaiting DNS".
  if (domain.platformOwned)
    return { tone: 'green', label: 'Provided by the platform' }
  if (domain.grandfathered) return { tone: 'amber', label: 'Grandfathered' }
  switch (domain.status) {
    case 'verified':
      return { tone: 'green', label: 'Verified' }
    case 'failing':
      return { tone: 'red', label: 'Proof missing' }
    case 'revoked':
      return { tone: 'gray', label: 'Revoked' }
    default:
      return { tone: 'amber', label: 'Awaiting DNS' }
  }
}

function formatDay(iso: string | null): string | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString().slice(0, 10)
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const { showNotification } = useNotification()
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 rounded bg-gray-50 px-2 py-1 font-mono text-xs break-all text-gray-900 ring-1 ring-gray-200 dark:bg-white/5 dark:text-gray-100 dark:ring-white/10">
          {value}
        </code>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(
              () =>
                showNotification({
                  type: 'success',
                  title: 'Copied',
                  message: `${label} copied to the clipboard.`,
                }),
              () =>
                showNotification({
                  type: 'error',
                  title: 'Could not copy',
                  message: 'Copy the value manually.',
                }),
            )
          }}
        >
          <ClipboardDocumentIcon className="size-4" />
        </button>
      </dd>
    </div>
  )
}

export function DomainVerificationCard({
  initialDomains,
  staticData = false,
}: DomainVerificationCardProps) {
  const { showNotification } = useNotification()
  const [busy, setBusy] = useState<string | null>(null)

  const query = api.domainVerification.list.useQuery(undefined, {
    enabled: !staticData,
    initialData: { domains: initialDomains },
  })
  const utils = api.useUtils()

  const recheck = api.domainVerification.recheck.useMutation({
    onSuccess: ({ domain }) => {
      void utils.domainVerification.list.invalidate()
      showNotification(
        domain.status === 'verified'
          ? {
              type: 'success',
              title: 'Domain verified',
              message: `${domain.hostname} is proven and on the sign-in redirect allowlist.`,
            }
          : {
              type: 'warning',
              title: 'Not verified yet',
              message:
                domain.lastError ??
                'The DNS record was not found. It can take a while to propagate.',
            },
      )
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Check failed',
        message: error.message,
      })
    },
    onSettled: () => setBusy(null),
  })

  const domains = query.data?.domains ?? initialDomains

  if (domains.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No domains are claimed yet.
      </p>
    )
  }

  return (
    <ul className="space-y-4">
      {domains.map((domain) => {
        const { tone, label } = statusLabel(domain)
        const Icon = STATUS_ICONS[tone]
        const graceDay = formatDay(domain.graceUntil)
        return (
          <li
            key={domain.hostname}
            className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 font-mono text-sm break-all text-gray-900 dark:text-white">
                {domain.hostname}
              </span>
              <span
                className={clsx(
                  'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                  TONE_CLASSES[tone],
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </span>
            </div>

            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              Sign-in redirect allowlist:{' '}
              <span
                className={clsx(
                  'font-medium',
                  domain.redirectAllowlisted
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-gray-900 dark:text-gray-200',
                )}
              >
                {domain.redirectAllowlisted ? 'included' : 'excluded'}
              </span>
              {domain.wildcard && (
                <>
                  {' '}
                  — wildcard claims are never allowlisted; claim the exact host
                  you sign in on.
                </>
              )}
            </p>

            {domain.platformOwned && (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                This subdomain&apos;s DNS is managed by the platform, so
                ownership needs no proof and nothing expires. Claim your own
                domain as well if you would rather use one.
              </p>
            )}

            {domain.grandfathered && graceDay && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Admitted without proof when verification shipped. Publish the
                record below before {graceDay} or this domain stops being
                trusted.
              </p>
            )}

            {domain.lastError && domain.status !== 'verified' && (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                {domain.lastError}
              </p>
            )}

            {domain.recordName && domain.recordValue && (
              <dl className="mt-3 space-y-2">
                <CopyValue label="TXT record name" value={domain.recordName} />
                <CopyValue
                  label="TXT record value"
                  value={domain.recordValue}
                />
              </dl>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {!domain.devOnly && !domain.platformOwned && (
                <AdminButton
                  size="xs"
                  variant="secondary"
                  disabled={busy === domain.hostname || recheck.isPending}
                  onClick={() => {
                    setBusy(domain.hostname)
                    recheck.mutate({ hostname: domain.hostname })
                  }}
                >
                  <ArrowPathIcon
                    className={clsx(
                      'mr-1 inline size-3.5',
                      busy === domain.hostname && 'animate-spin',
                    )}
                  />
                  Check now
                </AdminButton>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatDay(domain.lastCheckedAt)
                  ? `Last checked ${formatDay(domain.lastCheckedAt)}`
                  : 'Never checked'}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
