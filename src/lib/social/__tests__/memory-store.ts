import type { SocialVariantStore, VariantTransition } from '../store'
import type { SocialPostVariant } from '../types'

/**
 * In-memory `SocialVariantStore` with real compare-and-set semantics: every
 * write bumps `_rev`, and a CAS write against a stale `_rev` is refused. This
 * is what lets the engine test race two ticks without Sanity.
 */
export class MemoryVariantStore implements SocialVariantStore {
  readonly docs = new Map<string, SocialPostVariant>()
  private revCounter = 0
  /** Hook to inject a competing write between read and claim. */
  beforeClaim: ((variant: SocialPostVariant) => void) | null = null

  constructor(variants: SocialPostVariant[] = []) {
    for (const v of variants) this.docs.set(v._id, { ...v })
  }

  get(id: string): SocialPostVariant {
    const doc = this.docs.get(id)
    if (!doc) throw new Error(`no variant ${id}`)
    return doc
  }

  private write(id: string, patch: Partial<SocialPostVariant>) {
    const current = this.get(id)
    this.docs.set(id, {
      ...current,
      ...patch,
      _rev: `rev-${++this.revCounter}`,
    })
    return this.get(id)
  }

  async findWork(now: Date, staleBefore: Date, limit: number) {
    const all = [...this.docs.values()]
    const due = all
      .filter(
        (v) =>
          v.status === 'scheduled' &&
          v.scheduledAt !== null &&
          new Date(v.scheduledAt) <= now,
      )
      .sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1))
      .slice(0, limit)
      .map((v) => ({ ...v }))
    const stale = all
      .filter(
        (v) =>
          v.status === 'publishing' &&
          (v.claimedAt === null || new Date(v.claimedAt) < staleBefore),
      )
      .slice(0, limit)
      .map((v) => ({ ...v }))
    return { due, stale }
  }

  async claim(variant: SocialPostVariant, now: Date) {
    this.beforeClaim?.(variant)
    const current = this.get(variant._id)
    if (current._rev !== variant._rev || current.status !== 'scheduled') {
      return null
    }
    return this.write(variant._id, {
      status: 'publishing',
      claimedAt: now.toISOString(),
    })
  }

  async transition(
    id: string,
    transition: VariantTransition,
    options?: { ifRevision?: string },
  ) {
    const current = this.get(id)
    if (options?.ifRevision && options.ifRevision !== current._rev) return false
    const { attempt, ...rest } = transition
    this.write(id, {
      ...rest,
      attempts: attempt
        ? [...current.attempts, { ...attempt, _key: `k${this.revCounter}` }]
        : current.attempts,
    })
    return true
  }
}

export function makeVariant(
  overrides: Partial<SocialPostVariant> = {},
): SocialPostVariant {
  return {
    _id: 'variant-1',
    _rev: 'rev-0',
    postId: 'post-1',
    conferenceId: 'conf-1',
    platform: 'bluesky',
    body: 'Hello from the conference',
    status: 'scheduled',
    scheduledAt: '2026-09-13T09:59:00.000Z',
    usesCustomTime: false,
    claimedAt: null,
    link: null,
    publishResult: null,
    attempts: [],
    attemptCount: 0,
    ...overrides,
  }
}
