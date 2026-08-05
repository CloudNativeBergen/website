import type { Conference } from './types'

/**
 * The conference fields the `Conference` TYPE declares as required arrays but
 * that a real `conference` DOCUMENT is routinely missing.
 *
 * The main conference projection is a bare `...` spread, so an absent field
 * comes back as `undefined` rather than `[]` — and
 * `@/lib/onboarding/create.ts` deliberately provisions a brand-new tenant with
 * NO `formats`, NO `topics` and (when the operator supplies none) no
 * `domains`. The type says `Format[]`, the data says `undefined`, and the
 * first `.filter` / `.map` / `.includes` on a public page is a TypeError — a
 * bare 500 on the first CFP link a new organizer shares (there is no
 * `error.tsx` boundary in this app).
 *
 * KEEP THIS LIST HONEST: only fields the type declares NON-optional belong
 * here. A field typed `foo?: T[]` is already telling every caller to check.
 */
const REQUIRED_ARRAY_FIELDS = [
  'formats',
  'topics',
  'domains',
  'organizers',
] as const satisfies readonly (keyof Conference)[]

/**
 * Make a resolved conference match the shape its type promises.
 *
 * Applied ONCE at the data boundary (`getConferenceForDomain`) rather than as
 * a `?? []` at every read: there are dozens of reads across public pages,
 * admin surfaces, components and stories, and every one of them is a place a
 * future change can forget the guard. Normalising where the document enters
 * the app makes the non-optional array types TRUE for every consumer instead
 * of merely usually-true.
 *
 * Mutates in place (and returns the same object) — the caller already mutates
 * the fetched document to attach sponsors and gallery images, and Next's
 * `'use cache'` hands back a freshly deserialized object per call.
 */
export function normalizeConference<T extends Conference>(conference: T): T {
  if (!conference) return conference
  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(conference[field])) {
      // The cast is confined to this loop: the key is proven to be a
      // `Conference` key above, and `[]` is assignable to every field in the
      // list — TypeScript just cannot narrow a union-keyed write.
      ;(conference as Record<string, unknown>)[field] = []
    }
  }
  return conference
}
