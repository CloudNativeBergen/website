/**
 * How often an OPEN schedule editor asks the server what other organizers have
 * changed (`schedule.admin.pollExternalChanges`).
 *
 * 60s, up from 10s. This poll never reflects the current user's own work —
 * every local edit is applied by the reducer and persisted by autosave, and a
 * save advances the polled baseline directly (`setData`) — so the interval only
 * bounds how long ANOTHER organizer's edit can go unnoticed. A minute is well
 * inside the reaction time of a human who then has to read a banner and reload,
 * and it is the difference between 720 and 60 Sanity reads per hour per open
 * editor.
 *
 * Paired with `useIdlePolling`, so an editor left open on a wall monitor costs
 * nothing at all.
 */
export const SCHEDULE_POLL_MS = 60_000

/**
 * Duration choices (value → label) offered when creating or resizing a service
 * session. Shared by the desktop `ServiceSessionModal` and the mobile add/edit
 * sheets so the option list stays in sync in one place.
 */
export const SERVICE_DURATION_OPTIONS = new Map([
  ['5', '5 minutes'],
  ['10', '10 minutes'],
  ['15', '15 minutes'],
  ['20', '20 minutes'],
  ['30', '30 minutes'],
  ['45', '45 minutes'],
  ['60', '60 minutes'],
  ['90', '90 minutes'],
])
