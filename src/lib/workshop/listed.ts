import { Format, Status, isWorkshopFormat } from '@/lib/proposal/types'

/**
 * What the portal lists as a workshop (#1301): ONE rule for the listing
 * (`getWorkshops`), the sign-up that may only take what it lists, and the
 * promotion emails that only tell of a workshop that is on.
 */
export const LISTED_WORKSHOP_FORMATS =
  Object.values(Format).filter(isWorkshopFormat)
export const LISTED_WORKSHOP_STATUSES = [Status.confirmed]

/** A draft or a release version (an id under a path) is never listed. */
export const isListedWorkshop = (talk: {
  _id: string
  status?: string
  format?: string
}) =>
  !talk._id.includes('.') &&
  (LISTED_WORKSHOP_STATUSES as string[]).includes(talk.status ?? '') &&
  (LISTED_WORKSHOP_FORMATS as string[]).includes(talk.format ?? '')
