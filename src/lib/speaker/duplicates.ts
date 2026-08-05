/**
 * DUPLICATE-SPEAKER DETECTION (#267).
 *
 * ============================ READ-ONLY ============================
 * Pure clustering core. No I/O, no writes. Merging stays a deliberate,
 * human-reviewed action performed through `speaker.admin.merge`.
 * ==================================================================
 *
 * Merging duplicates has worked for a while (`SpeakerMergeModal` →
 * `speaker.admin.merge`). FINDING them from the admin UI did not: both merge
 * dropdowns list every speaker alphabetically, so an organizer could only merge
 * a duplicate they already knew about — which in practice meant "after the
 * speaker complains". The August 2026 incident on 2026.cloudnativedays.no was
 * exactly that: two documents for one person, sharing one slug, with the
 * confirmed talk attached to the document he does NOT sign in with.
 *
 * This module is the single detector, shared by the admin surface
 * (`speaker.admin.duplicateCandidates`) and the read-only ops report
 * (`scripts/report-duplicate-speakers.ts`).
 *
 * CONFIDENCE IS PART OF THE OUTPUT, NOT A PRESENTATION DETAIL. A slug collision
 * is a fact about the dataset; two people sharing a name is a guess. Presenting
 * them with equal weight invites an organizer to delete a real second person, so
 * the tiers are modelled here and the UI is required to render them differently.
 *
 * WHY NOT TRANSITIVE CLUSTERING. An earlier version union-found every signal
 * into one component, so A↔B by email plus B↔C by name produced one three-way
 * cluster with reasons `['email','name']` — laundering the guess about C into
 * the same group as the near-certainty about B. Groups are now keyed on ONE
 * signal each, and a weaker signal is only ever reported as corroboration when
 * it covers exactly the same documents.
 */

import { uniqueEmails } from './email'

/** Minimal speaker shape needed to detect duplicates. */
export interface DuplicateSpeakerInput {
  _id: string
  name?: string | null
  /** `slug.current` — the public profile URL segment. */
  slug?: string | null
  email?: string | null
  knownEmails?: (string | null | undefined)[] | null
  providers?: (string | null | undefined)[] | null
  _createdAt?: string | null
  /**
   * Talks referencing this document. Scoped by the CALLER — the admin surface
   * passes org-scoped counts, so they answer "what would this organization lose
   * by deleting this document". Absent counts as zero.
   */
  talkCount?: number
  /** How many of those are `confirmed` — the decisive survivor signal. */
  confirmedTalkCount?: number
}

/** What made two speaker documents look like the same person. */
export type DuplicateSignal = 'slug' | 'provider' | 'email' | 'name'

/** How much a signal is worth. See {@link SIGNAL_CONFIDENCE}. */
export type DuplicateConfidence = 'certain' | 'likely' | 'possible'

/**
 * Signal → confidence.
 *
 * - `slug` is CERTAIN. `slug.current` is the public profile URL and has no
 *   uniqueness constraint. Two documents carrying the same one is a defect
 *   whoever they belong to: `getPublicSpeaker` resolves it with `[0]`, so one of
 *   the two is unreachable by an ordering nobody controls (#818). All ten of the
 *   production cases in #267 are this shape, and it is the only signal that
 *   needs no judgement to act on.
 * - `provider` and `email` are LIKELY. They are strong identity keys — but they
 *   are also the keys the login path already matches on, so a collision means
 *   something unusual happened upstream and deserves a human look rather than an
 *   automatic verdict.
 * - `name` is POSSIBLE. Two people really can be called Anna Hansen.
 */
export const SIGNAL_CONFIDENCE: Record<DuplicateSignal, DuplicateConfidence> = {
  slug: 'certain',
  provider: 'likely',
  email: 'likely',
  name: 'possible',
}

/** Strongest-first evaluation order; also the display order of the groups. */
const SIGNAL_ORDER: DuplicateSignal[] = ['slug', 'provider', 'email', 'name']

const CONFIDENCE_RANK: Record<DuplicateConfidence, number> = {
  certain: 0,
  likely: 1,
  possible: 2,
}

/** Short label for a signal, shared by the admin UI and the ops report. */
export const SIGNAL_LABEL: Record<DuplicateSignal, string> = {
  slug: 'Same profile URL',
  provider: 'Same login account',
  email: 'Same email address',
  name: 'Same name',
}

/** Why the detector suggested a particular document as the survivor. */
export type SurvivorReason = 'confirmed-talks' | 'talks' | 'oldest'

