import {
  workshopRegistrationWindow,
  type WorkshopRegistrationTimes,
  type WorkshopRegistrationWindow,
} from '../registration-window'

/**
 * THE WINDOW FOR ONE CALLER (#1346, spec §6 and §7): the one rule of
 * `workshopRegistrationWindow`, asked with the caller's early access.
 *
 * `lookUp` says whether the caller has early access, and what it found (the
 * sponsor, for a sign-up; the sponsor's name, for the page). IT IS CALLED ONLY
 * WHEN THE ANSWER CAN MATTER: the conference has an early-access window and
 * the official opening has not passed, which is exactly when the rule's answer
 * WITH early access is an early one. After the official opening, after the
 * end, and for a conference with no sponsor start time, nothing is looked up.
 *
 * `access` is what `lookUp` found, or `null`: without it, `registration` is
 * what everyone gets.
 *
 * A caller turned away (not open yet, or closed) leaves one log line with
 * `seen`: what the caller brought, never who they are.
 */
export async function registrationWindowFor<Access>(
  times: WorkshopRegistrationTimes,
  now: Date,
  lookUp: () => Promise<Access | null>,
  seen: { conferenceId: string; cookie: boolean; ticketType: boolean },
): Promise<{
  registration: WorkshopRegistrationWindow
  access: Access | null
}> {
  const withAccess = workshopRegistrationWindow(times, {
    now,
    earlyAccess: true,
  })
  const canMatter = withAccess.status !== 'closed' && withAccess.early
  const access = canMatter ? await lookUp() : null
  const registration = access
    ? withAccess
    : workshopRegistrationWindow(times, { now, earlyAccess: false })
  if (registration.status !== 'open') {
    console.warn(
      `[workshop] signup refused: ${registration.status} conference=${seen.conferenceId} early-window=${withAccess.status !== 'closed' && withAccess.early} early-access-cookie=${seen.cookie} early-access-ticket-type=${seen.ticketType} early-access=${access !== null}`,
    )
  }
  return { registration, access }
}
