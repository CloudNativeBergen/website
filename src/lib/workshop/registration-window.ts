/**
 * THE ONE WINDOW RULE for workshop sign-up (#1345, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §2 and §3). `workshop.signup`,
 * the portal page and the portal's list all ask this function, so the three
 * cannot disagree about whether a person can sign up.
 *
 * DEPENDENCY-FREE on purpose: the portal's list is a client component, and the
 * Studio (built by Vite, which does not resolve `@/`) imports the save rule
 * below for the `conference` schema's validation.
 */

/** The three registration times of a conference, as stored (ISO instants). */
export interface WorkshopRegistrationTimes {
  /** The sponsor start time: when sign-up opens for a caller with early access. */
  workshopRegistrationSponsorStart?: string | null
  /** The official opening: when sign-up opens for everyone. */
  workshopRegistrationStart?: string | null
  /** When sign-up closes, for everyone. */
  workshopRegistrationEnd?: string | null
}

export type WorkshopRegistrationWindow =
  | {
      status: 'not-open-yet'
      /** When sign-up opens FOR THIS CALLER, as stored. */
      opensAt: string
      /** `opensAt` is the sponsor start time, not the official opening. */
      early: boolean
    }
  | {
      status: 'open'
      /**
       * Open for this caller ONLY because of early access: now is inside the
       * early-access window. A sign-up made on this answer is an early sign-up.
       */
      early: boolean
    }
  | {
      status: 'closed'
      /** When sign-up closed, as stored. */
      closedAt: string
    }

/** A stored time as an instant, or null when it is unset or unreadable. */
function instant(value: string | null | undefined): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

/**
 * When the early-access window (spec §2) starts, or null when there is none:
 * it exists only when both times are set and the sponsor start time is the
 * earlier one.
 */
function earlyAccessStart(times: WorkshopRegistrationTimes): number | null {
  const sponsorStart = instant(times.workshopRegistrationSponsorStart)
  const start = instant(times.workshopRegistrationStart)
  return sponsorStart !== null && start !== null && sponsorStart < start
    ? sponsorStart
    : null
}

/**
 * THE SAVE RULE (spec §3): why these times cannot be stored together, or null
 * when they can. A sponsor start time needs an official opening, and must be
 * earlier than it. `workshop.admin.updateRegistrationTimes` refuses with this
 * and the `conference` schema validates with it, so a time edited in Sanity
 * Studio is checked by the same rule.
 *
 * It is the early-access window turned around: a sponsor start time that is
 * set must make one.
 */
export function sponsorStartTimeProblem(
  times: Pick<
    WorkshopRegistrationTimes,
    'workshopRegistrationSponsorStart' | 'workshopRegistrationStart'
  >,
): string | null {
  if (!times.workshopRegistrationSponsorStart) return null
  if (earlyAccessStart(times) !== null) return null
  return instant(times.workshopRegistrationStart) === null
    ? 'Sponsor early access needs a time when registration opens for everyone'
    : 'Sponsor early access must start before registration opens for everyone'
}

/**
 * Whether sign-up is open for a caller, at `now` (the table in spec §3).
 *
 * An unset start is open from the beginning and an unset end never closes.
 * Both bounds are inclusive: sign-up is open at the instant of the opening and
 * at the instant of the end.
 *
 * AN END THAT HAS PASSED IS CLOSED, whatever the start or early access: the
 * table's "After the end" row has no exception. (An end before a start still
 * ahead is refused by the admin save, and Sanity Studio can store it.)
 *
 * `earlyAccess` moves the opening to the sponsor start time and does nothing
 * else. With no early-access window it changes nothing at all.
 */
export function workshopRegistrationWindow(
  times: WorkshopRegistrationTimes,
  { now, earlyAccess }: { now: Date; earlyAccess: boolean },
): WorkshopRegistrationWindow {
  const at = now.getTime()
  const start = instant(times.workshopRegistrationStart)
  const end = instant(times.workshopRegistrationEnd)

  if (end !== null && end < at) {
    return { status: 'closed', closedAt: times.workshopRegistrationEnd! }
  }
  if (start === null || start <= at) return { status: 'open', early: false }

  // The official opening is still ahead.
  const earlyStart = earlyAccess ? earlyAccessStart(times) : null
  if (earlyStart === null) {
    return {
      status: 'not-open-yet',
      opensAt: times.workshopRegistrationStart!,
      early: false,
    }
  }
  if (earlyStart > at) {
    return {
      status: 'not-open-yet',
      opensAt: times.workshopRegistrationSponsorStart!,
      early: true,
    }
  }
  return { status: 'open', early: true }
}
