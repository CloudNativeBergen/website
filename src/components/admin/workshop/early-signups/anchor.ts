/**
 * Where the "Early sign-ups" list lives on `/admin/workshops` (#1348), and
 * how a link narrows it to one sponsor. In a module of its own, without
 * `'use client'`, so server components can read the values.
 */
export const EARLY_SIGNUPS_ANCHOR = 'early-sign-ups'

/** The query parameter that narrows the list: a `sponsorForConference` id. */
export const EARLY_SPONSOR_PARAM = 'earlySponsor'

/** The list, narrowed to the early sign-ups made through one sponsor's links. */
export const earlySignupsHref = (sponsorForConferenceId: string) =>
  `/admin/workshops?${EARLY_SPONSOR_PARAM}=${encodeURIComponent(sponsorForConferenceId)}#${EARLY_SIGNUPS_ANCHOR}`
