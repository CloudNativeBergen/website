import {
  Agent,
  AppBskyRichtextFacet,
  CredentialSession,
  RichText,
  XRPCError,
  type AppBskyEmbedExternal,
  type AppBskyEmbedImages,
  type AppBskyFeedPost,
  type ComAtprotoRepoUploadBlob,
} from '@atproto/api'
import type { BlueskyCredentials } from '@/lib/secrets/types'
import { fetchImageBytes, ImageFetchError, type ImageBytes } from './bytes'
import { PLATFORM_CONSTRAINTS, validatePublishInput } from './constraints'
import {
  fetchLinkCard,
  LINK_CARD_THUMB_MAX_BYTES,
  type HostResolver,
  type LinkCardSource,
} from './link-card'
import type {
  PublishContext,
  PublishFailureKind,
  PublishInput,
  PublishMedia,
  PublishOutcome,
  SocialPublishAdapter,
  ValidationIssue,
} from './types'

/**
 * `BlueskyPublishAdapter` (spec §4.1, #1005): an approved variant becomes an
 * `app.bsky.feed.post` on the conference's account.
 *
 *  - Credentials are INJECTED (docs/INTEGRATION_ADAPTERS.md): the app
 *    password bag the `bluesky` secret family resolved. Nothing ambient.
 *  - ONE login per publish (`createSession` is limited to 300/day/account),
 *    and a login that fails is never retried here — `credential-expired`
 *    is terminal for the state machine, so the organizer fixes the password
 *    rather than the cron burning the daily budget.
 *  - Facets come from `RichText.detectFacets` (UTF-8 byte offsets, never
 *    hand-computed). Bluesky does not unfurl, so the link card is built by
 *    us from our own page's metadata, with the tagged link as its `uri`.
 *  - Typed outcomes are the API. Everything BEFORE `createRecord` fires is a
 *    definite non-post (`transient` / `rejected` / …); once it has fired only
 *    a definitive 4xx answer counts as "not created" — everything else is
 *    `ambiguous`, which is what keeps the never-double-post invariant.
 */

export const BLUESKY_SERVICE = 'https://bsky.social'
/** `app.bsky.embed.images#image` blob cap (lexicon `maxSize`). */
export const BLUESKY_IMAGE_MAX_BYTES = 2_000_000
/**
 * Wall-clock budget for ONE publish (login, fetches, uploads, create). The
 * engine's `PUBLISH_RESERVE_MS` is built on it: budget + adapter
 * resolution + the settle write must fit inside the cron function's life,
 * so a stalled PDS returns a typed outcome instead of a stale claim.
 */
export const BLUESKY_PUBLISH_BUDGET_MS = 30_000
/** No single request may take longer than this, budget permitting. */
export const BLUESKY_CALL_TIMEOUT_MS = 15_000
/** Budget that must remain before `createRecord` is even attempted. */
const MIN_CREATE_BUDGET_MS = 5_000

export class PublishDeadlineError extends Error {
  constructor() {
    super('Publish budget exhausted before the request was made')
    this.name = 'PublishDeadlineError'
  }
}

/**
 * A `fetch` that refuses to start past `deadline` and aborts every request
 * at the earlier of its per-call timeout and the deadline. Caller-supplied
 * signals still apply.
 */
export function withDeadline(
  fetchImpl: typeof fetch,
  deadline: number,
  callTimeoutMs = BLUESKY_CALL_TIMEOUT_MS,
): typeof fetch {
  return (input, init) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return Promise.reject(new PublishDeadlineError())
    const signals = [AbortSignal.timeout(Math.min(callTimeoutMs, remaining))]
    if (init?.signal) signals.push(init.signal)
    return fetchImpl(input, { ...init, signal: AbortSignal.any(signals) })
  }
}

