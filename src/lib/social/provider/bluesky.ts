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
import {
  countLength,
  PLATFORM_CONSTRAINTS,
  validatePublishInput,
} from './constraints'
import { fetchLinkCard, type LinkCardSource } from './link-card'
import type {
  PublishFailureKind,
  PublishInput,
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
/** `app.bsky.feed.post.text` is capped in graphemes AND UTF-8 bytes. */
export const BLUESKY_TEXT_MAX_BYTES = 3000

export interface BlueskyAdapterOptions {
  /** PDS entry point; the fixture tests point it at MSW. */
  service?: string
  /** Transport for the CDN rendition and the linked page. */
  fetch?: typeof fetch
  linkCard?: LinkCardSource
  now?: () => Date
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
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as BlueskyPostRef).uri === 'string' &&
      typeof (parsed as BlueskyPostRef).cid === 'string'
    ) {
      return {
        uri: (parsed as BlueskyPostRef).uri,
        cid: (parsed as BlueskyPostRef).cid,
      }
    }
  } catch {
    // not ours
  }
  return null
}

/** `at://did/app.bsky.feed.post/rkey` → the bsky.app URL (DID-based: survives a handle change). */
export function blueskyPostUrl(uri: string): string | undefined {
  const match = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri)
  return match
    ? `https://bsky.app/profile/${match[1]}/post/${match[2]}`
    : undefined
}

/**
 * Bluesky's embed slot holds images OR an external card, never both. With
 * images the link must live in the body; the adapter appends it on its own
 * line when the organizer did not write it, so attribution never silently
 * drops. Pure, so `validate` measures what will actually be posted.
 */
export function effectiveText(input: PublishInput): string {
  if (!input.link || input.media.length === 0) return input.text
  return input.text.includes(input.link)
    ? input.text
    : `${input.text.trimEnd()}\n${input.link}`
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
    const kind = error.reason === 'unavailable' ? 'transient' : 'rejected'
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

  constructor(
    private readonly credentials: BlueskyCredentials,
    options: BlueskyAdapterOptions = {},
  ) {
    this.service = options.service ?? BLUESKY_SERVICE
    this.fetchImpl = options.fetch ?? fetch
    this.linkCard =
      options.linkCard ?? ((url) => fetchLinkCard(url, this.fetchImpl))
    this.now = options.now ?? (() => new Date())
  }

  validate(input: PublishInput): ValidationIssue[] {
    const issues = validatePublishInput(this.constraints, input)
    const text = effectiveText(input)
    if (text !== input.text) {
      const length = countLength(text, this.constraints.counting)
      if (length > this.constraints.maxLength) {
        issues.push({
          field: 'body',
          message: `With images the link goes into the text: ${length} characters, the limit is ${this.constraints.maxLength}.`,
        })
      }
    }
    const bytes = new TextEncoder().encode(text).byteLength
    if (bytes > BLUESKY_TEXT_MAX_BYTES) {
      issues.push({
        field: 'body',
        message: `${bytes} bytes, Bluesky's limit is ${BLUESKY_TEXT_MAX_BYTES}.`,
      })
    }
    return issues
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

    const session = new CredentialSession(new URL(this.service))
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
      record = await this.buildRecord(agent, input)
    } catch (error) {
      return { ok: false, ...classifyBlueskyError('prepare', error) }
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
  ): Promise<AppBskyFeedPost.Record> {
    const richText = new RichText({ text: effectiveText(input) })
    await richText.detectFacets(agent)
    const facets = resolvedFacets(richText.facets)

    const embed =
      input.media.length > 0
        ? await this.imagesEmbed(agent, input)
        : input.link
          ? await this.externalEmbed(agent, input.link)
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
  ): Promise<ImagesEmbed> {
    const images: AppBskyEmbedImages.Image[] = []
    for (const media of input.media) {
      const image = await fetchImageBytes(
        media.url,
        BLUESKY_IMAGE_MAX_BYTES,
        this.fetchImpl,
        media.mimeType,
      )
      images.push({ image: await this.upload(agent, image), alt: media.alt })
    }
    return { $type: 'app.bsky.embed.images', images }
  }

  private async externalEmbed(
    agent: Agent,
    link: string,
  ): Promise<ExternalEmbed> {
    const card = await this.linkCard(link)
    const external: AppBskyEmbedExternal.External = {
      uri: link,
      title: card?.title || hostnameOf(link),
      description: card?.description ?? '',
    }
    if (card?.thumb) external.thumb = await this.upload(agent, card.thumb)
    return { $type: 'app.bsky.embed.external', external }
  }

  private async upload(agent: Agent, image: ImageBytes): Promise<Blob> {
    const response = await agent.uploadBlob(image.bytes, {
      encoding: image.mimeType,
    })
    return response.data.blob
  }
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
