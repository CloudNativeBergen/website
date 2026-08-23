import 'server-only'
import { groq } from 'next-sanity'
import { clientReadCached } from '@/lib/sanity/client'
import { Status } from '@/lib/proposal/types'
import type {
  ProposalSearchHit,
  SpeakerSearchHit,
  SponsorSearchHit,
  UnifiedSearchPayload,
} from './types'

/**
 * THE ⌘K PALETTE'S ONE READ.
 *
 * The palette searches three sources. It used to do that with three tRPC
 * procedures — `proposal.admin.search`, `sponsor.list`, `speaker.admin.search` —
 * fired in parallel from the browser on every debounce tick. Each re-resolved
 * the domain conference for the authorization waist and then ran its own GROQ;
 * `speaker.admin.search` alone issued three (speakers, organizers, featured
 * speakers, the last of which the palette discards because it always passes
 * `includeFeatured: true`). Five Sanity reads and three authorization
 * resolutions, repeated while an organizer types.
 *
 * This is the same work as ONE query. The object-projection shape is the
 * in-repo pattern from `getConversationViewCounts` (`src/lib/messaging/sanity.ts`),
 * which computes seven counts in a single read: a top-level `{ "a": *[…], "b":
 * *[…] }` object whose fields are independent root filters, evaluated together
 * and billed once.
 *
 * TENANT SCOPE IS PER-SOURCE, AND STAYS THAT WAY. The three sources do not share
 * a scope, so this does NOT collapse them into one predicate:
 *
 *  - proposals — CONFERENCE-scoped (`conference._ref == $conferenceId`), non-draft,
 *    exactly as `proposal.admin.search`.
 *  - sponsors — ORG-scoped (`organization._ref == $orgId`), exactly as
 *    `sponsor.list` → `searchSponsors`.
 *  - speakers — the union `sponsor.list`'s sibling `speaker.admin.search` builds:
 *    speakers with a confirmed/accepted talk AT THIS CONFERENCE and belonging to
 *    this org, PLUS this org's organizers. Every disjunct carries `$orgId`.
 *
 * Both keys are explicit GROQ PARAMETERS resolved server-side from the request
 * domain — never session-derived, never client input. That is also what makes
 * the API-CDN safe here: a CDN entry is keyed by the request URL, so the tenant
 * has to travel IN the URL as a parameter to discriminate one tenant's entry
 * from another's.
 *
 * AUTHORIZATION IS NOT WEAKENED, and this function does not perform it. All
 * three source procedures were `adminProcedure` — one and the same org-scoped
 * organizer waist — so there were never three distinct permissions to collapse.
 * The caller (`search.unified`) inherits that waist and passes the org id the
 * waist itself resolved; see the router for the fail-closed argument.
 */

/**
 * The talk statuses a speaker must have at THIS conference to be part of the
 * speaker corpus — the same pair `speaker.admin.search` passes to `getSpeakers`.
 */
const SPEAKER_TALK_STATUSES: Status[] = [Status.confirmed, Status.accepted]

/**
 * One query, three root-filter fields — the ⌘K palette's entire cost.
 *
 * ORDERING IS LOAD-BEARING: `"speakers"` is FIRST because the tenancy rule's
 * annotation below governs a literal's FIRST root only, and a nested root inside
 * a template literal cannot carry its own JS comment. `"proposals"` and
 * `"sponsors"` need no annotation — their `conference._ref` / `organization._ref`
 * predicates are exactly what the rule recognises, and each is judged on its own.
 *
 * Written with NO `${…}` interpolation inside any root filter: an interpolated
 * predicate is text that is not the text under review, which is why
 * `eslint-rules/no-unscoped-groq.js` reports that shape outright. Statuses travel
 * as `$speakerTalkStatuses` / `$draftStatus` parameters for the same reason.
 *
 * groq-global-scoped: the `speaker` type is the deliberate cross-tenant identity
 * type (#615) and carries no tenant key, so the scope is the DISJUNCTION in its
 * root filter, and EVERY disjunct binds `$orgId` — org membership, participation
 * in one of this org's conferences, or being one of this org's organizers. That
 * is the same predicate set as `SPEAKER_ORG_FILTER` + `getOrganizers` in
 * `src/lib/speaker/sanity.ts`, which this replaces for the palette, and
 * `src/lib/search/sanity.groq.test.ts` evaluates it against a two-tenant fixture
 * rather than trusting this comment.
 *
 * ONE HOLE, NAMED. The `SPEAKER_ORG_FILTER` half of the first disjunct
 * (membership ∨ participation) is REDUNDANT while the conference predicate
 * beside it holds: a speaker with a talk at `$conferenceId` necessarily has a
 * talk at a conference owned by `$orgId`, so the org disjunct is implied. It is
 * kept for parity with `getSpeakers`, which applies both, but NO fixture can
 * distinguish its presence from its absence — deleting it leaves
 * `sanity.groq.test.ts` green. Do not read that green as evidence for this
 * clause; the control that actually excludes another tenant's speakers here is
 * `conference._ref == $conferenceId`, and that one IS sabotage-proven.
 */
