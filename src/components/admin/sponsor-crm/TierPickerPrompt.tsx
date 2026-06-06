'use client'

import { DialogTitle } from '@headlessui/react'
import { Button } from '@/components/Button'
import { ModalShell } from '@/components/ModalShell'
import { sortSponsorTiers } from '@/components/admin/sponsor-crm/utils'
import type { SponsorTier } from '@/lib/sponsor/types'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

interface TierPickerPromptProps {
  /** The sponsor held mid-move; `null` keeps the prompt closed. */
  sponsor: SponsorForConferenceExpanded | null
  tiers: SponsorTier[]
  /** Sets the tier and completes the move to closed-won in one step. */
  onSelect: (tierId: string) => void
  onCancel: () => void
}

/**
 * Guided completion for a tierless drag onto `closed-won`: an untiered sponsor
 * is hidden from the public site, so the move is held until a tier is picked.
 * Clicking a tier completes the move in a single interaction; Cancel leaves the
 * sponsor in its original stage.
 */
export function TierPickerPrompt({
  sponsor,
  tiers,
  onSelect,
  onCancel,
}: TierPickerPromptProps) {
  // Only standard/special tiers can be a sponsor's primary tier — addons are a
  // separate concern (the form keeps them out of its tier picker too), and the
  // closed-won guard checks the primary tier, so an addon must not be offered.
  const selectableTiers = sortSponsorTiers(tiers).filter(
    (tier) => tier.tierType !== 'addon',
  )

  return (
    <ModalShell isOpen={sponsor !== null} onClose={onCancel} size="md">
      <div className="text-center">
        <DialogTitle
          as="h2"
          className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white"
        >
          Set a tier to mark as Won
        </DialogTitle>
        <p className="mt-2 text-sm text-brand-slate-gray/80 dark:text-gray-400">
          {sponsor?.sponsor?.name
            ? `${sponsor.sponsor.name} needs a tier before it can be Won — `
            : 'A tier is required before marking as Won — '}
          untiered sponsors are hidden from the public site.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {selectableTiers.map((tier) => (
          <button
            key={tier._id}
            type="button"
            title={tier.title}
            onClick={() => onSelect(tier._id)}
            className="min-w-0 truncate rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:border-indigo-500 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
          >
            {tier.title}
          </button>
        ))}
      </div>

      {selectableTiers.length === 0 && (
        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          No tiers are configured for this conference yet. Add one in Sanity
          Studio before marking sponsors as Won.
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <Button
          variant="outline"
          onClick={onCancel}
          className="font-space-grotesk rounded-xl border-brand-frosted-steel px-4 py-2.5 text-sm font-semibold text-brand-slate-gray transition-all duration-200 hover:bg-brand-sky-mist dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </Button>
      </div>
    </ModalShell>
  )
}
