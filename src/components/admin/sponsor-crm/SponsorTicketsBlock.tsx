'use client'

import { useState } from 'react'
import { ClipboardIcon } from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { ticketEntitlementOf } from '@/lib/tickets/entitlement'
import { normalizeDiscountCode } from '@/lib/discounts/attribution'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useNotification } from '@/components/admin/NotificationProvider'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

type CodeOption = { code: string; selected: boolean; linked: boolean }

/** Codes the discount send counts as this sponsor's by name, not stored. */
export function nameMatchedCodes<T extends CodeOption>(
  codes: readonly T[] | undefined,
): T[] {
  return codes?.filter((c) => c.selected && !c.linked) ?? []
}

const SMALL_BUTTON =
  'min-h-10 rounded-md px-2 py-1 text-xs sm:min-h-0 font-medium text-gray-600 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/10'

/**
 * The sponsor panel's ticket discount codes (#1704 T1): the codes stored on
 * the record, against the tier's entitlement, and linking or unlinking one.
 * Codes are still created on /admin/tickets/discount.
 */
export function SponsorTicketsBlock({
  sponsor,
}: {
  sponsor: SponsorForConferenceExpanded
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const { copyToClipboard } = useCopyToClipboard()
  const [chosen, setChosen] = useState('')
  const [unlinking, setUnlinking] = useState<string | null>(null)

  const sponsorForConferenceId = sponsor._id
  const linked = sponsor.discountCodes ?? []
  const entitlement = ticketEntitlementOf(sponsor.tier)
  const options = api.sponsor.crm.discountCodeOptions.useQuery(
    { sponsorForConferenceId },
    { refetchOnWindowFocus: false },
  )
  const providerCode = (code: string) =>
    options.data?.codes.find(
      (c) => normalizeDiscountCode(c.code) === normalizeDiscountCode(code),
    )
  // Counted as this sponsor's by name only, as the discount send does while
  // the sponsor stores no codes. Linking stores them.
  const byName = nameMatchedCodes(options.data?.codes)
  // Free to link: not stored or matched here, and not held by another.
  const free =
    options.data?.codes.filter(
      (c) => !c.selected && !c.linked && !c.linkedTo && !c.attributedTo,
    ) ?? []

  const refresh = () => {
    void utils.sponsor.crm.getById.invalidate({ id: sponsorForConferenceId })
    void utils.sponsor.crm.discountCodeOptions.invalidate({
      sponsorForConferenceId,
    })
    void utils.sponsor.crm.activities.list.invalidate({
      sponsorForConferenceId,
    })
  }
  const fail = (title: string) => (error: { message: string }) =>
    showNotification({ type: 'error', title, message: error.message })

  const assign = api.sponsor.crm.assignDiscountCodes.useMutation({
    onSuccess: () => {
      setChosen('')
      refresh()
    },
    onError: fail('Could not link the code'),
  })
  const unassign = api.sponsor.crm.unassignDiscountCode.useMutation({
    onSuccess: () => {
      setUnlinking(null)
      refresh()
    },
    onError: fail('Could not unlink the code'),
  })

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {linked.length} code{linked.length === 1 ? '' : 's'} linked ·{' '}
        {entitlement > 0
          ? `the tier includes ${entitlement} ticket${entitlement === 1 ? '' : 's'}`
          : 'the tier includes no tickets'}
      </p>

      {linked.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-white/5">
          {linked.map(({ _key, code }) => {
            const p = providerCode(code)
            return (
              <li key={_key} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 font-mono text-sm break-all text-gray-900 dark:text-white">
                  {code}
                </span>
                <button
                  type="button"
                  onClick={() => void copyToClipboard(code)}
                  aria-label={`Copy discount code ${code}`}
                  className="rounded p-2 text-gray-400 hover:text-gray-600 sm:p-1 dark:hover:text-gray-300"
                >
                  <ClipboardIcon aria-hidden className="size-4" />
                </button>
                {p && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {p.type} {p.value}% · used {p.used} /{' '}
                    {p.limit || 'no limit'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setUnlinking(code)}
                  className={`ml-auto ${SMALL_BUTTON}`}
                >
                  Unlink
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {byName.length > 0 && (
        <div>
          <ul className="divide-y divide-gray-100 dark:divide-white/5">
            {byName.map((c) => (
              <li key={c.code} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 font-mono text-sm break-all text-gray-900 dark:text-white">
                  {c.code}
                </span>
                <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  Matched by name
                </span>
                <button
                  type="button"
                  className={`ml-auto ${SMALL_BUTTON}`}
                  disabled={assign.isPending}
                  aria-label={`Link ${c.code}`}
                  onClick={() =>
                    assign.mutate({
                      sponsorForConferenceId,
                      discountCodes: [c.code],
                    })
                  }
                >
                  Link
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            These codes carry the sponsor&apos;s name. Linking confirms them as
            this sponsor&apos;s codes.
          </p>
        </div>
      )}

      {options.error ? (
        <p className="text-xs text-red-600 dark:text-red-400">
          Could not read the codes from the ticketing provider.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Code to link"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            disabled={assign.isPending || free.length === 0}
            className="min-h-9 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="">
              {options.isLoading
                ? 'Loading codes…'
                : free.length
                  ? 'Choose a code…'
                  : 'No unlinked codes'}
            </option>
            {free.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={SMALL_BUTTON}
            disabled={!chosen || assign.isPending}
            onClick={() =>
              assign.mutate({ sponsorForConferenceId, discountCodes: [chosen] })
            }
          >
            {assign.isPending ? 'Linking…' : 'Link a code'}
          </button>
        </div>
      )}

      <ConfirmationModal
        isOpen={unlinking !== null}
        onClose={() => setUnlinking(null)}
        onConfirm={() =>
          unlinking &&
          unassign.mutate({ sponsorForConferenceId, code: unlinking })
        }
        title="Unlink code"
        message={`Unlink ${unlinking ?? ''} from ${sponsor.sponsor.name}? The code stays at the ticketing provider and can be linked again.`}
        confirmButtonText="Unlink"
        variant="warning"
        isLoading={unassign.isPending}
      />
    </div>
  )
}