/**
 * Why a document may NOT be the DUPLICATE (loser) of a merge.
 *
 * `speaker.admin.merge` deletes the loser and therefore demands it be exclusive
 * to the request's organization (`requireSpeakerInCurrentOrg(…, {
 * requireExclusive: true })`). A candidate pair that spans tenants is real but
 * unmergeable, and the surface has to say so rather than offer an action that
 * will be refused. Computed server-side by `speakerExclusivityBlocks`.
 */
export type MergeBlockReason =
  /** Another organization has membership or a talk. */
  | 'other-organization'
  /** Another organization's (or an unattributable) document references them. */
  | 'foreign-references'
  /** Exclusivity could not be proven; the guard fails closed, so we do too. */
  | 'unknown'

/** A detected document plus its merge eligibility, as sent to the admin UI. */
export interface DuplicateCandidateSpeaker extends DuplicateSpeakerInput {
  /** `null` when this document may be merged away into another. */
  mergeBlockedReason: MergeBlockReason | null
}

/** The payload of `speaker.admin.duplicateCandidates`. */
export interface DuplicateCandidatesReport {
  groups: DuplicateCandidateGroup<DuplicateCandidateSpeaker>[]
  /** How many speaker documents in this organization were examined. */
  scannedCount: number
}

/** A group of two or more speaker documents that look like the same person. */
export interface DuplicateCandidateGroup<
  T extends DuplicateSpeakerInput = DuplicateSpeakerInput,
> {
  /** Stable React key / test handle: `<signal>:<normalized value>`. */
  id: string
  /** The signal that established this group. */
  signal: DuplicateSignal
  confidence: DuplicateConfidence
  /** The shared value itself (the slug, the address, the login id, the name). */
  value: string
  /** Weaker signals that ALSO hold for exactly these documents. */
  corroboratingSignals: DuplicateSignal[]
  /** Suggested survivor first, then oldest-first. */
  members: T[]
  /** Which document should be KEPT. */
  suggestedSurvivorId: string
  survivorReason: SurvivorReason
}

/**
 * Normalize a display name for equality comparison: trimmed, lowercased, inner
 * whitespace collapsed. Returns `''` for a missing/blank name (never matched).
 */
export function normalizeName(name?: string | null): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Normalize a slug for equality comparison. Slugs are written lowercase by
 * `generateSpeakerSlug`, but legacy and hand-edited documents are not
 * guaranteed to be, and a case difference is not a different URL segment for
 * our purposes.
 */
export function normalizeSlug(slug?: string | null): string {
  return (slug ?? '').trim().toLowerCase()
}

/**
 * The full normalized email match-set for a speaker: the display `email` unioned
 * with every `knownEmails` entry, deduplicated. This is the key set used for
 * cross-document email overlap.
 */
export function speakerEmailSet(speaker: DuplicateSpeakerInput): string[] {
  return uniqueEmails([speaker.email, ...(speaker.knownEmails ?? [])])
}

/** Every value of one signal for one document; empties dropped, deduplicated. */
function signalValues(
  signal: DuplicateSignal,
  speaker: DuplicateSpeakerInput,
): string[] {
  const raw: string[] = (() => {
    switch (signal) {
      case 'slug':
        return [normalizeSlug(speaker.slug)]
      case 'provider':
        // Already `<provider>:<accountId>` (see `providerAccount`).
        return (speaker.providers ?? []).map((value) =>
          (value ?? '').trim().toLowerCase(),
        )
      case 'email':
        return speakerEmailSet(speaker)
      case 'name':
        return [normalizeName(speaker.name)]
    }
  })()
  return Array.from(new Set(raw.filter((value) => value.length > 0)))
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function allPairs(ids: string[]): string[] {
  const pairs: string[] = []
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      pairs.push(pairKey(ids[i], ids[j]))
    }
  }
  return pairs
}

/**
 * Pick the document to KEEP.
 *
 * THE ORDER OF THESE TIE-BREAKS IS THE LESSON FROM THE INCIDENT. The correct
 * survivor there was neither the newest nor the oldest document — it was the one
 * holding the confirmed talk. Merging the other way would have repointed a
 * confirmed conference talk onto a document and then deleted the one the
 * schedule was built around. So: most confirmed talks, then most talks, then
 * oldest (the account the person has had longest), then `_id` for determinism.
 *
 * It is a SUGGESTION. The organizer picks the survivor in the merge modal; this
 * only decides which way round the pre-selection points.
 */
