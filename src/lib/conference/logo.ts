import type { Conference } from './types'

/**
 * SERVER→CLIENT PICKS for the two `'use client'` components every public page
 * mounts (`ConferenceLogo`, `Header`).
 *
 * Their prop types are narrow, but structural typing happily accepts a whole
 * `Conference` — and every prop handed to a client component is serialized
 * verbatim into the RSC flight payload, readable by anyone viewing source.
 * The conference document carries fields that must not ship to anonymous
 * visitors (`agentConfig`, `checkinCustomerId`, team Slack channels, …), so
 * public server components must pass these picks, never the whole object.
 * Pinned by __tests__/lib/conference/public-conference-pii.test.ts.
 */

/** Exactly the fields {@link ConferenceLogo} renders. */
export type ConferenceLogoData = Partial<
  Pick<
    Conference,
    'title' | 'logoBright' | 'logoDark' | 'logomarkBright' | 'logomarkDark'
  >
>

export function pickConferenceLogoProps(
  conference: ConferenceLogoData | null | undefined,
): ConferenceLogoData | null {
  if (!conference) return null
  const { title, logoBright, logoDark, logomarkBright, logomarkDark } =
    conference
  return { title, logoBright, logoDark, logomarkBright, logomarkDark }
}

/** Exactly the fields the public {@link Header} renders. */
export type HeaderConference = Pick<
  Conference,
  | 'title'
  | 'logoBright'
  | 'logoDark'
  | 'logomarkBright'
  | 'logomarkDark'
  | 'domains'
  | 'startDate'
  | 'endDate'
  | 'city'
  | 'country'
  | 'registrationEnabled'
  | 'registrationLink'
>

export function pickHeaderConference(conference: Conference): HeaderConference {
  const {
    title,
    logoBright,
    logoDark,
    logomarkBright,
    logomarkDark,
    domains,
    startDate,
    endDate,
    city,
    country,
    registrationEnabled,
    registrationLink,
  } = conference
  return {
    title,
    logoBright,
    logoDark,
    logomarkBright,
    logomarkDark,
    domains,
    startDate,
    endDate,
    city,
    country,
    registrationEnabled,
    registrationLink,
  }
}
