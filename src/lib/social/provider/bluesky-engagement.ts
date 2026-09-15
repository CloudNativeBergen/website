import { describeError, isJsonObject, parseRetryAfter } from '@/lib/vendor/http'
import type {
  EngagementFailureKind,
  EngagementResult,
  PostEngagement,
  SocialEngagementProvider,
} from './types'

/**
 * Bluesky engagement read-back (spec §4.1): `app.bsky.feed.getPosts` on the
 * PUBLIC AppView, UNAUTHENTICATED, 25 URIs per call.
 *
 * WHY THE PUBLIC APPVIEW AND NOT THE PUBLISHING AGENT. The counters are public
 * data, and `public.api.bsky.app` serves them without a session. Reading them
 * this way costs no `createSession` (limited to 300/day/account — the budget
 * `BlueskyPublishAdapter` deliberately spends one of per publish) and keeps
 * working for an edition whose app password has expired, so a Campaign's
 * history never goes dark because a credential lapsed.
 *
 * PARTIAL RESULTS ARE NORMAL. `getPosts` silently omits a post it cannot
 * resolve — deleted, taken down, or a URI from another account — so the caller
 * gets it back in `missing` and stores `null`, never `0`.
 */

/** The unauthenticated AppView; `options.host` overrides it for tests. */
export const BLUESKY_APPVIEW_HOST = 'https://public.api.bsky.app'

/** `app.bsky.feed.getPosts` accepts at most 25 URIs per call (lexicon maxLength). */
export const BLUESKY_GET_POSTS_BATCH = 25

/** Per-call wall clock. */
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Wall clock for the WHOLE sweep, however many batches it takes. A conference
 * with hundreds of posts is a dozen sequential calls, and without this the
 * sweep alone could outlast the snapshot cron's function budget and take the
 * editions queued behind it down with it. Running out is reported as a
 * failure, so the Snapshot records Bluesky as unavailable rather than storing
 * the half of the sweep that finished as if it were the whole.
 */
const DEFAULT_SWEEP_BUDGET_MS = 60_000

export interface BlueskyEngagementOptions {
  fetch?: typeof fetch
  host?: string
  now?: () => Date
  /** Per-call timeout. */
  timeoutMs?: number
  /** Wall clock for the whole sweep; see {@link DEFAULT_SWEEP_BUDGET_MS}. */
  sweepBudgetMs?: number
}

export class BlueskyEngagementProvider implements SocialEngagementProvider {
  readonly platform = 'bluesky' as const
  readonly batchSize = BLUESKY_GET_POSTS_BATCH
  private readonly fetchImpl: typeof fetch
  private readonly host: string
  private readonly now: () => Date
  private readonly timeoutMs: number
  private readonly sweepBudgetMs: number

  constructor(options: BlueskyEngagementOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch
    this.host = (options.host ?? BLUESKY_APPVIEW_HOST).replace(/\/+$/, '')
    this.now = options.now ?? (() => new Date())
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.sweepBudgetMs = options.sweepBudgetMs ?? DEFAULT_SWEEP_BUDGET_MS
  }

  async engagement(uris: string[]): Promise<EngagementResult> {
    const wanted = [...new Set(uris.filter((uri) => uri.trim().length > 0))]
    const counts = new Map<string, PostEngagement>()
    if (wanted.length === 0) return { ok: true, counts, missing: [] }

    const deadline = this.now().getTime() + this.sweepBudgetMs
    for (let i = 0; i < wanted.length; i += this.batchSize) {
      if (this.now().getTime() >= deadline) {
        return {
          ok: false,
          kind: 'transient',
          message: `Bluesky getPosts sweep ran out of budget after ${i} of ${wanted.length} post(s)`,
        }
      }
      const batch = wanted.slice(i, i + this.batchSize)
      const result = await this.fetchBatch(batch)
      // ONE failed batch fails the sweep. A half-read Campaign would be
      // indistinguishable from a quiet one, and the Snapshot's
      // `source.bluesky = 'unavailable'` is the honest answer instead.
      if ('problem' in result) return result.problem
      for (const [uri, engagement] of result.counts) counts.set(uri, engagement)
    }

    return {
      ok: true,
      counts,
      missing: wanted.filter((uri) => !counts.has(uri)),
    }
  }

