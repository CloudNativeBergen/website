/**
 * THE SECRET ENV-VAR SLUG VOCABULARY (RunKonf/platform#57).
 *
 * One organization field, `organization.secretEnvSlug`, names the discrete
 * per-tenant environment variables that carry that tenant's credentials:
 *
 *   TENANT_<SECRET_ENV_SLUG>_<FAMILY>_<FIELD>   e.g. TENANT_CNDN_EMAIL_API_KEY
 *
 * This module is the ONE definition of what a legal value looks like, shared by
 * the two places that must agree about it:
 *
 *   - `sanity/schemaTypes/organization.ts` — validates what an operator types.
 *   - `src/lib/secrets/env-per-org.ts` — splices it into an env var name at
 *     resolution time and REFUSES a value that does not match, rather than
 *     building a name nothing can set.
 *
 * WHY IT LIVES UNDER `sanity/`. The dependency direction in this repo is
 * src → sanity (see `src/lib/travel-support/types.ts`, which imports
 * `sanity/schemaTypes/constants`), never the reverse: the Studio bundle must
 * not pull a `server-only` module into a browser build. This file is pure — no
 * imports, no Sanity client, no Node — so both sides can hold it.
 *
 * IT IS NOT THE ORGANIZATION'S `slug`. That field is customer-editable, is live
 * routing input, and was the subject of a production lockout (see the field's
 * own comment in the schema). This value is opaque, operator-assigned, and
 * exists for no purpose except naming environment variables.
 */

/**
 * Uppercase alphanumeric, no separators. Anything else either produces a name
 * no shell or Vercel UI can round-trip (lowercase, `-`, `.`) or makes
 * `TENANT_<SLUG>_<FAMILY>_<FIELD>` ambiguous to parse back (an embedded `_`,
 * which is the segment separator).
 */
export const SECRET_ENV_SLUG_PATTERN = /^[A-Z0-9]+$/

/**
 * A generous ceiling. Nothing breaks at 25 characters; a bound exists so a
 * pasted paragraph cannot become a 4KB environment variable name that the
 * platform silently truncates somewhere out of sight.
 */
export const SECRET_ENV_SLUG_MAX_LENGTH = 24

/**
 * The reason `value` is not a usable slug, or `null` when it is one.
 *
 * Returns a MESSAGE rather than a boolean because both callers need to say why:
 * the Studio renders it under the field, and the resolver logs it before
 * refusing to resolve any credential at all.
 *
 * An ABSENT value is NOT this function's business — "no slug" is a legitimate
 * state (the tenant has no discrete vars) and is handled by the caller. Pass
 * only a value you have already decided is present.
 */
export function secretEnvSlugProblem(value: unknown): string | null {
  if (typeof value !== 'string') {
    return 'must be a string'
  }
  if (value !== value.trim()) {
    return 'must not have leading or trailing whitespace'
  }
  if (value.length === 0) {
    return 'must not be empty'
  }
  if (value.length > SECRET_ENV_SLUG_MAX_LENGTH) {
    return `must be at most ${SECRET_ENV_SLUG_MAX_LENGTH} characters`
  }
  if (!SECRET_ENV_SLUG_PATTERN.test(value)) {
    return 'must be UPPERCASE letters and digits only (no spaces, dashes or underscores) — it is spliced into a TENANT_<SLUG>_<FAMILY>_<FIELD> environment variable name'
  }
  return null
}

/** Whether `value` is a usable secret env slug. */
export function isSecretEnvSlug(value: unknown): value is string {
  return secretEnvSlugProblem(value) === null
}
