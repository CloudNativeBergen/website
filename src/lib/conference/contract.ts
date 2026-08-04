/**
 * THE CROSS-APP CONFERENCE READ CONTRACT.
 *
 * This file is the ONE place that defines what a second application may read
 * off a `conference` document. Today that application is `RunKonf/kontroll`
 * (the self-service control panel at my.konf.app), which lists an
 * organization's conference editions straight out of Sanity.
 *
 * SLATED TO MOVE: this module is deliberately standalone — no app imports, no
 * Sanity client, no Next.js — so it can be lifted verbatim into a shared
 * `@runkonf/core` package and consumed by both apps. Keep it that way. If you
 * find yourself importing from `@/lib/...` here, the thing you are adding
 * belongs somewhere else.
 *
 * WHY IT IS NARROW: the `conference` document carries some 80 top-level fields
 * (235 paths once nested objects, arrays and named types are counted, at the
 * time of writing) and grows most weeks. kontroll depends on NINE of them — the
 * nine in
 * {@link CONFERENCE_CONTRACT_FIELDS} — plus the system field `_id`, which is
 * not a schema field and so is not in that list. Ten projection entries, nine
 * schema fields. Keeping the contract that small is the whole point: it is the
 * drift surface between two codebases, and a small surface is a cheap one. Do
 * NOT widen this to "the conference type"; add a second, equally narrow
 * projection if another view needs different fields.
 *
 * ENFORCEMENT: `__tests__/sanity/schema-contract.test.ts` asserts that every
 * schema field named here still exists in `sanity/schemaTypes/conference.ts`,
 * and locks both document types append-only against a committed baseline.
 */

/**
 * Conference visibility, as the app resolves it. ABSENT MEANS LIVE on legacy
 * documents, which is why the projection coalesces rather than passing the raw
 * field through — a consumer must never have to re-derive this rule.
 */
export type ConferenceContractVisibility = 'unlisted' | 'live'

/**
 * The only two event states no date can imply. ABSENT is the norm and means "a
 * normal event"; every other stage (save-the-date, CFP open, programme
 * published, post-event) is derived from the dates, not stored.
 */
export type ConferenceContractLifecycleStatus = 'cancelled' | 'archived'

/**
 * The NINE `conference` schema fields this contract reads. `_id` is deliberately
 * absent: it is a system field on every Sanity document, not something
 * `sanity/schemaTypes/conference.ts` declares, so asserting it against the
 * schema would fail for the wrong reason.
 *
 * This list is asserted against the live schema — a removal or a rename here is
 * a test failure, not a runtime surprise in the other app.
 *
 * Note `lifecycleStatus`, not `lifecycle`: `lifecycle` is a Studio FIELDSET
 * (a grouping in the editor UI), not a field on the document.
 */
export const CONFERENCE_CONTRACT_FIELDS = [
  'title',
  'organization',
  'city',
  'country',
  'startDate',
  'endDate',
  'domains',
  'visibility',
  'lifecycleStatus',
] as const

/**
 * The GROQ projection kontroll uses to list conferences: ten entries — `_id`
 * plus the nine schema fields above — with no references followed and no joins.
 * A listing row and nothing more.
 *
 * `organization` is projected as its raw reference id (`organizationId`)
 * because the consumer already knows which organization it asked for; it needs
 * the key, not the document.
 */
export const CONFERENCE_LIST_PROJECTION = `{
  _id,
  title,
  "organizationId": organization._ref,
  city,
  country,
  startDate,
  endDate,
  "domains": coalesce(domains, []),
  "visibility": select(visibility == "unlisted" => "unlisted", "live"),
  "lifecycleStatus": lifecycleStatus
}`

/**
 * List every conference edition owned by one organization, newest first.
 * Takes a single `$organizationId` parameter (an `organization` document id).
 */
// groq-global-scoped: filtered on `organization._ref == $organizationId` inline
// rather than via src/lib/sanity/scoped.ts, because this constant must stay
// importable by a second app that has no copy of that module.
export const CONFERENCE_LIST_BY_ORGANIZATION_QUERY = `*[_type == "conference" && organization._ref == $organizationId] | order(startDate desc) ${CONFERENCE_LIST_PROJECTION}`

/** One row of {@link CONFERENCE_LIST_BY_ORGANIZATION_QUERY}. */
export interface ConferenceListItem {
  _id: string
  title: string
  /** The owning `organization` document id. Null on un-backfilled legacy docs. */
  organizationId: string | null
  city: string
  country: string
  /** `YYYY-MM-DD` — a Sanity `date`, not a datetime. */
  startDate: string
  /** `YYYY-MM-DD` — a Sanity `date`, not a datetime. */
  endDate: string
  /** Hostnames this edition is served on. Coalesced to `[]`, never null. */
  domains: string[]
  /** Already resolved: absent in Sanity is returned as `live`. */
  visibility: ConferenceContractVisibility
  /** Absent (null) means a normal event — the common case. */
  lifecycleStatus: ConferenceContractLifecycleStatus | null
}
