import { Format, Status, isWorkshopFormat } from '@/lib/proposal/types'

/**
 * What the portal lists as a workshop (#1301): ONE rule for the listing
 * (`getWorkshops`), the sign-up that may only take what it lists, and the
 * promotion emails that only tell of a workshop that is on.
 */
export const LISTED_WORKSHOP_FORMATS =
  Object.values(Format).filter(isWorkshopFormat)
export const LISTED_WORKSHOP_STATUSES = [Status.confirmed]

const listedStatuses: ReadonlySet<string> = new Set(LISTED_WORKSHOP_STATUSES)
const listedFormats: ReadonlySet<string> = new Set(LISTED_WORKSHOP_FORMATS)

/**
 * A stored talk the portal lists. A draft or a release version (an id under a
 * path) never is. Which conference it is listed in is the caller's to check:
 * `isListedWorkshopOf` reads one by id and asks both.
 */
export const isListedWorkshop = (talk: {
  _id: string
  status?: string
  format?: string
}) =>
  !talk._id.includes('.') &&
  listedStatuses.has(talk.status ?? '') &&
  listedFormats.has(talk.format ?? '')