export interface BlueskyAdapterOptions {
  /** PDS entry point; the fixture tests point it at MSW. */
  service?: string
  /** Transport for the CDN rendition and the linked page. */
  fetch?: typeof fetch
  /**
   * The conference's own domains: the only hosts a link card is generated
   * for (and the only redirect targets). Empty = no card fetch at all; the
   * link still ships as a bare card.
   */
  linkCardHosts?: readonly string[]
  /** Hostname → addresses for the link-card host policy; tests inject one. */
  resolveHost?: HostResolver
  linkCard?: LinkCardSource
  now?: () => Date
  /** Test seams for the deadline; production uses the constants. */
  budgetMs?: number
  callTimeoutMs?: number
}

/** The strong ref persisted as `publishResult.externalId`. */
export interface BlueskyPostRef {
  uri: string
  cid: string
}

export function formatBlueskyExternalId(ref: BlueskyPostRef): string {
  return JSON.stringify({ uri: ref.uri, cid: ref.cid })
}

export function parseBlueskyExternalId(
  externalId: string | null | undefined,
): BlueskyPostRef | null {
  if (!externalId) return null
  try {
    const parsed: unknown = JSON.parse(externalId)
    return isPostRef(parsed) ? { uri: parsed.uri, cid: parsed.cid } : null
  } catch {
    return null
  }
}

function isPostRef(value: unknown): value is BlueskyPostRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { uri?: unknown }).uri === 'string' &&
    typeof (value as { cid?: unknown }).cid === 'string'
  )
}

/** `at://did/app.bsky.feed.post/rkey` → the bsky.app URL (DID-based: survives a handle change). */
export function blueskyPostUrl(uri: string): string | undefined {
  const match = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri)
  return match
    ? `https://bsky.app/profile/${match[1]}/post/${match[2]}`
    : undefined
}

type Phase = 'login' | 'prepare' | 'create'

/**
 * Pure: an error from one phase of the publish → the outcome kind. Only the
 * `create` phase can be `ambiguous`; before it fires nothing exists yet.
 */
export function classifyBlueskyError(
  phase: Phase,
  error: unknown,
): { kind: PublishFailureKind; message: string; retryAfter?: Date } {
  if (error instanceof ImageFetchError) {
    const kind = error.reason === 'unreachable' ? 'transient' : 'rejected'
    return { kind, message: `Image ${error.message}` }
  }
  const status = error instanceof XRPCError ? error.status : null
  const message = error instanceof Error ? error.message : String(error)
  if (status === 429) {
    return { kind: 'rate-limited', message, retryAfter: retryAfterOf(error) }
  }
  if (phase === 'login') {
    if (status === 400 || status === 401 || status === 403) {
      return {
        kind: 'credential-expired',
        message: `Bluesky login failed: ${message}`,
      }
    }
    return { kind: 'transient', message: `Bluesky login failed: ${message}` }
  }
  if (status === 401 || status === 403) {
    return { kind: 'credential-expired', message }
  }
  if (phase === 'prepare') {
    if (status !== null && status >= 400 && status < 500) {
      return { kind: 'rejected', message }
    }
    return { kind: 'transient', message }
  }
  // create: a definitive 4xx is "not created"; anything else may have landed.
  if (status !== null && status >= 400 && status < 500) {
    return { kind: 'rejected', message }
  }
  return {
    kind: 'ambiguous',
    message: `Bluesky createRecord did not answer: ${message}`,
  }
}

function retryAfterOf(error: unknown): Date | undefined {
  const headers = error instanceof XRPCError ? error.headers : undefined
  const reset = Number(headers?.['ratelimit-reset'])
  if (Number.isFinite(reset) && reset > 0) return new Date(reset * 1000)
  const retry = Number(headers?.['retry-after'])
  if (Number.isFinite(retry) && retry > 0)
    return new Date(Date.now() + retry * 1000)
  return undefined
}

type Blob = ComAtprotoRepoUploadBlob.OutputSchema['blob']
/** The record's `embed` union wants the discriminator as a literal. */
type ImagesEmbed = AppBskyEmbedImages.Main & { $type: 'app.bsky.embed.images' }
type ExternalEmbed = AppBskyEmbedExternal.Main & {
  $type: 'app.bsky.embed.external'
}

export class BlueskyPublishAdapter implements SocialPublishAdapter {
  readonly platform = 'bluesky' as const
  readonly constraints = PLATFORM_CONSTRAINTS.bluesky

