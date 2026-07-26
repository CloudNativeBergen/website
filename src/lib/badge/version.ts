/**
 * Badge generator format version.
 *
 * This is a CLIENT-SAFE module (no server-only / crypto imports) so both the
 * admin UI and the server can read the constant and the outdated predicate.
 *
 * BUMP RULE
 * ---------
 * Increment {@link BADGE_GENERATOR_VERSION} whenever the credential format
 * changes such that badges ALREADY BAKED with an older generator become STALE —
 * i.e. a fresh re-issue would produce a materially different (more correct)
 * credential/proof/SVG. A bump makes every doc stamped with a lower
 * `generatorVersion` (and every doc with the field ABSENT, treated as v1) render
 * as "Outdated format" in the admin badge list and countable by the
 * `badges.outdated` system-status check, and eligible for in-place `rebake`.
 *
 * Do NOT bump for changes that leave existing baked artifacts valid (e.g. a
 * copy tweak in a NEW issuance, a refactor with identical output). The version
 * is a re-bake trigger, not a build number.
 *
 * VERSION HISTORY
 * ---------------
 *   v1 — pre-#655 format. The embedded Data Integrity Proof's
 *        `verificationMethod` was the issuer-profile FRAGMENT
 *        (`…/api/badge/issuer#key-…`), which the 1EdTech EmbeddedProofProbe
 *        cannot dereference, and the credential carried NO
 *        `credentialSubject.identifier[]` block, so displayers such as Credly
 *        could not match a badge to a signed-in user. Stored docs from this era
 *        have no `generatorVersion` field ⇒ treated as v1.
 *   v2 — #655. The embedded proof `verificationMethod` is now the
 *        dereferenceable keys URL (`…/api/badge/keys/key-ed25519`) returning a
 *        bare Multikey document, and the credential includes a
 *        `credentialSubject.identifier[]` IdentityObject (email, unhashed) for
 *        displayer ownership matching on import.
 */
export const BADGE_GENERATOR_VERSION = 2

/**
 * The effective generator version of a stored badge. Docs baked before the
 * field existed have no `generatorVersion` ⇒ they are the original (v1) format.
 */
export function badgeGeneratorVersion(stored?: number | null): number {
  return stored ?? 1
}

/**
 * True when a stored badge was baked by an OLDER generator than the current one
 * and should be re-baked. Absent version ⇒ v1 ⇒ outdated whenever the current
 * version is > 1.
 */
export function isBadgeOutdated(stored?: number | null): boolean {
  return badgeGeneratorVersion(stored) < BADGE_GENERATOR_VERSION
}
