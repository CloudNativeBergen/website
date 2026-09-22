import type {
  PublishableVariant,
  SocialVariantStore,
  TickWorkBounds,
  VariantTransition,
} from '../store'
import type { SocialPostAttachment, SocialPostVariant } from '../types'

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

  /** The posts' attachments by post id, as the Sanity read joins them. */
  readonly posts: Record<string, SocialPostAttachment[]>
  /** Conference domains by conference id, as the Sanity read joins them. */
  readonly domains: Record<string, string[]>
  /** The posts' creators by post id, as the Sanity read joins them. */
  readonly creators: Record<string, string>

  constructor(
    variants: SocialPostVariant[] = [],
    posts: Record<string, SocialPostAttachment[]> = {},
    domains: Record<string, string[]> = {},
    creators: Record<string, string> = {},
  ) {
    for (const v of variants) this.docs.set(v._id, { ...v })
    this.posts = posts
    this.domains = domains
    this.creators = creators
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

  async findWork(now: Date, staleBefore: Date, bounds: TickWorkBounds) {
    const all = [...this.docs.values()]
    const dueAll = all
      .filter(
        (v) =>
          v.status === 'scheduled' &&
          v.scheduledAt !== null &&
          new Date(v.scheduledAt) <= now,
      )
      .sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1))
    // Same shape as the Sanity read: per conference, oldest first, capped.
    const byConference = new Map<string, PublishableVariant[]>()
    for (const v of dueAll) {
      const bucket = byConference.get(v.conferenceId) ?? []
      if (bucket.length < bounds.perConference) {
        bucket.push({
          ...v,
          postAttachments: this.posts[v.postId] ?? [],
          conferenceDomains: this.domains[v.conferenceId] ?? [],
          postCreatedBy: this.creators[v.postId] ?? null,
          marketingTaskId: null,
        })
      }
      byConference.set(v.conferenceId, bucket)
    }
    // Sanity keeps conferences in document order, not by oldest due post —
    // the fake must not be fairer than the real store.
    const due = [...byConference.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(0, bounds.maxConferences)
      .map(([, bucket]) => bucket)
      .flat()
    const stale = all
      .filter(
        (v) =>
          v.status === 'publishing' &&
          (v.claimedAt === null || new Date(v.claimedAt) < staleBefore),
      )
      .slice(0, bounds.staleLimit)
      .map((v) => ({ ...v }))
    // Same shape as the Sanity read: oldest submission first, bounded (#1128).
    const submitted = all
      .filter((v) => v.status === 'submitted')
      .sort((a, b) =>
        (a.submission?.submittedAt ?? '') < (b.submission?.submittedAt ?? '')
          ? -1
          : 1,
      )
      .slice(0, bounds.submittedLimit)
      .map((v) => ({ ...v }))
    return { due, stale, submitted }
  }

  async claim<V extends SocialPostVariant>(variant: V, now: Date) {
    this.beforeClaim?.(variant)
    const current = this.get(variant._id)
    if (current._rev !== variant._rev || current.status !== 'scheduled') {
      return null
    }
    const written = this.write(variant._id, {
      status: 'publishing',
      claimedAt: now.toISOString(),
    })
    // Like the Sanity store: the caller's slice, with the fresh claim on it.
    return { ...variant, ...written }
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
        ? [
            ...current.attempts,
            { ...attempt, _key: attempt._key ?? `k${this.revCounter}` },
          ]
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
    orgId: 'org-1',
    platform: 'bluesky',
    body: 'Hello from the conference',
    status: 'scheduled',
    scheduledAt: '2026-09-13T09:59:00.000Z',
    usesCustomTime: false,
    claimedAt: null,
    submission: null,
    link: null,
    attachments: [],
    publishResult: null,
    attempts: [],
    attemptCount: 0,
    ...overrides,
  }
}
