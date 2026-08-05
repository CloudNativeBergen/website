/**
 * How a speaker's LOGIN IDENTITY is described to an organizer.
 *
 * WHY THIS IS NOT COSMETIC. Duplicate documents are the same person, so the name
 * is identical and the two emails are often both plausible personal addresses.
 * "Ganesh Vasudevan — ganesh.vasudev@gmail.com" next to "Ganesh Vasudevan —
 * ganesh.vasudevan@ericsson.com" asks an operator to tell two accounts apart by
 * squinting at an address. The PROVIDER is the fact that actually separates
 * them: one is LinkedIn, the other is GitHub. So every surface that lists
 * speakers for a merge — the picker dropdowns and the duplicate-candidate rows —
 * renders the provider, and renders it the same way, from here.
 *
 * The account id is deliberately dropped. `providers[]` entries are shaped
 * `<provider>:<providerAccountId>` (see `providerAccount`); the id half is an
 * opaque string of no use to a human and pure noise in a picker.
 */

/** Known provider ids → the name a human recognises. */
const PROVIDER_NAMES: Record<string, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  'email-link': 'Email link',
}

/**
 * What to show when `providers[]` is EMPTY — a meaningful state, not missing
 * data. A speaker with no provider has never signed in: the document was
 * created by an organizer (`speaker.admin.create`) as a placeholder for someone
 * who has not claimed it yet. That matters in a merge picker, because folding a
 * never-claimed placeholder into a real account is a different, safer operation
 * than folding two real accounts together.
 */
export const NEVER_SIGNED_IN_LABEL = 'never signed in'

/** `github:23187057` → `GitHub`. Unknown providers keep their raw prefix. */
export function providerDisplayName(entry: string): string {
  const prefix = (entry ?? '').trim().toLowerCase().split(':')[0]
  return PROVIDER_NAMES[prefix] ?? prefix
}

/**
 * The provider names for a speaker document, deduplicated and in document
 * order. EMPTY when the person has never signed in — callers must render
 * {@link NEVER_SIGNED_IN_LABEL} for that case rather than a blank.
 */
export function providerDisplayNames(
  providers?: (string | null | undefined)[] | null,
): string[] {
  const names = (providers ?? [])
    .filter((entry): entry is string => Boolean(entry && entry.trim()))
    .map(providerDisplayName)
    .filter((name) => name.length > 0)
  return Array.from(new Set(names))
}

/**
 * One-line identity summary for a speaker row: the providers, or the
 * never-signed-in label. Used verbatim in the merge picker's option labels,
 * where markup is impossible.
 */
export function providerSummary(
  providers?: (string | null | undefined)[] | null,
): string {
  const names = providerDisplayNames(providers)
  return names.length > 0 ? names.join(' + ') : NEVER_SIGNED_IN_LABEL
}