  private readonly service: string
  private readonly fetchImpl: typeof fetch
  private readonly linkCard: LinkCardSource
  private readonly now: () => Date
  private readonly budgetMs: number
  private readonly callTimeoutMs: number

  constructor(
    private readonly credentials: BlueskyCredentials,
    options: BlueskyAdapterOptions = {},
  ) {
    this.service = options.service ?? BLUESKY_SERVICE
    this.fetchImpl = options.fetch ?? fetch
    const hosts = options.linkCardHosts ?? []
    this.linkCard =
      options.linkCard ??
      ((url, fetchImpl, { thumb }) =>
        fetchLinkCard(url, {
          allowedHosts: hosts,
          fetch: fetchImpl,
          thumb,
          resolve: options.resolveHost,
        }))
    this.now = options.now ?? (() => new Date())
    this.budgetMs = options.budgetMs ?? BLUESKY_PUBLISH_BUDGET_MS
    this.callTimeoutMs = options.callTimeoutMs ?? BLUESKY_CALL_TIMEOUT_MS
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
    const session = new CredentialSession(new URL(this.service), fetchImpl)
    try {
      await session.login({
        identifier: this.credentials.identifier,
        password: this.credentials.appPassword,
      })
    } catch (error) {
      return { ok: false, ...classifyBlueskyError('login', error) }
    }
    const agent = new Agent(session)

    let record: AppBskyFeedPost.Record
    try {
      record = await this.buildRecord(agent, input, fetchImpl)
    } catch (error) {
      return { ok: false, ...classifyBlueskyError('prepare', error) }
    }

    // Past this point a timeout is `ambiguous`; refuse to start the create
    // with too little budget so that outcome stays rare and honest.
    if (deadline - Date.now() < MIN_CREATE_BUDGET_MS) {
      return {
        ok: false,
        kind: 'transient',
        message:
          'Publish budget exhausted before the post was created (slow uploads or page fetch); it will be retried.',
      }
    }

    try {
      const result = await agent.post(record)
      const externalId = formatBlueskyExternalId(result)
      const url = blueskyPostUrl(result.uri)
      return url ? { ok: true, externalId, url } : { ok: true, externalId }
    } catch (error) {
      return { ok: false, ...classifyBlueskyError('create', error) }
    }
  }

  private async buildRecord(
    agent: Agent,
    input: PublishInput,
    fetchImpl: typeof fetch,
  ): Promise<AppBskyFeedPost.Record> {
    const richText = new RichText({ text: input.text })
    await richText.detectFacets(agent)
    const facets = resolvedFacets(richText.facets)

    // The embed slot holds the card OR images (spec §4.1 wants the card
    // with the tagged link as its uri); `validate` has already refused a
    // second image next to a link, so nothing is dropped here.
    const embed = input.link
      ? await this.externalEmbed(agent, input.link, input.media[0], fetchImpl)
      : input.media.length > 0
        ? await this.imagesEmbed(agent, input, fetchImpl)
        : undefined

    return {
      $type: 'app.bsky.feed.post',
      text: richText.text,
      createdAt: this.now().toISOString(),
      ...(facets.length > 0 ? { facets } : {}),
      ...(embed ? { embed } : {}),
    }
  }

  private async imagesEmbed(
    agent: Agent,
    input: PublishInput,
    fetchImpl: typeof fetch,
  ): Promise<ImagesEmbed> {
    const images: AppBskyEmbedImages.Image[] = []
    for (const media of input.media) {
      const image = await fetchImageBytes(
        media.url,
        BLUESKY_IMAGE_MAX_BYTES,
        fetchImpl,
        media.mimeType,
      )
      images.push({ image: await this.upload(agent, image), alt: media.alt })
    }
    return { $type: 'app.bsky.embed.images', images }
  }