  private async fetchBatch(
    uris: string[],
  ): Promise<
    | { counts: Map<string, PostEngagement> }
    | { problem: Extract<EngagementResult, { ok: false }> }
  > {
    const params = new URLSearchParams()
    for (const uri of uris) params.append('uris', uri)
    const url = `${this.host}/xrpc/app.bsky.feed.getPosts?${params}`

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      return {
        problem: {
          ok: false,
          kind: 'transient',
          message: `Bluesky getPosts request failed: ${describeError(error)}`,
        },
      }
    }

    let text: string
    try {
      text = await response.text()
    } catch (error) {
      return {
        problem: {
          ok: false,
          kind: 'transient',
          message: `Bluesky getPosts body failed: ${describeError(error)}`,
        },
      }
    }

    if (!response.ok) {
      return { problem: failure(response, text, this.now()) }
    }

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return {
        problem: {
          ok: false,
          kind: 'malformed',
          message: 'Bluesky getPosts returned non-JSON',
        },
      }
    }

    const parsed = parsePosts(json)
    return 'problem' in parsed
      ? {
          problem: {
            ok: false,
            kind: 'malformed',
            message: `Bluesky getPosts response ${parsed.problem}`,
          },
        }
      : parsed
  }
}

function failure(
  response: Response,
  text: string,
  now: Date,
): Extract<EngagementResult, { ok: false }> {
  const { status } = response
  const detail = text.slice(0, 300)
  const message = `Bluesky getPosts returned ${status}${detail ? `: ${detail}` : ''}`
  let kind: EngagementFailureKind
  if (status === 429) kind = 'rate-limited'
  else if (status >= 500) kind = 'transient'
  else kind = 'rejected'
  const retryAfter =
    kind === 'rate-limited'
      ? parseRetryAfter(response.headers.get('retry-after'), now)
      : undefined
  return retryAfter
    ? { ok: false, kind, message, retryAfter }
    : { ok: false, kind, message }
}

type ParsedPosts = { counts: Map<string, PostEngagement> } | { problem: string }

/**
 * `{ posts: PostView[] }`. Every counter is OPTIONAL in the lexicon, so an
 * absent one is `null` (unknown) while a present-but-nonsense one is a
 * malformed response — reading `-1` as a like count would be worse than
 * refusing the whole batch.
 */
function parsePosts(json: unknown): ParsedPosts {
  if (!isJsonObject(json)) return { problem: 'is not an object' }
  const { posts } = json
  if (!Array.isArray(posts)) return { problem: 'has no posts array' }

  const counts = new Map<string, PostEngagement>()
  for (const [i, post] of posts.entries()) {
    if (!isJsonObject(post)) return { problem: `post ${i} is not an object` }
    const { uri } = post
    if (typeof uri !== 'string' || uri === '') {
      return { problem: `post ${i} has no uri` }
    }
    const engagement: Record<keyof PostEngagement, number | null> = {
      likes: null,
      reposts: null,
      replies: null,
      quotes: null,
    }
    const fields: [keyof PostEngagement, string][] = [
      ['likes', 'likeCount'],
      ['reposts', 'repostCount'],
      ['replies', 'replyCount'],
      ['quotes', 'quoteCount'],
    ]
    for (const [key, field] of fields) {
      const value = post[field]
      if (value === undefined || value === null) continue
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return {
          problem: `post ${i} has a non-count ${field}: ${String(value)}`,
        }
      }
      engagement[key] = value
    }
    counts.set(uri, engagement)
  }
  return { counts }
}
