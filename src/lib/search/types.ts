import type { Format, Status } from '@/lib/proposal/types'

export type SearchCategory = 'proposals' | 'speakers' | 'sponsors'

/**
 * THE COST CONTRACT OF THE ⌘K PALETTE.
 *
 * Every keystroke burst used to cost THREE tRPC procedures — `proposal.admin.search`,
 * `sponsor.list`, `speaker.admin.search` — each of which independently re-ran the
 * authorization waist (a conference read) and then its own uncached GROQ; the
 * speaker one alone issued three Sanity reads. One organizer typing `kubernetes`
 * therefore billed Sanity repeatedly, per debounce tick.
 *
 * Both numbers below are load-bearing, not taste:
 *
 *  - {@link MIN_SEARCH_QUERY_LENGTH} — a one-character search matches most of the
 *    dataset, so it is simultaneously the most expensive query to run and the
 *    least useful answer to read. It is enforced in THREE places that each fail
 *    independently: the palette (does not schedule), the hook (does not call) and
 *    the `search.unified` Zod input (rejects). The server one is the real gate —
 *    a future client cannot lower the floor by editing the palette.
 *  - {@link SEARCH_DEBOUNCE_MS} — the window a keystroke burst collapses into.
 *
 * The reads themselves are collapsed into ONE round-trip; see
 * `src/lib/search/sanity.ts`.
 */
export const MIN_SEARCH_QUERY_LENGTH = 2

/** @see MIN_SEARCH_QUERY_LENGTH */
export const SEARCH_DEBOUNCE_MS = 400

/**
 * A proposal row as the unified search projects it — NOT a `ProposalExisting`.
 *
 * The palette renders a title, the speaker names and a status label, so the
 * unified query projects exactly those. The old path spread the WHOLE talk
 * document plus every review, every co-speaker invitation and every previously
 * accepted talk per speaker, for a list the organizer reads three lines of.
 */
export interface ProposalSearchHit {
  _id: string
  title: string
  status: Status
  format: Format
  /**
   * Dereferenced speaker rows. Kept as a loose union because a talk in the
   * dataset can carry a dangling speaker reference, which GROQ dereferences to
   * `null` — the provider filters those out rather than rendering `undefined`.
   */
  speakers?: ({ _id?: string; name?: string } | string | null)[]
}

/** A sponsor row as the unified search projects it. */
export interface SponsorSearchHit {
  _id: string
  name: string
  website?: string
}

/** A speaker row as the unified search projects it. */
export interface SpeakerSearchHit {
  _id: string
  name: string
  title?: string
  email?: string
}

/**
 * The single payload `search.unified` returns: the three sources the palette
 * groups by, resolved in ONE Sanity round-trip behind ONE authorization check.
 */
export interface UnifiedSearchPayload {
  proposals: ProposalSearchHit[]
  sponsors: SponsorSearchHit[]
  speakers: SpeakerSearchHit[]
}

export interface SearchResultItem {
  id: string
  title: string
  subtitle?: string
  description?: string
  category: SearchCategory
  url: string
  metadata?: Record<string, unknown>
  icon?: React.ComponentType<{ className?: string }>
}

export interface SearchResultGroup {
  category: SearchCategory
  label: string
  items: SearchResultItem[]
  totalCount?: number
}

export interface SearchResults {
  groups: SearchResultGroup[]
  totalCount: number
}

export interface SearchProviderResult {
  category: SearchCategory
  label: string
  items: SearchResultItem[]
  totalCount?: number
  priority: number
  error?: string
}

export interface SearchProvider {
  readonly category: SearchCategory
  readonly label: string
  readonly priority: number
  search(query: string): Promise<SearchProviderResult>
}
