/**
 * Email normalization helpers shared by the speaker identity code paths.
 *
 * All email comparisons and the `knownEmails` match-set MUST use the normalized
 * form so that account matching is case/whitespace-insensitive.
 */

/** Normalize an email for comparison and storage: trimmed + lowercased. */
export function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase()
}

/**
 * Build a deduplicated, normalized list of emails, dropping empty values.
 * Preserves first-seen order.
 */
export function uniqueEmails(emails: (string | null | undefined)[]): string[] {
  const set = new Set<string>()
  for (const email of emails) {
    const normalized = normalizeEmail(email)
    if (normalized) {
      set.add(normalized)
    }
  }
  return [...set]
}
