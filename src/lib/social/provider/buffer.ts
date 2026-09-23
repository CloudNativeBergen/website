import { SOCIAL_PLATFORM_LABELS } from '../types'
import { PLATFORM_CONSTRAINTS, validatePublishInput } from './constraints'
import { withDeadline } from './deadline'
import type {
  ConfirmCheck,
  PlatformConstraints,
  PublishContext,
  PublishInput,
  PublishOutcome,
  SocialPublishAdapter,
  ValidationIssue,
} from './types'

/**
 * `BufferPublishAdapter` (docs/LINKEDIN_VIA_BUFFER_SPEC.md, #1129): an
 * approved variant becomes a Buffer post, shared NOW on the organization's
 * pinned channel. Our cron owns the schedule; Buffer's queue is never used.
 *
 *  - Vendor-wide: the platform comes in the options and picks the channel
 *    rules from {@link BUFFER_CHANNELS}. A later platform is a constraints
 *    entry, a channel-id field, a line there and a registry line.
 *  - Credentials INJECTED (docs/INTEGRATION_ADAPTERS.md): the personal API
 *    key and the pinned channel id the `buffer` secret family resolved.
 *  - ASYNCHRONOUS: `createPost` answers with Buffer's own post id and the
 *    LinkedIn URL only exists later, so `publish` returns `accepted` and the
 *    confirm sweep reads the post back through {@link confirm}.
 *  - Typed outcomes are the API. Before the create request is sent
 *    everything is a definite non-post; once it is sent only a TYPED
 *    refusal counts as "not created" — anything else is `ambiguous`
 *    (`CreatePostInput` has no idempotency key), which is what keeps the
 *    never-double-post invariant.
 *
 * Shapes follow Buffer's documented schema (developers.buffer.com); the
 * behaviour claims (≈11 s create, `sending → sent`, the `externalLink`
 * form) come from the #1126 spike, not from this code's tests.
 */

export const BUFFER_ENDPOINT = 'https://api.buffer.com'
/**
 * Wall-clock budget for ONE publish: the channel check plus the create,
 * which took 10.9 s in the spike. `PUBLISH_RESERVE_MS` (40 s) is built on
 * a 30 s adapter budget.
 */
export const BUFFER_PUBLISH_BUDGET_MS = 30_000
/** No single request may take longer than this, budget permitting. */
export const BUFFER_CALL_TIMEOUT_MS = 15_000
/**
 * Budget that must remain before `createPost` is even sent: the spike's
 * 10.9 s plus a margin. Starting it with less would turn a slow Buffer into
 * an `ambiguous` outcome rather than a clean retry.
 */
export const BUFFER_MIN_CREATE_BUDGET_MS = 12_000
/**
 * One confirm read. Below the engine's `CONFIRM_READ_TIMEOUT_MS` (5 s) on
 * purpose: the engine's `withTimeout` only RACES the read, so without an
 * abort of our own a hung request would outlive the sweep.
 */
export const BUFFER_CONFIRM_TIMEOUT_MS = 4_000

/**
 * What the pinned channel must be, per platform (spec §2): Buffer's
 * `Service` and the `ChannelType` we accept. The platform name doubles as
 * the `PostInputMetaData` key the first comment goes under.
 */
export const BUFFER_CHANNELS = {
  linkedin: { service: 'linkedin', type: 'page', typeLabel: 'company page' },
} as const

export type BufferPlatform = keyof typeof BUFFER_CHANNELS

export interface BufferAdapterCredentials {
  apiKey: string
  /** The pinned channel — never discovered from the account. */
  channelId: string
}

export interface BufferAdapterOptions {
  platform: BufferPlatform
  fetch?: typeof fetch
  /** The clock `Retry-After` is read against. */
  now?: () => Date
  endpoint?: string
  /** Test seams for the deadlines; production uses the constants. */
  budgetMs?: number
  callTimeoutMs?: number
  confirmTimeoutMs?: number
}

