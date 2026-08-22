/**
 * Shape a test fixture the way the CONFERENCE QUERY actually returns it.
 *
 * The conference read no longer composes its GROQ from the caller's flags — it
 * runs one of two fixed queries and parks the dereferenced sections under
 * `__expanded`, from which `selectConferenceSections` hands each caller the
 * shape its flags used to fetch directly (see `src/lib/conference/sections.ts`).
 *
 * A test that mocks `clientReadCached.fetch` is standing in for GROQ, so it has
 * to return GROQ's shape. A fixture that puts `topics` or `schedules` at the top
 * level is describing the OLD projection: the page asks for `{ topics: true }`,
 * the selector looks under `__expanded`, finds nothing, and the page renders as
 * though the conference had no topics at all. That failure is silent — an empty
 * list, not an error — which is exactly why this helper exists rather than a
 * lenient fallback in the selector.
 *
 * Pass the conference document plus whichever sections the test wants
 * dereferenced; everything else is left exactly as given.
 */

import { EXPANDED_SECTIONS_KEY } from '@/lib/conference/sections'
import type { ExpandedConferenceSections } from '@/lib/conference/sections'

/**
 * The section KEYS are checked (a typo silently expands nothing, which is the
 * bug this helper exists to prevent); the VALUES are not, because a fixture is
 * deliberately a partial document — `/info` cares about two timestamps, not
 * about a `Topic` having a `color` and a `slug`.
 */
type ExpandedFixtureSections = Partial<
  Record<keyof ExpandedConferenceSections, unknown>
>

export function conferenceReadFixture<T extends Record<string, unknown>>(
  document: T,
  expanded: ExpandedFixtureSections = {},
): T & Record<string, unknown> {
  return {
    ...document,
    [EXPANDED_SECTIONS_KEY]: expanded,
  }
}
