'use client'

import { useCallback } from 'react'
import { api } from '@/lib/trpc/client'

/** Every query a sponsor's page or board card reads. */
export function useRefreshSponsor() {
  const utils = api.useUtils()
  return useCallback(
    (id: string) => {
      utils.sponsor.crm.getById.invalidate({ id })
      utils.sponsor.crm.getOverview.invalidate({ id })
      utils.sponsor.crm.getContacts.invalidate({ id })
      utils.sponsor.crm.getContractDetails.invalidate({ id })
      // Partial input: also matches the keys that add `limit`.
      utils.sponsor.crm.activities.list.invalidate({
        sponsorForConferenceId: id,
      })
      utils.sponsor.crm.activities.log.invalidate()
      utils.sponsor.crm.list.invalidate()
      utils.sponsor.crm.healthViolations.invalidate()
    },
    [utils],
  )
}