const CHANNEL_QUERY = `query GetChannel($input: ChannelInput!) {
  channel(input: $input) {
    id
    service
    type
    descriptor
    linkShortening { isEnabled }
  }
}`

const CREATE_POST_MUTATION = `mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id } }
    ... on MutationError { message }
    ... on RestProxyError { code }
  }
}`

const POST_QUERY = `query GetPost($input: PostInput!) {
  post(input: $input) {
    id
    status
    externalLink
    error { message }
  }
}`

interface GraphQLError {
  message?: string
  extensions?: { code?: string }
}

interface GraphQLBody {
  data?: unknown
  errors?: GraphQLError[]
}

/** What one GraphQL round trip produced, before any phase interprets it. */
type Answer =
  | { kind: 'no-answer'; message: string }
  | { kind: 'http'; status: number; message: string; retryAfter?: Date }
  | { kind: 'errors'; code: string | undefined; message: string }
  | { kind: 'data'; data: Record<string, unknown> }

interface ChannelShape {
  service?: unknown
  type?: unknown
  descriptor?: unknown
  linkShortening?: { isEnabled?: unknown } | null
}

type Failure = Extract<PublishOutcome, { ok: false }>

export class BufferPublishAdapter implements SocialPublishAdapter {
  readonly platform: BufferPlatform
  readonly constraints: PlatformConstraints

  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date
  private readonly endpoint: string
  private readonly budgetMs: number
  private readonly callTimeoutMs: number
  private readonly confirmTimeoutMs: number

  constructor(
    private readonly credentials: BufferAdapterCredentials,
    options: BufferAdapterOptions,
  ) {
    this.platform = options.platform
    this.constraints = PLATFORM_CONSTRAINTS[options.platform]
    this.fetchImpl = options.fetch ?? fetch
    this.now = options.now ?? (() => new Date())
    this.endpoint = options.endpoint ?? BUFFER_ENDPOINT
    this.budgetMs = options.budgetMs ?? BUFFER_PUBLISH_BUDGET_MS
    this.callTimeoutMs = options.callTimeoutMs ?? BUFFER_CALL_TIMEOUT_MS
    this.confirmTimeoutMs =
      options.confirmTimeoutMs ?? BUFFER_CONFIRM_TIMEOUT_MS
  }

  /** Exactly the editor's rules: the shared validator, nothing extra. */
  validate(
    input: PublishInput,
    context: PublishContext = {},
  ): ValidationIssue[] {
    return validatePublishInput(this.constraints, input, context)
  }

  async publish(input: PublishInput): Promise<PublishOutcome> {
    const issues = this.validate(input)
    if (issues.length > 0) {
      return {
        ok: false,
        kind: 'rejected',
        message: issues.map((i) => `${i.field}: ${i.message}`).join('; '),
      }
    }

    const deadline = Date.now() + this.budgetMs
    const fetchImpl = withDeadline(this.fetchImpl, deadline, this.callTimeoutMs)

    const checked = await this.checkChannel(fetchImpl)
    if (checked) return checked

    // Past this point a timeout is `ambiguous`; refuse to start the create
    // with too little budget so that outcome stays rare and honest.
    if (deadline - Date.now() < BUFFER_MIN_CREATE_BUDGET_MS) {
      return {
        ok: false,
        kind: 'transient',
        message:
          'Publish budget exhausted before the post was sent to Buffer (slow channel check); it will be retried.',
      }
    }

    const answer = await this.request(
      fetchImpl,
      'CreatePost',
      CREATE_POST_MUTATION,
      {
        input: this.createPostInput(input),
      },
    )
    return this.createOutcome(answer)
  }

  async confirm(vendorPostId: string): Promise<ConfirmCheck> {
    // Our OWN abort: the engine's timeout only races this read.
    const fetchImpl = withDeadline(
      this.fetchImpl,
      Date.now() + this.confirmTimeoutMs,
      this.confirmTimeoutMs,
    )
    const answer = await this.request(fetchImpl, 'GetPost', POST_QUERY, {
      input: { id: vendorPostId },
    })
    switch (answer.kind) {
      case 'no-answer':
      case 'http':
        return {
          state: 'unreadable',
          message: `Buffer post read failed: ${answer.message}`,
        }
      case 'errors':
        return answer.code === 'NOT_FOUND'
          ? { state: 'gone' }
          : {
              state: 'unreadable',
              message: `Buffer post read failed: ${answer.message}`,
            }
      case 'data':
        return confirmCheckOf(answer.data.post)
    }
  }

