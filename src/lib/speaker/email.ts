/**
 * Email normalization helpers shared by the speaker identity code paths.
 *
 * All email comparisons and the `knownEmails` match-set MUST use the normalized
 * form so that account matching is case/whitespace-insensitive (#684).
 *
 * WHY THIS EXISTS: OAuth providers do not agree on the casing they hand back for
 * the same mailbox. GitHub returning `Hans@Example.com` and LinkedIn returning
 * `hans@example.com` must resolve to ONE speaker; under raw `===` / GROQ `==`
 * they miss each other and a *second* speaker document is created for the same
 * person. The local-part is technically case-sensitive per RFC 5321, but every
 * mailbox provider in practice treats it case-insensitively, so case-folding is
 * the correct behaviour for identity matching.
 */

/**
 * Normalize an email for comparison and storage: NFKC + trimmed + lowercased.
 *
 * Order matters:
 *  1. `NFKC` first — compatibility-folds fullwidth / ligature / compatibility
 *     codepoints (including compatibility spaces) to their canonical form, so
 *     visually identical addresses share one representation. This is the same
 *     normalization the ecosystem adopted after the unnormalized-identity CVE
 *     class (Logto CVE-2026-15611 / -15617, the next-auth beta.32 fix).
 *  2. `trim` second — so compatibility spaces folded by NFKC are stripped too.
 *  3. `toLowerCase` last — locale-independent Unicode default case mapping.
 *
 * NFKC folding only ever *widens* what matches. That is safe here because the
 * identity path matches exclusively on provider-VERIFIED emails (see
 * `computeVerifiedEmails` in `./sanity`): exploiting the widening would require
 * a provider to verify a non-ASCII mailbox that NFKC-folds onto a victim's
 * address, and the supported providers (GitHub, LinkedIn) only ever assert
 * ASCII-representable addresses.
 */
export function normalizeEmail(email?: string | null): string {
  return (email ?? '').normalize('NFKC').trim().toLowerCase()
}

/**
 * Canonical form for an address that will be STORED and later DELIVERED to:
 * trim + lowercase, deliberately WITHOUT NFKC.
 *
 * Lowercasing is safe to deliver to — domains are case-insensitive by RFC 1035
 * and no mailbox provider distinguishes local-part case (that premise is the
 * whole point of this module). NFKC is NOT: compatibility folding rewrites the
 * bytes of the local part (`oﬀice@ex.com` -> `office@ex.com`), and nothing
 * guarantees the folded address reaches the same mailbox. Applying it to a
 * stored recipient could route a co-speaker invitation — which carries a bearer
 * token — to a different person.
 *
 * So the two forms have different jobs, and mixing them up is the bug:
 *  - {@link normalizeEmail} — MATCH key. Never deliver to it. Also the form
 *    stored in `knownEmails`, which is a pure match-set and never a recipient.
 *  - {@link canonicalEmail} — STORED recipient (`speaker.email`,
 *    `coSpeakerInvitation.invitedEmail`). Safe to send mail to.
 *
 * Matching still works across the two because every comparison runs both sides
 * through `normalizeEmail`, and NFKC is a no-op for the ASCII addresses real
 * providers issue.
 */
export function canonicalEmail(email?: string | null): string {
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
