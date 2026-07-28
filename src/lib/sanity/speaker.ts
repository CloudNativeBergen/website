import { groq } from 'next-sanity'
import { clientReadCached } from '@/lib/sanity/client'
import { normalizeEmail } from '@/lib/speaker/email'
import type { Speaker } from '@/lib/speaker/types'

/**
 * Resolve a speaker from a session email.
 *
 * IDENTITY MATCHING (#684): the comparison is normalization-insensitive on BOTH
 * sides — the argument is run through {@link normalizeEmail} (NFKC + trim +
 * lowercase) and the stored value is folded with GROQ `lower()`. A raw `==`
 * here missed `Hans@Example.com` against a stored `hans@example.com`, which is
 * how the same human ends up with two speaker documents.
 *
 * `knownEmails` (the verified match-set maintained by the login path) is
 * searched alongside the display `email`, mirroring `findSpeakersByEmails` in
 * `@/lib/speaker/sanity`, so a speaker who changed their display address still
 * resolves from their provider's primary. Legacy rows are never mutated —
 * folding happens at query time, so no backfill is required.
 *
 * Ordered oldest-first before taking `[0]`: where PRE-EXISTING duplicate
 * accounts share an address, the caller must resolve to the same document on
 * every request rather than whichever one the dataset happened to return first.
 */
export async function getSpeakerByEmail(
  email: string,
): Promise<Speaker | null> {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  try {
    // Identity resolution is a GLOBAL person lookup: the signed-in human must
    // resolve to their one speaker document regardless of which tenant they
    // first belonged to (#615). Org-scoped authorization is applied by the
    // caller from the projected `organizerOrgIds`.
    // groq-global: cross-tenant identity join (#615).
    const query = groq`*[_type == "speaker" && (lower(email) == $email || count((knownEmails[])[lower(@) == $email]) > 0)] | order(_createdAt asc) [0] {
        _id,
        name,
        email,
        "isOrganizer": _id in *[_type == "conference"].organizers[]._ref,
        "organizerOrgIds": *[_type == "conference" && ^._id in organizers[]._ref && defined(organization._ref)].organization._ref,
        "image": coalesce(image.asset->url, imageURL),
        "slug": slug.current
      }
    `

    const speaker = await clientReadCached.fetch(query, { email: normalized })
    return speaker || null
  } catch (error) {
    console.error('Error fetching speaker by email:', error)
    return null
  }
}
