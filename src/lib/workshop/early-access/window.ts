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
 */
export async function registrationWindowFor<Access>(
  times: WorkshopRegistrationTimes,
  now: Date,
  lookUp: () => Promise<Access | null>,
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
  return {
    registration: access
      ? withAccess
      : workshopRegistrationWindow(times, { now, earlyAccess: false }),
    access,
  }
}