  /** `null` when the pinned channel is fit to post to; otherwise the outcome. */
  private async checkChannel(fetchImpl: typeof fetch): Promise<Failure | null> {
    const answer = await this.request(fetchImpl, 'GetChannel', CHANNEL_QUERY, {
      input: { id: this.credentials.channelId },
    })
    if (answer.kind !== 'data') return checkFailure(answer, this.platform)
    const channel = answer.data.channel as ChannelShape | null | undefined
    if (!channel || typeof channel !== 'object') {
      return checkFailure(
        { kind: 'no-answer', message: 'GetChannel: no channel in the answer' },
        this.platform,
      )
    }
    const problems = this.channelProblems(channel)
    if (problems.length === 0) return null
    return {
      ok: false,
      kind: 'rejected',
      message: `The pinned Buffer channel cannot be posted to: ${problems.join('; ')}.`,
    }
  }

  private channelProblems(channel: ChannelShape): string[] {
    const want = BUFFER_CHANNELS[this.platform]
    const label = SOCIAL_PLATFORM_LABELS[this.platform]
    const descriptor =
      typeof channel.descriptor === 'string' ? channel.descriptor : 'channel'
    const problems: string[] = []
    if (channel.service !== want.service) {
      problems.push(
        `it is a ${descriptor}, not a ${label} channel — pin the id of the ${label} ${want.typeLabel}'s channel in Buffer instead`,
      )
    } else if (channel.type !== want.type) {
      problems.push(
        `it is a ${descriptor}, not a ${label} ${want.typeLabel} — connect the ${want.typeLabel} in Buffer and pin its channel id`,
      )
    }
    // A shortened link drops the UTM tags attribution depends on. The schema
    // makes the flag non-null; anything but `false` is not proof it is off.
    const shortening = channel.linkShortening?.isEnabled
    if (shortening !== false) {
      problems.push(
        `${shortening === true ? 'link shortening is on' : 'Buffer did not say link shortening is off'}, and a shortened link drops the UTM tags — turn link shortening off for this channel in Buffer`,
      )
    }
    return problems
  }

  private createPostInput(input: PublishInput) {
    return {
      channelId: this.credentials.channelId,
      text: input.text,
      schedulingType: 'automatic',
      mode: 'shareNow',
      // `ImageMetadataInput.altText` is `String!`: no alt, no metadata.
      assets: input.media.map((media) => ({
        image: media.alt
          ? { url: media.url, metadata: { altText: media.alt } }
          : { url: media.url },
      })),
      // Spec §3.1: on LinkedIn the link is ALWAYS the first comment, alone.
      ...(input.link
        ? { metadata: { [this.platform]: { firstComment: input.link } } }
        : {}),
    }
  }

  /** Spec §3.3, after the create request may have been sent. */
  private createOutcome(answer: Answer): PublishOutcome {
    if (answer.kind === 'data') {
      return createPayloadOutcome(answer.data.createPost)
    }
    const refused = keyOrThrottleFailure(answer)
    if (refused) return refused
    switch (answer.kind) {
      case 'no-answer':
        // A timeout, a dropped connection, an unreadable body — or the
        // deadline refusing to start it, which the budget check above makes
        // unreachable. Treated as sent: the safe direction.
        return ambiguous(answer.message)
      case 'http':
        // A 4xx refused the request itself (a malformed document); a 5xx may
        // be a gateway giving up on a create that went through.
        return answer.status < 500
          ? rejected(`Buffer refused the post: ${answer.message}`)
          : ambiguous(answer.message)
      case 'errors':
        return answer.code === 'FORBIDDEN' || answer.code === 'NOT_FOUND'
          ? rejected(`Buffer refused the post: ${answer.message}`)
          : ambiguous(answer.message)
    }
  }

