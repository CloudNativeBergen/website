import { Format, Status, isWorkshopFormat } from '@/lib/proposal/types'

/**
 * What the portal lists as a workshop (#1301): ONE rule for the listing
 * (`getWorkshops`), the sign-up that may only take what it lists, and the
 * promotion emails that only tell of a workshop that is on.
 */
export const LISTED_WORKSHOP_FORMATS =
  Object.values(Format).filter(isWorkshopFormat)
export const LISTED_WORKSHOP_STATUSES = [Status.confirmed]

export const isListedWorkshop = (talk: { status?: string; format?: string }) =>
  (LISTED_WORKSHOP_STATUSES as string[]).includes(talk.status ?? '') &&
  (LISTED_WORKSHOP_FORMATS as string[]).includes(talk.format ?? '')
