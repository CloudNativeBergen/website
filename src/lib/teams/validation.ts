/**
 * Pure validation helpers for organizer team keys, shared between the Sanity
 * schema custom rule (Studio-side) and unit tests. Kept free of any Sanity or
 * server import so both sides can use them.
 */

/** Lowercase kebab-case: letters/numbers in segments joined by single hyphens. */
export const TEAM_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** True when `value` is a non-empty lowercase kebab-case string. */
export function isValidTeamKey(value: unknown): value is string {
  return typeof value === 'string' && TEAM_KEY_PATTERN.test(value)
}

/**
 * How many entries in `teams` carry `key`. Used to enforce key-uniqueness
 * within a conference’s teams array (a value counted more than once is a
 * duplicate). Cross-field uniqueness has no built-in Sanity rule, so this is
 * evaluated against the sibling list in the custom validator.
 */
export function countTeamKey(
  teams: Array<{ key?: string }> | undefined,
  key: string,
): number {
  if (!Array.isArray(teams)) return 0
  return teams.filter((team) => team?.key === key).length
}
