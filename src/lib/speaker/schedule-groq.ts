/**
 * PUBLIC schedule predicate. A conference now keeps several `schedule` documents
 * per day — private `draft`s the organizers are still moving talks around in and
 * `archived` snapshots of every previously-published day — so a reverse lookup
 * that matches ANY document containing the talk resolves to whichever the store
 * happens to return first. After a single promote cycle an archived doc always
 * exists, which made the public speaker page show a stale (or never-published)
 * time slot at random.
 *
 * Legacy days written before the draft feature carry NO `status` at all: a bare
 * `status == "official"` would blank the program for every existing conference,
 * so a missing status counts as official — the same fallback `getScheduleData`
 * applies in `src/lib/schedule/server.ts`.
 */
export const OFFICIAL_SCHEDULE_FILTER =
  '(status == "official" || !defined(status))'
