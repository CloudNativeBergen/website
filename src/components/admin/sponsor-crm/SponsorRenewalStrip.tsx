'use client'

import { useState, useSyncExternalStore } from 'react'
import { ArrowPathIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import type { PreviousEditionRenewals } from '@/lib/sponsor-crm/renewal'

const STORAGE_KEY = 'sponsor-crm-renewal-strip-collapsed'
const noSubscribe = () => () => {}

export interface SponsorRenewalStripViewProps {
  renewals: PreviousEditionRenewals | null | undefined
  /** Resolves once the new prospect exists; the chip then goes away. */
  onRenew: (id: string) => Promise<unknown>
}

export function SponsorRenewalStripView({
  renewals,
  onRenew,
}: SponsorRenewalStripViewProps) {
  // Read after hydration; the server renders it expanded.
  const stored = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return localStorage.getItem(STORAGE_KEY) === '1'
      } catch {
        return false // Storage blocked: show it expanded.
      }
    },
    () => false,
  )
  const [toggled, setCollapsed] = useState<boolean | null>(null)
  const collapsed = toggled ?? stored
  const [done, setDone] = useState<string[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const candidates = (renewals?.candidates ?? []).filter(
    (c) => !done.includes(c._id),
  )
  if (!renewals?.edition.ended || candidates.length === 0) return null

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Best-effort: collapsed for this visit even if it can't be saved.
    }
  }

  const renew = async (id: string) => {
    setPending(id)
    setError(null)
    try {
      await onRenew(id)
      setDone((d) => [...d, id])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(null)
    }
  }

  const n = candidates.length
  return (
    <section className="mb-3 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-gray-200"
      >
        <ArrowPathIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
        <span className="flex-1">
          {n} {n === 1 ? 'sponsor' : 'sponsors'} from {renewals.edition.title}{' '}
          not renewed yet
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
      {!collapsed && (
        <ul className="flex gap-2 overflow-x-auto px-3 pb-3">
          {candidates.map((c) => (
            <li
              key={c._id}
              className="flex shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-gray-50 py-1 pr-1 pl-3 text-sm dark:border-gray-600 dark:bg-gray-900"
            >
              <span className="font-medium text-gray-900 dark:text-white">
                {c.name}
              </span>
              {c.tierTitle && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {c.tierTitle}
                </span>
              )}
              <button
                type="button"
                onClick={() => renew(c._id)}
                disabled={pending !== null}
                aria-label={`Renew ${c.name}`}
                className="min-h-11 rounded-full bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 sm:min-h-8"
              >
                {pending === c._id ? 'Renewing…' : 'Renew'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="px-3 pb-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  )
}

/** Last edition's won sponsors with no deal here yet (R2 candidates). */
export function SponsorRenewalStrip() {
  const utils = api.useUtils()
  const { data } = api.sponsor.crm.renewalReminders.useQuery()
  const copy = api.sponsor.crm.copyToNextYear.useMutation({
    onSuccess: () => {
      utils.sponsor.crm.list.invalidate()
      utils.sponsor.crm.renewalReminders.invalidate()
    },
  })
  return (
    <SponsorRenewalStripView
      renewals={data}
      onRenew={(id) => copy.mutateAsync({ id, intoCurrent: true })}
    />
  )
}