const UNIFIED_SEARCH_QUERY = groq`{
  "speakers": *[
    _type == "speaker"
    && (
      (
        count(*[_type == "talk" && conference._ref == $conferenceId && references(^._id) && status in $speakerTalkStatuses]) > 0
        && (
          $orgId in coalesce(organizations, [])[]._ref
          || count(*[_type == "talk" && conference->organization._ref == $orgId && references(^._id)]) > 0
        )
      )
      || _id in *[_type == "conference" && organization._ref == $orgId].organizers[]._ref
    )
  ] | order(name asc) {
    _id,
    name,
    title,
    email,
    bio,
    "isOrganizer": count(*[_type == "conference" && organization._ref == $orgId && ^._id in organizers[]._ref]) > 0,
    "hasCurrentConferenceTalk": count(*[_type == "talk" && conference._ref == $conferenceId && references(^._id) && status in $speakerTalkStatuses]) > 0
  },

  "proposals": *[
    _type == "talk"
    && conference._ref == $conferenceId
    && status != $draftStatus
    && (
      pt::text(description) match $term
      || title match $term
      || outline match $term
      || language match $term
      || format match $term
      || level match $term
      || audiences[] match $term
      || speakers[]->name match $term
      || speakers[]->bio match $term
      || speakers[]->title match $term
      || topics[]->title match $term
      || topics[]->description match $term
    )
  ] | order(_updatedAt desc) {
    _id,
    title,
    status,
    format,
    speakers[]->{ _id, name }
  },

  "sponsors": *[
    _type == "sponsor"
    && organization._ref == $orgId
    && name match $namePrefix
  ] | order(name asc) {
    _id,
    name,
    website
  }
}`

/**
 * A speaker row as it comes back from the query, before matching and sorting.
 * `bio` and the two computed booleans exist ONLY server-side: `bio` is matched
 * against and then dropped (it is the largest field on the document and the
 * palette never renders it), and the booleans drive the sort.
 */
interface RawSpeakerRow extends SpeakerSearchHit {
  bio?: string
  isOrganizer?: boolean
  hasCurrentConferenceTalk?: boolean
}

interface RawUnifiedResult {
  proposals: ProposalSearchHit[] | null
  sponsors: SponsorSearchHit[] | null
  speakers: RawSpeakerRow[] | null
}

/**
 * SUBSTRING matching, deliberately, and deliberately in JS.
 *
 * `speaker.admin.search` filtered its corpus with `String.includes` on
 * name/title/bio. GROQ's `match` is token-based, so pushing this predicate into
 * the query would silently change which speakers a query finds (`ubernet` stops
 * matching `Kubernetes`). This is a read-count change, not a relevance change,
 * so the matching semantics are preserved exactly — the corpus is fetched by the
 * same tenant predicate and filtered by the same comparison.
 */
function matchesSpeaker(speaker: RawSpeakerRow, term: string): boolean {
  return (
    Boolean(speaker.name?.toLowerCase().includes(term)) ||
    Boolean(speaker.title?.toLowerCase().includes(term)) ||
    Boolean(speaker.bio?.toLowerCase().includes(term))
  )
}

/** Organizers first, then speakers on this edition, then by name — as before. */
function compareSpeakers(a: RawSpeakerRow, b: RawSpeakerRow): number {
  if (a.isOrganizer && !b.isOrganizer) return -1
  if (!a.isOrganizer && b.isOrganizer) return 1
  if (a.hasCurrentConferenceTalk && !b.hasCurrentConferenceTalk) return -1
  if (!a.hasCurrentConferenceTalk && b.hasCurrentConferenceTalk) return 1
  return a.name.localeCompare(b.name)
}

/**
 * Run the palette's three searches as one read.
 *
 * `conferenceId` and `orgId` are REQUIRED. `searchSponsors`/`getAllSponsors`
 * already refuse to run without an org — an unresolvable tenant must return
 * nothing, never every tenant's sponsors — and the speaker union has the same
 * property here, so there is no null-tenant branch to get wrong. The caller
 * cannot reach this with an unresolved org anyway: `adminProcedure` denies that
 * request before the handler runs.
 */
export async function searchUnified({
  query,
  conferenceId,
  orgId,
}: {
  query: string
  conferenceId: string
  orgId: string
}): Promise<UnifiedSearchPayload> {
  const trimmed = query.trim()
  if (!trimmed || !conferenceId || !orgId) {
    return { proposals: [], sponsors: [], speakers: [] }
  }

  const result = await clientReadCached.fetch<RawUnifiedResult | null>(
    UNIFIED_SEARCH_QUERY,
    {
      conferenceId,
      orgId,
      term: `*${trimmed}*`,
      namePrefix: `${trimmed}*`,
      draftStatus: Status.draft,
      speakerTalkStatuses: SPEAKER_TALK_STATUSES,
    },
    // Keep Next's data cache out of an admin search — the CDN host is what makes
    // this cheap, not a Next-side cache entry keyed by a query nobody repeats.
    { cache: 'no-store' },
  )

  const term = trimmed.toLowerCase()

  return {
    proposals: result?.proposals ?? [],
    sponsors: result?.sponsors ?? [],
    speakers: (result?.speakers ?? [])
      .filter((speaker) => matchesSpeaker(speaker, term))
      .sort(compareSpeakers)
      // `bio` and the sort booleans never leave the server.
      .map(({ _id, name, title, email }) => ({ _id, name, title, email })),
  }
}