  /**
   * The card: title and description from our page; the thumbnail is the
   * variant's own image when it has one (see `thumbnailOf`), else the
   * page's `og:image`, else none. The card's `uri` is always the link.
   */
  private async externalEmbed(
    agent: Agent,
    link: string,
    image: PublishMedia | undefined,
    fetchImpl: typeof fetch,
  ): Promise<ExternalEmbed> {
    let thumb: ImageBytes | null = null
    if (image) {
      thumb = await this.thumbnailOf(image, fetchImpl)
    }
    const card = await this.linkCard(link, fetchImpl, { thumb: thumb === null })
    thumb ??= card?.thumb ?? null
    const external: AppBskyEmbedExternal.External = {
      uri: link,
      title: card?.title || hostnameOf(link),
      description: card?.description ?? '',
    }
    if (thumb) external.thumb = await this.upload(agent, thumb)
    return { $type: 'app.bsky.embed.external', external }
  }

  /**
   * The variant's image as the card thumbnail. The thumb cap (1 MB) is
   * half the image cap, so a rendition that passed validation may still be
   * too large: the SAME image is then re-requested at smaller renditions
   * (see `thumbnailRendition`) — never a different picture than the
   * organizer approved. Still too large after the last step is a
   * rejection, not a silent swap.
   */
  private async thumbnailOf(
    image: PublishMedia,
    fetchImpl: typeof fetch,
  ): Promise<ImageBytes> {
    let url = image.url
    for (let step = 0; ; step++) {
      try {
        return await fetchImageBytes(
          url,
          LINK_CARD_THUMB_MAX_BYTES,
          fetchImpl,
          image.mimeType,
        )
      } catch (error) {
        const tooLarge =
          error instanceof ImageFetchError && error.reason === 'too-large'
        const smaller =
          tooLarge && step < THUMBNAIL_MAX_STEPS
            ? thumbnailRendition(url)
            : null
        if (!smaller) throw error
        url = smaller
      }
    }
  }

  private async upload(agent: Agent, image: ImageBytes): Promise<Blob> {
    const response = await agent.uploadBlob(image.bytes, {
      encoding: image.mimeType,
    })
    return response.data.blob
  }
}

/** First step down for a card thumbnail (well under the 1 MB cap for most images). */
export const THUMBNAIL_MAX_WIDTH = 1000
export const THUMBNAIL_QUALITY = 60
/** Narrower than this is not worth posting as a card image. */
export const THUMBNAIL_MIN_WIDTH = 320
/** How many times `thumbnailOf` steps a rendition down before giving up. */
export const THUMBNAIL_MAX_STEPS = 3

/**
 * The SAME Sanity rendition one step smaller: capped at the thumbnail
 * width first, then halved (never below the minimum), always at thumbnail
 * quality. `null` when the URL is not a CDN rendition or cannot shrink any
 * further — a dense image can be over the cap at any width.
 */
export function thumbnailRendition(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.hostname !== 'cdn.sanity.io') return null
  const width = Number(parsed.searchParams.get('w'))
  const quality = Number(parsed.searchParams.get('q'))
  const current = Number.isFinite(width) && width > 0 ? width : null
  const next =
    current === null || current > THUMBNAIL_MAX_WIDTH
      ? THUMBNAIL_MAX_WIDTH
      : Math.max(THUMBNAIL_MIN_WIDTH, Math.floor(current / 2))
  if (next === current && quality === THUMBNAIL_QUALITY) return null
  parsed.searchParams.set('w', String(next))
  parsed.searchParams.set('q', String(THUMBNAIL_QUALITY))
  return parsed.toString()
}

function hostnameOf(link: string): string {
  try {
    return new URL(link).hostname
  } catch {
    return link
  }
}

/**
 * `detectFacets` leaves a mention whose handle did not resolve with an empty
 * DID, which the PDS rejects; drop those features (the text still reads as
 * written) and any facet left without features.
 */
function resolvedFacets(
  facets: AppBskyRichtextFacet.Main[] | undefined,
): AppBskyRichtextFacet.Main[] {
  if (!facets) return []
  return facets
    .map((facet) => ({
      ...facet,
      features: facet.features.filter(
        (feature) => !(AppBskyRichtextFacet.isMention(feature) && !feature.did),
      ),
    }))
    .filter((facet) => facet.features.length > 0)
}