  /**
   * One GraphQL round trip: no usable answer (`no-answer` — a throw, a
   * timeout, an unreadable body), an HTTP refusal, a system error in
   * `errors[]`, or data. Never throws; each phase decides what it means.
   */
  private async request(
    fetchImpl: typeof fetch,
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<Answer> {
    let response: Response
    try {
      response = await fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.credentials.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ operationName, query, variables }),
      })
    } catch (error) {
      return {
        kind: 'no-answer',
        message: `${operationName}: ${errorMessage(error)}`,
      }
    }
    let body: GraphQLBody | null
    try {
      body = (await response.json()) as GraphQLBody | null
    } catch (error) {
      if (!response.ok) {
        return httpAnswer(
          response,
          `${operationName}: HTTP ${response.status}`,
          this.now(),
        )
      }
      return {
        kind: 'no-answer',
        message: `${operationName}: unreadable answer (${errorMessage(error)})`,
      }
    }
    const firstError = Array.isArray(body?.errors) ? body.errors[0] : undefined
    if (!response.ok) {
      const detail = firstError?.message ? ` ${firstError.message}` : ''
      return httpAnswer(
        response,
        `${operationName}: HTTP ${response.status}${detail}`,
        this.now(),
      )
    }
    const data = body?.data
    // A system error nulls the (non-null) root field, and GraphQL may then
    // null `data` itself or leave `{ field: null }`: either way no field
    // carries an answer, so the error is the answer.
    const answered =
      data !== null &&
      typeof data === 'object' &&
      Object.values(data).some((value) => value !== null && value !== undefined)
    if (firstError && !answered) {
      return {
        kind: 'errors',
        code: firstError.extensions?.code,
        message: `${operationName}: ${firstError.message ?? 'error'}${
          firstError.extensions?.code ? ` (${firstError.extensions.code})` : ''
        }`,
      }
    }
    if (!data || typeof data !== 'object') {
      return {
        kind: 'no-answer',
        message: `${operationName}: answer has no data`,
      }
    }
    return { kind: 'data', data: data as Record<string, unknown> }
  }
}

/** The `PostActionPayload` union → outcome (spec §3.3). */
function createPayloadOutcome(payload: unknown): PublishOutcome {
  if (!payload || typeof payload !== 'object') {
    return ambiguous('createPost answered without a payload')
  }
  const { __typename, message, post } = payload as {
    __typename?: unknown
    message?: unknown
    post?: { id?: unknown } | null
  }
  const text = typeof message === 'string' ? message : String(__typename)
  switch (__typename) {
    case 'PostActionSuccess': {
      const id = post?.id
      return typeof id === 'string' && id
        ? { ok: true, result: 'accepted', vendorPostId: id }
        : ambiguous('createPost succeeded without a post id')
    }
    case 'UnauthorizedError':
      return credentialExpired(text)
    case 'LimitReachedError':
      // A plan or posting limit: a 5-minute retry only burns quota.
      return {
        ok: false,
        kind: 'rejected',
        message: `Buffer limit reached: ${text}`,
      }
    case 'InvalidInputError':
    case 'NotFoundError':
      return {
        ok: false,
        kind: 'rejected',
        message: `Buffer refused the post: ${text}`,
      }
    default:
      // UnexpectedError, RestProxyError, or a MutationError added later.
      return ambiguous(`${String(__typename)}: ${text}`)
  }
}

