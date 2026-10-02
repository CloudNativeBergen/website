'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TicketIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from './NotificationProvider'
import { api } from '@/lib/trpc/client'

export interface AssignableSponsor {
  sponsorForConferenceId: string
  name: string
}

/**
 * Discount code manager → Assign to sponsor (#1262): link a code created in
 * advance to a sponsor WITHOUT sending it. From then on the sponsor's row, its
 * entitlement usage and the next discount send all treat the code as theirs.
 */
export function AssignDiscountCodeDialog({
  isOpen,
  onClose,
  code,
  sponsors,
  onAssigned,
}: {
  isOpen: boolean
  onClose: () => void
  code: string
  sponsors: readonly AssignableSponsor[]
  onAssigned?: (sponsorName: string) => void
}) {
  const router = useRouter()
  const selectId = useId()
  const { showNotification } = useNotification()
  const assign = api.sponsor.crm.assignDiscountCodes.useMutation()
  const [sponsorForConferenceId, setSponsorForConferenceId] = useState('')
  const chosen = sponsors.find(
    (s) => s.sponsorForConferenceId === sponsorForConferenceId,
  )

  const handleAssign = async () => {
    if (!chosen) return
    try {
      await assign.mutateAsync({
        sponsorForConferenceId: chosen.sponsorForConferenceId,
        discountCodes: [code],
      })
      showNotification({
        type: 'success',
        title: 'Code assigned',
        message: `${code} is now linked to ${chosen.name}.`,
      })
      setSponsorForConferenceId('')
      // The stored link reaches the page through its server props.
      router.refresh()
      onAssigned?.(chosen.name)
      onClose()
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Could not assign the code',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Assign to sponsor"
      subtitle={
        <>
          Link <span className="font-mono font-medium">{code}</span> to a
          sponsor without emailing it.
        </>
      }
      icon={<TicketIcon />}
    >
      <div className="space-y-4">
        <div>
          <label
            htmlFor={selectId}
            className="font-space-grotesk block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Sponsor
          </label>
          <select
            id={selectId}
            value={sponsorForConferenceId}
            onChange={(e) => setSponsorForConferenceId(e.target.value)}
            disabled={assign.isPending}
            className="mt-1 block min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="">Choose a sponsor…</option>
            {sponsors.map((s) => (
              <option
                key={s.sponsorForConferenceId}
                value={s.sponsorForConferenceId}
              >
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            The sponsor&apos;s row then counts this code&apos;s redemptions, and
            their next discount email preselects it.
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <AdminButton
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={assign.isPending}
          >
            Cancel
          </AdminButton>
          <AdminButton
            type="button"
            onClick={handleAssign}
            disabled={!chosen || assign.isPending}
          >
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </AdminButton>
        </div>
      </div>
    </ModalShell>
  )
}
