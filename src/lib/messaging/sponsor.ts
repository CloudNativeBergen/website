import 'server-only'
import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import type { Conference } from '@/lib/conference/types'

/**
 * Server-only token-authorization + context resolution for the sponsor↔organizer
 * messaging portal (messaging G2b).
 *
 * The sponsor side of a thread is reached ONLY through the per-sponsor portal
 * token (the `sponsorForConference.registrationToken`), never a speaker/organizer
 * session — so this is the sole authorization gate for the public
 * `sponsorMessages` procedures. It mirrors `validateRegistrationToken`
 * (per-request GROQ on `registrationToken`) and returns the thread context every
 * portal procedure needs: the sponsorForConference id (thread selector), its
 * conference, the sponsor company name (thread subject), and the contact-person
 * NAMES that gate the author-name picker. NO conversation id ever comes from the
 * client — the token IS the thread selector (one-thread UI).
 */

/** The minimal context a portal read/send needs after a token validates. */
export interface SponsorThreadContext {
  sfcId: string
  conferenceId: string
  sponsorName: string
  /** Contact persons with BOTH a name and an email (the author-picker options). */
  contactPersons: { name: string; email: string }[]
}

/**
 * Validate a portal token and resolve its thread context, or `null` when the
 * token matches no sponsor (the caller maps null → NOT_FOUND with no
 * enumeration oracle — an absent and an invalid token are indistinguishable).
 */
export async function validateSponsorMessagingToken(
  token: string,
): Promise<SponsorThreadContext | null> {
  if (!token) return null
  const row = await clientReadUncached.fetch<{
    sfcId: string | null
    conferenceId: string | null
    sponsorName: string | null
    contactPersons: { name: string | null; email: string | null }[] | null
  } | null>(
    // NB: the GROQ param is `$registrationToken`, NOT `$token` — the typed client
    // treats a `token` param name specially and rejects the call (mirrors
    // `validateRegistrationToken`).
    groq`*[_type == "sponsorForConference" && registrationToken == $registrationToken][0]{
      "sfcId": _id,
      "conferenceId": conference._ref,
      "sponsorName": sponsor->name,
      "contactPersons": coalesce(contactPersons[]{ name, email }, [])
    }`,
    { registrationToken: token },
    { cache: 'no-store' },
  )
  if (!row?.sfcId || !row.conferenceId) return null
  const contactPersons = (row.contactPersons ?? [])
    .filter(
      (c): c is { name: string; email: string } =>
        Boolean(c.name?.trim()) && Boolean(c.email?.trim()),
    )
    .map((c) => ({ name: c.name.trim(), email: c.email.trim() }))
  return {
    sfcId: row.sfcId,
    conferenceId: row.conferenceId,
    sponsorName: row.sponsorName?.trim() || 'Sponsor',
    contactPersons,
  }
}

/**
 * The context the sponsor-message FAN-OUT needs (both directions): the sponsor
 * name, the portal token (to build the sponsor deep link), every contact
 * person's email (organizer→sponsor emails), and the full conference (Slack
 * sales channel, `sponsorEmail` from-address, domains for absolute links).
 * Resolved through the sfc so it works from the public portal context without a
 * domain round-trip.
 */
export interface SponsorFanoutContext {
  sfcId: string
  sponsorName: string
  registrationToken: string | null
  contactPersons: { name: string; email: string }[]
  conference: Conference | null
}

export async function getSponsorFanoutContext(
  sfcId: string,
): Promise<SponsorFanoutContext | null> {
  const row = await clientReadUncached.fetch<{
    sponsorName: string | null
    registrationToken: string | null
    contactPersons: { name: string | null; email: string | null }[] | null
    conference: Conference | null
  } | null>(
    groq`*[_type == "sponsorForConference" && _id == $sfcId][0]{
      "sponsorName": sponsor->name,
      registrationToken,
      "contactPersons": coalesce(contactPersons[]{ name, email }, []),
      "conference": conference->{ ... }
    }`,
    { sfcId },
    { cache: 'no-store' },
  )
  if (!row) return null
  const contactPersons = (row.contactPersons ?? [])
    .filter(
      (c): c is { name: string; email: string } =>
        Boolean(c.name?.trim()) && Boolean(c.email?.trim()),
    )
    .map((c) => ({ name: c.name.trim(), email: c.email.trim() }))
  return {
    sfcId,
    sponsorName: row.sponsorName?.trim() || 'Sponsor',
    registrationToken: row.registrationToken,
    contactPersons,
    conference: row.conference,
  }
}
