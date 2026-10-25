import { Format, Status, isWorkshopFormat } from '@/lib/proposal/types'

/**
 * What the portal lists as a workshop (#1301): ONE rule for the listing
 * (`getWorkshops`), the sign-up that may only take what it lists, and the
 * promotion emails that only tell of a workshop that is on.
 */
export const LISTED_WORKSHOP_FORMATS =
  Object.values(Format).filter(isWorkshopFormat)
export const LISTED_WORKSHOP_STATUSES = [Status.confirmed]
/**
 * A workshop that was on and is no longer: never listed, but its sign-ups
 * stay, so the admin shows it for the organizer to tell and move them.
 */
export const CANCELED_WORKSHOP_STATUSES = [Status.canceled, Status.withdrawn]

const listedStatuses: ReadonlySet<string> = new Set(LISTED_WORKSHOP_STATUSES)
const canceledStatuses: ReadonlySet<string> = new Set(
  CANCELED_WORKSHOP_STATUSES,
)
const listedFormats: ReadonlySet<string> = new Set(LISTED_WORKSHOP_FORMATS)

const isStoredWorkshop = (talk: { _id: string; format?: string }) =>
  !talk._id.startsWith('drafts.') &&
  !talk._id.startsWith('versions.') &&
  listedFormats.has(talk.format ?? '')

/**
 * A stored talk the portal lists. A draft or a release version never is (an
 * ordinary id may hold a dot: the demo seed's `kkdemo.talk.s4`). Which conference it is listed in is the caller's to check:
 * `isListedWorkshopOf` reads one by id and asks both.
 */
export const isListedWorkshop = (talk: {
  _id: string
  status?: string
  format?: string
}) => isStoredWorkshop(talk) && listedStatuses.has(talk.status ?? '')

/** A stored workshop that was canceled or withdrawn (admin only). */
export const isCanceledWorkshop = (talk: {
  _id: string
  status?: string
  format?: string
}) => isStoredWorkshop(talk) && canceledStatuses.has(talk.status ?? '')