function pickSurvivor<T extends DuplicateSpeakerInput>(
  members: T[],
): { id: string; reason: SurvivorReason } {
  const sorted = [...members].sort((a, b) => {
    const aConfirmed = a.confirmedTalkCount ?? 0
    const bConfirmed = b.confirmedTalkCount ?? 0
    if (aConfirmed !== bConfirmed) return bConfirmed - aConfirmed
    const aTalks = a.talkCount ?? 0
    const bTalks = b.talkCount ?? 0
    if (aTalks !== bTalks) return bTalks - aTalks
    const aCreated = a._createdAt ?? '~'
    const bCreated = b._createdAt ?? '~'
    if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1
    return a._id < b._id ? -1 : 1
  })

  const best = sorted[0]
  const reason: SurvivorReason =
    (best.confirmedTalkCount ?? 0) > 0
      ? 'confirmed-talks'
      : (best.talkCount ?? 0) > 0
        ? 'talks'
        : 'oldest'
  return { id: best._id, reason }
}

function orderMembers<T extends DuplicateSpeakerInput>(
  members: T[],
  survivorId: string,
): T[] {
  return [...members].sort((a, b) => {
    if (a._id === survivorId) return -1
    if (b._id === survivorId) return 1
    const aCreated = a._createdAt ?? '~'
    const bCreated = b._createdAt ?? '~'
    if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1
    return a._id < b._id ? -1 : 1
  })
}

/**
 * Group speaker documents that look like the same person, strongest signal
 * first.
 *
 * OVERLAP RULE. One pair of documents can trip several signals. A group is
 * reported only when it introduces at least one PAIR of documents that no
 * stronger group already covers. A weaker signal over exactly the same documents
 * is folded in as `corroboratingSignals`; a weaker signal over a WIDER set stays
 * its own, weaker group, because the extra documents genuinely are only a guess.
 *
 * Deterministic and pure: the caller supplies an already tenant-scoped corpus.
 * Returns only groups of two or more.
 */
export function findDuplicateSpeakerCandidates<T extends DuplicateSpeakerInput>(
  speakers: T[],
): DuplicateCandidateGroup<T>[] {
  const byId = new Map(speakers.map((speaker) => [speaker._id, speaker]))

  interface RawGroup {
    signal: DuplicateSignal
    value: string
    ids: string[]
  }

  const raw: RawGroup[] = []
  for (const signal of SIGNAL_ORDER) {
    const buckets = new Map<string, string[]>()
    for (const speaker of speakers) {
      for (const value of signalValues(signal, speaker)) {
        const bucket = buckets.get(value)
        if (bucket) {
          if (!bucket.includes(speaker._id)) bucket.push(speaker._id)
        } else {
          buckets.set(value, [speaker._id])
        }
      }
    }
    for (const [value, ids] of buckets) {
      if (ids.length < 2) continue
      raw.push({ signal, value, ids })
    }
  }

  raw.sort((a, b) => {
    const rank =
      CONFIDENCE_RANK[SIGNAL_CONFIDENCE[a.signal]] -
      CONFIDENCE_RANK[SIGNAL_CONFIDENCE[b.signal]]
    if (rank !== 0) return rank
    const order =
      SIGNAL_ORDER.indexOf(a.signal) - SIGNAL_ORDER.indexOf(b.signal)
    if (order !== 0) return order
    if (a.ids.length !== b.ids.length) return b.ids.length - a.ids.length
    return a.value.localeCompare(b.value)
  })

  const coveredPairs = new Set<string>()
  const groups: DuplicateCandidateGroup<T>[] = []

  for (const candidate of raw) {
    const pairs = allPairs(candidate.ids)

    if (pairs.every((pair) => coveredPairs.has(pair))) {
      // Adds no pair a stronger group has not already made. If it covers exactly
      // the same documents as one of them, record it there as corroboration.
      const twin = groups.find(
        (group) =>
          group.members.length === candidate.ids.length &&
          group.members.every((member) => candidate.ids.includes(member._id)),
      )
      if (twin && !twin.corroboratingSignals.includes(candidate.signal)) {
        twin.corroboratingSignals.push(candidate.signal)
      }
      continue
    }

    for (const pair of pairs) coveredPairs.add(pair)

    const members = candidate.ids
      .map((id) => byId.get(id))
      .filter((speaker): speaker is T => Boolean(speaker))
    const { id: survivorId, reason } = pickSurvivor(members)

    groups.push({
      id: `${candidate.signal}:${candidate.value}`,
      signal: candidate.signal,
      confidence: SIGNAL_CONFIDENCE[candidate.signal],
      value: candidate.value,
      corroboratingSignals: [],
      members: orderMembers(members, survivorId),
      suggestedSurvivorId: survivorId,
      survivorReason: reason,
    })
  }

  return groups
}