/** A `Post` read back → the confirm verdict (spec §3.2). */
function confirmCheckOf(post: unknown): ConfirmCheck {
  if (!post || typeof post !== 'object') {
    return { state: 'unreadable', message: 'Buffer post read returned no post' }
  }
  const { status, externalLink, error } = post as {
    status?: unknown
    externalLink?: unknown
    error?: { message?: unknown } | null
  }
  if (status === 'sent') {
    if (typeof externalLink !== 'string' || !externalLink)
      return { state: 'published' }
    const urn = /urn:li:[A-Za-z]+:\d+/.exec(externalLink)?.[0]
    return urn
      ? { state: 'published', externalId: urn, url: externalLink }
      : { state: 'published', url: externalLink }
  }
  if (status === 'error') {
    const message =
      typeof error?.message === 'string' && error.message
        ? error.message
        : 'Buffer reported an error on the post without a message'
    return { state: 'failed', message }
  }
  // `sending`/`scheduled`, and also `draft`/`needs_approval` (a channel
  // with an approval policy): the latter never progress on their own and
  // settle `ambiguous` at the confirm timeout.
  return { state: 'pending' }
}

/**
 * The rows every phase shares: a refused key is `credential-expired`, a
 * throttle is `rate-limited` — both answered BEFORE Buffer did anything, so
 * they hold after the create was sent too. `null` for anything else.
 */
function keyOrThrottleFailure(answer: Answer): Failure | null {
  if (answer.kind === 'http') {
    if (answer.status === 401) return credentialExpired(answer.message)
    if (answer.status === 429) return rateLimited(answer)
  }
  if (answer.kind === 'errors') {
    if (answer.code === 'UNAUTHORIZED') return credentialExpired(answer.message)
    // Buffer documents throttling as an HTTP 429; this body-only form has
    // no Retry-After, so the engine's own backoff applies.
    if (answer.code === 'RATE_LIMIT_EXCEEDED') {
      return {
        ok: false,
        kind: 'rate-limited',
        message: `Buffer rate limit reached: ${answer.message}`,
      }
    }
  }
  return null
}

/** The channel check did not answer with a channel; nothing was created. */
function checkFailure(
  answer: Exclude<Answer, { kind: 'data' }>,
  platform: BufferPlatform,
): Failure {
  const refused = keyOrThrottleFailure(answer)
  if (refused) return refused
  if (
    answer.kind === 'errors' &&
    (answer.code === 'NOT_FOUND' || answer.code === 'FORBIDDEN')
  ) {
    return rejected(
      `The pinned channel id is not a channel this Buffer API key can use (${answer.message}) — check the channel id in Buffer and the tenant secret.`,
    )
  }
  // A 4xx on a fixed query is our bug, not weather: retrying every tick
  // only burns quota.
  if (answer.kind === 'http' && answer.status < 500) {
    return rejected(`Buffer refused the channel check: ${answer.message}`)
  }
  return {
    ok: false,
    kind: 'transient',
    message: `Buffer could not check the pinned ${SOCIAL_PLATFORM_LABELS[platform]} channel: ${answer.message}`,
  }
}

function httpAnswer(response: Response, message: string, now: Date): Answer {
  return {
    kind: 'http',
    status: response.status,
    message,
    retryAfter: retryAfterOf(response.headers.get('retry-after'), now),
  }
}

/** `Retry-After` is seconds on Buffer (guides/api-limits); an HTTP date is accepted too. */
function retryAfterOf(header: string | null, now: Date): Date | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(now.getTime() + seconds * 1000)
  }
  const date = Date.parse(header)
  return Number.isFinite(date) ? new Date(date) : undefined
}

function rateLimited(answer: Extract<Answer, { kind: 'http' }>): Failure {
  return {
    ok: false,
    kind: 'rate-limited',
    message: `Buffer rate limit reached: ${answer.message}`,
    ...(answer.retryAfter ? { retryAfter: answer.retryAfter } : {}),
  }
}

function rejected(message: string): Failure {
  return { ok: false, kind: 'rejected', message }
}

function credentialExpired(message: string): Failure {
  return { ok: false, kind: 'credential-expired', message: buffer401(message) }
}

function ambiguous(message: string): Failure {
  return {
    ok: false,
    kind: 'ambiguous',
    message: `Buffer did not confirm the create; the post may exist. Check the platform before posting again. (${message})`,
  }
}

function buffer401(message: string): string {
  return `Buffer refused the API key: ${message}. Create a new personal key in Buffer (Settings → API) and update the tenant secret.`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
