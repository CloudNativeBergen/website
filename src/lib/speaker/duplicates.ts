/**
 * Duplicate-speaker detection (Phase 4, Part B).
 *
 * Pure clustering core shared by the read-only reporting script
 * (`scripts/report-duplicate-speakers.ts`). It groups speaker documents that
 * are LIKELY the same person so an organizer can review and later merge them
 * with the Phase 3 admin tool. It performs NO I/O and makes NO writes.
 *
 * Two speakers are considered linked when they share either:
 *  1. a normalized email — the intersection of their `email` + `knownEmails`
 *     match-sets is non-empty, or
 *  2. an identical normalized name.
 *
 * Linking is transitive (union-find): A↔B via email and B↔C via name puts
 * A, B and C in one cluster.
 */

import { uniqueEmails } from './email'

/** Minimal speaker shape needed to detect duplicates. */
export interface DuplicateSpeakerInput {
  _id: string
  name?: string | null
  email?: string | null
  knownEmails?: (string | null | undefined)[] | null
  providers?: (string | null | undefined)[] | null
  _createdAt?: string | null
}

/** Why the members of a cluster were grouped together. */
export type DuplicateReason = 'email' | 'name'

/** A group of two or more speakers that are likely the same person. */
export interface DuplicateCluster<T extends DuplicateSpeakerInput> {
  /** The signals that linked this cluster (email overlap and/or name match). */
  reasons: DuplicateReason[]
  /** The overlapping normalized email(s), if email linked the cluster. */
  sharedEmails: string[]
  /** The shared normalized name(s), if name linked the cluster. */
  sharedNames: string[]
  /** Cluster members, oldest `_createdAt` first (the likely canonical record). */
  members: T[]
}

/**
 * Normalize a display name for equality comparison: trimmed, lowercased, inner
 * whitespace collapsed. Returns `''` for a missing/blank name (never matched).
 */
export function normalizeName(name?: string | null): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * The full normalized email match-set for a speaker: the display `email` unioned
 * with every `knownEmails` entry, deduplicated. This is the key set used for
 * cross-document email overlap.
 */
export function speakerEmailSet(speaker: DuplicateSpeakerInput): string[] {
  return uniqueEmails([speaker.email, ...(speaker.knownEmails ?? [])])
}

/**
 * Cluster speakers that are likely duplicates. Returns only clusters with two
 * or more members. Clusters are ordered largest-first (then by the lowest
 * member id); members within a cluster are ordered oldest-`_createdAt`-first
 * (then by id) so the likely canonical record leads. Deterministic.
 */
export function clusterDuplicateSpeakers<T extends DuplicateSpeakerInput>(
  speakers: T[],
): DuplicateCluster<T>[] {
  const parent = speakers.map((_, index) => index)

  const find = (node: number): number => {
    let root = node
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]] // path compression
      root = parent[root]
    }
    return root
  }

  const union = (a: number, b: number): void => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootA] = rootB
  }

  // Build inverted indexes: normalized key -> speaker indices carrying it.
  const emailIndex = new Map<string, number[]>()
  const nameIndex = new Map<string, number[]>()

  speakers.forEach((speaker, index) => {
    for (const email of speakerEmailSet(speaker)) {
      const bucket = emailIndex.get(email)
      if (bucket) bucket.push(index)
      else emailIndex.set(email, [index])
    }
    const name = normalizeName(speaker.name)
    if (name) {
      const bucket = nameIndex.get(name)
      if (bucket) bucket.push(index)
      else nameIndex.set(name, [index])
    }
  })

  // Union every pair that shares an email or a name key.
  for (const bucket of emailIndex.values()) {
    for (let i = 1; i < bucket.length; i += 1) union(bucket[0], bucket[i])
  }
  for (const bucket of nameIndex.values()) {
    for (let i = 1; i < bucket.length; i += 1) union(bucket[0], bucket[i])
  }

  // Group indices by connected component.
  const componentsByRoot = new Map<number, number[]>()
  speakers.forEach((_, index) => {
    const root = find(index)
    const bucket = componentsByRoot.get(root)
    if (bucket) bucket.push(index)
    else componentsByRoot.set(root, [index])
  })

  const clusters: DuplicateCluster<T>[] = []

  for (const memberIndexes of componentsByRoot.values()) {
    if (memberIndexes.length < 2) continue

    const memberSet = new Set(memberIndexes)

    const sharedEmails: string[] = []
    for (const [email, indexes] of emailIndex) {
      if (indexes.filter((index) => memberSet.has(index)).length >= 2) {
        sharedEmails.push(email)
      }
    }

    const sharedNames: string[] = []
    for (const [name, indexes] of nameIndex) {
      if (indexes.filter((index) => memberSet.has(index)).length >= 2) {
        sharedNames.push(name)
      }
    }

    const reasons: DuplicateReason[] = []
    if (sharedEmails.length > 0) reasons.push('email')
    if (sharedNames.length > 0) reasons.push('name')

    const members = [...memberIndexes]
      .map((index) => speakers[index])
      .sort((a, b) => {
        const createdA = a._createdAt ?? '~'
        const createdB = b._createdAt ?? '~'
        if (createdA !== createdB) return createdA < createdB ? -1 : 1
        return a._id < b._id ? -1 : 1
      })

    clusters.push({
      reasons,
      sharedEmails: sharedEmails.sort(),
      sharedNames: sharedNames.sort(),
      members,
    })
  }

  return clusters.sort((a, b) => {
    if (a.members.length !== b.members.length) {
      return b.members.length - a.members.length
    }
    return a.members[0]._id < b.members[0]._id ? -1 : 1
  })
}
