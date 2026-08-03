import { isSafeRichTextHref } from '../portabletext/safeHref'

/**
 * The homepage Rich Text block's CONSTRAINED escape hatch.
 *
 * Every distinctive conference has exactly one weird thing no fixed section
 * vocabulary can express — a venue rendered as a Kubernetes manifest, a
 * community-logo wall, a hand-written explainer with a diagram. Rather than
 * open the closed section registry (see `sections.ts`) with a raw-HTML or embed
 * block, the EXISTING `homepageRichText` block grew a richer — still fully
 * allowlisted — content vocabulary:
 *
 *   block          prose, headings, lists, emphasis, safe links
 *   richTextCode   preformatted / code, rendered as TEXT (the YAML-manifest case)
 *   richTextImage  an image from the Sanity asset pipeline, with a caption
 *   richTextTable  a small plain-text table (a 2-column table IS a definition list)
 *   richTextCallout an aside in one of three house tones
 *
 * What is NOT expressible, by construction: there is no HTML string anywhere in
 * this model. Every field is either a literal from an allowlist below, a plain
 * string rendered as a React text child (so React escapes it), an href that
 * passed {@link isSafeRichTextHref}, or a Sanity image asset id that matched
 * {@link SANITY_IMAGE_REF_PATTERN}. No `<script>`, no `<iframe>`, no attributes,
 * no `javascript:`/`data:` URL, no event handler, and nothing in the render path
 * touches `dangerouslySetInnerHTML`.
 *
 * TWO-SIDED ENFORCEMENT. `HomepageRichTextContentSchema`
 * (`server/schemas/conference.ts`) REJECTS an unsafe payload on the way IN, so
 * an organizer gets a real error instead of silent data loss. This module's
 * {@link sanitizeRichTextContent} runs again on the way OUT, at render, and
 * never throws — because the tRPC mutation is not the only writer: Sanity Studio
 * and any dataset-level tooling bypass it entirely, and content stored before a
 * rule tightened is still out there. Neither side is trusted to be the only one.
 *
 * MULTI-TENANCY. Nothing here can reach outside the block: no field becomes a
 * network origin, a cookie scope, a redirect target or a script source, so a
 * payload authored by one tenant's organizer cannot affect another tenant's site
 * or the platform. The one cross-tenant surface is the image asset id — asset
 * ids are dataset-global, so tenant A CAN reference an asset tenant B uploaded.
 * That is image reuse within an already-shared, already-public CDN namespace,
 * not an escalation, and it is the same property `imageGallery` has today.
 *
 * DEPENDENCY-FREE on purpose (relative imports only, no React, no `@/` alias):
 * the Sanity Studio schema imports the allowlists from here so the Studio can
 * never author a shape the server would refuse.
 */

// === allowlists ==========================================================

/**
 * Block styles. `h1` is admitted because the pre-existing prose editor could
 * emit it (zero-migration), even though the block's own `heading` field is the
 * intended top level; `h5`/`h6` are not — they were never authorable here.
 */
export const RICH_TEXT_BLOCK_STYLES = [
  'normal',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
] as const

export const RICH_TEXT_LIST_TYPES = ['bullet', 'number'] as const

/** Inline marks. All map to a fixed house element — none carries attributes. */
export const RICH_TEXT_DECORATORS = [
  'strong',
  'em',
  'underline',
  'code',
  'strike-through',
] as const

/**
 * Code-block languages. This is a LABEL vocabulary, not a highlighter: the code
 * is rendered as text either way, so the list only has to be finite. `text` is
 * the fallback for anything unrecognised.
 */
export const RICH_TEXT_CODE_LANGUAGES = [
  'text',
  'yaml',
  'json',
  'bash',
  'dockerfile',
  'hcl',
  'sql',
  'go',
  'rust',
  'javascript',
  'typescript',
  'python',
  'java',
  'html',
  'css',
] as const

export const RICH_TEXT_CALLOUT_TONES = ['info', 'success', 'warning'] as const

/** The object types allowed ALONGSIDE `block` inside a rich-text content array. */
export const RICH_TEXT_OBJECT_TYPES = [
  'richTextCode',
  'richTextImage',
  'richTextTable',
  'richTextCallout',
] as const

/**
 * A Sanity IMAGE asset id: `image-<sha1>-<width>x<height>-<ext>`.
 *
 * Anchored and total, so it can only ever name an asset already inside our own
 * dataset — never an arbitrary origin. That is the whole point: an
 * organizer-supplied `<img src>` would be a visitor-tracking and data-exfil
 * beacon aimed at every reader of the page. `file-` assets are excluded (wrong
 * asset class), and so is `svg`: an SVG is an active document, and Sanity's CDN
 * serves it as `image/svg+xml` without rasterizing it.
 */
export const SANITY_IMAGE_REF_PATTERN =
  /^image-[a-f0-9]{40}-\d{1,5}x\d{1,5}-(jpg|jpeg|png|webp|gif|avif)$/

/** Upload-side mirror of the extensions {@link SANITY_IMAGE_REF_PATTERN} admits. */
export const RICH_TEXT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const

/**
 * Size caps. These are DoS ceilings, not editorial taste: an unbounded blob in
 * a conference document is a payload that has to be fetched, cached and parsed
 * on every homepage render for every visitor.
 */
export const RICH_TEXT_LIMITS = {
  blocks: 200,
  spanText: 5_000,
  spansPerBlock: 200,
  markDefsPerBlock: 50,
  listLevel: 5,
  code: 20_000,
  filename: 120,
  alt: 300,
  caption: 300,
  calloutTitle: 200,
  calloutBody: 2_000,
  tableRows: 60,
  tableColumns: 10,
  tableCell: 500,
} as const

export type RichTextBlockStyle = (typeof RICH_TEXT_BLOCK_STYLES)[number]
export type RichTextListType = (typeof RICH_TEXT_LIST_TYPES)[number]
export type RichTextCodeLanguage = (typeof RICH_TEXT_CODE_LANGUAGES)[number]
export type RichTextCalloutTone = (typeof RICH_TEXT_CALLOUT_TONES)[number]
export type RichTextObjectType = (typeof RICH_TEXT_OBJECT_TYPES)[number]

// === model ===============================================================

export interface RichTextSpan {
  _type: 'span'
  _key: string
  text: string
  marks: string[]
}

/** The ONLY annotation type. There is deliberately no second one. */
export interface RichTextLinkMarkDef {
  _type: 'link'
  _key: string
  href: string
}

export interface RichTextProseBlock {
  _type: 'block'
  _key: string
  style: RichTextBlockStyle
  listItem?: RichTextListType
  level?: number
  children: RichTextSpan[]
  markDefs: RichTextLinkMarkDef[]
}

/** Preformatted text. Rendered inside `<pre><code>` as a plain text child. */
export interface RichTextCodeBlock {
  _type: 'richTextCode'
  _key: string
  language: RichTextCodeLanguage
  filename?: string
  code: string
}

export interface RichTextImageBlock {
  _type: 'richTextImage'
  _key: string
  asset: { _type: 'reference'; _ref: string }
  alt: string
  caption?: string
}

export interface RichTextTableRow {
  _key: string
  cells: string[]
}

export interface RichTextTableBlock {
  _type: 'richTextTable'
  _key: string
  caption?: string
  headerRow: boolean
  rows: RichTextTableRow[]
}

export interface RichTextCalloutBlock {
  _type: 'richTextCallout'
  _key: string
  tone: RichTextCalloutTone
  title?: string
  body: string
}

export type RichTextObjectBlock =
  | RichTextCodeBlock
  | RichTextImageBlock
  | RichTextTableBlock
  | RichTextCalloutBlock

export type RichTextContentBlock = RichTextProseBlock | RichTextObjectBlock

// === sanitizer ===========================================================

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** A trimmed, length-capped string, or `undefined` when absent/blank/not a string. */
function optionalText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().slice(0, max)
  return trimmed ? trimmed : undefined
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

/**
 * Stable, collision-free keys. Sanity requires a `_key` on every array member,
 * and the sanitizer is the last place that can guarantee one — content can
 * arrive keyless from hand-written fixtures or older documents.
 */
function keyFactory(prefix: string) {
  const seen = new Set<string>()
  return (candidate: unknown, index: number): string => {
    const raw = typeof candidate === 'string' ? candidate.trim() : ''
    let key = raw && !seen.has(raw) ? raw : `${prefix}${index}`
    let bump = 0
    while (seen.has(key)) key = `${prefix}${index}_${++bump}`
    seen.add(key)
    return key
  }
}

function sanitizeProseBlock(
  raw: Record<string, unknown>,
  key: string,
): RichTextProseBlock | null {
  if (!Array.isArray(raw.children)) return null

  // markDefs FIRST: a span mark is only honoured when it names a markDef that
  // survived, so an unsafe link's mark falls away with it.
  const markDefKey = keyFactory('md')
  const markDefs: RichTextLinkMarkDef[] = []
  const rawMarkDefs = Array.isArray(raw.markDefs) ? raw.markDefs : []
  for (const entry of rawMarkDefs.slice(0, RICH_TEXT_LIMITS.markDefsPerBlock)) {
    const def = asRecord(entry)
    // An annotation with no usable `_key` cannot be referenced by any span, and
    // regenerating one here would silently re-point a span at the wrong link.
    if (!def || def._type !== 'link' || typeof def._key !== 'string') continue
    if (!def._key.trim() || !isSafeRichTextHref(def.href)) continue
    const finalKey = markDefKey(def._key, markDefs.length)
    if (finalKey !== def._key.trim()) continue // duplicate key — drop, never remap
    markDefs.push({
      _type: 'link',
      _key: finalKey,
      href: (def.href as string).trim(),
    })
  }
  const linkKeys = new Set(markDefs.map((d) => d._key))

  const spanKey = keyFactory('s')
  const children: RichTextSpan[] = []
  for (const entry of raw.children.slice(0, RICH_TEXT_LIMITS.spansPerBlock)) {
    const span = asRecord(entry)
    if (!span || span._type !== 'span' || typeof span.text !== 'string')
      continue
    const marks = (Array.isArray(span.marks) ? span.marks : []).filter(
      (m): m is string =>
        typeof m === 'string' &&
        ((RICH_TEXT_DECORATORS as readonly string[]).includes(m) ||
          linkKeys.has(m)),
    )
    children.push({
      _type: 'span',
      _key: spanKey(span._key, children.length),
      text: span.text.slice(0, RICH_TEXT_LIMITS.spanText),
      marks: Array.from(new Set(marks)),
    })
  }
  if (children.length === 0) return null

  // Drop markDefs no surviving span references, so we never store dead links.
  const usedMarks = new Set(children.flatMap((c) => c.marks))

  const block: RichTextProseBlock = {
    _type: 'block',
    _key: key,
    style: oneOf(raw.style, RICH_TEXT_BLOCK_STYLES, 'normal'),
    children,
    markDefs: markDefs.filter((d) => usedMarks.has(d._key)),
  }

  if (
    typeof raw.listItem === 'string' &&
    (RICH_TEXT_LIST_TYPES as readonly string[]).includes(raw.listItem)
  ) {
    block.listItem = raw.listItem as RichTextListType
    const level = typeof raw.level === 'number' ? Math.floor(raw.level) : 1
    block.level = Math.min(Math.max(level, 1), RICH_TEXT_LIMITS.listLevel)
  }

  return block
}

function sanitizeCodeBlock(
  raw: Record<string, unknown>,
  key: string,
): RichTextCodeBlock | null {
  if (typeof raw.code !== 'string' || !raw.code.trim()) return null
  const block: RichTextCodeBlock = {
    _type: 'richTextCode',
    _key: key,
    language: oneOf(raw.language, RICH_TEXT_CODE_LANGUAGES, 'text'),
    // Interior whitespace is the POINT of a code block — only the length is
    // capped and only trailing newlines are trimmed.
    code: raw.code.replace(/\s+$/, '').slice(0, RICH_TEXT_LIMITS.code),
  }
  const filename = optionalText(raw.filename, RICH_TEXT_LIMITS.filename)
  if (filename) block.filename = filename
  return block
}

function sanitizeImageBlock(
  raw: Record<string, unknown>,
  key: string,
): RichTextImageBlock | null {
  const asset = asRecord(raw.asset)
  const ref = asset?._ref
  if (typeof ref !== 'string' || !SANITY_IMAGE_REF_PATTERN.test(ref))
    return null
  const block: RichTextImageBlock = {
    _type: 'richTextImage',
    _key: key,
    asset: { _type: 'reference', _ref: ref },
    // Empty alt is MEANINGFUL (decorative) and must survive as `''`.
    alt: optionalText(raw.alt, RICH_TEXT_LIMITS.alt) ?? '',
  }
  const caption = optionalText(raw.caption, RICH_TEXT_LIMITS.caption)
  if (caption) block.caption = caption
  return block
}

function sanitizeTableBlock(
  raw: Record<string, unknown>,
  key: string,
): RichTextTableBlock | null {
  if (!Array.isArray(raw.rows)) return null
  const rowKey = keyFactory('r')
  const rows: RichTextTableRow[] = []
  for (const entry of raw.rows.slice(0, RICH_TEXT_LIMITS.tableRows)) {
    const row = asRecord(entry)
    if (!row || !Array.isArray(row.cells)) continue
    const cells = row.cells
      .slice(0, RICH_TEXT_LIMITS.tableColumns)
      .map((cell) =>
        typeof cell === 'string'
          ? cell.trim().slice(0, RICH_TEXT_LIMITS.tableCell)
          : '',
      )
    // An all-blank row renders as an empty stripe — and a table of nothing but
    // blank rows is an untouched editor card that must not reach the page.
    if (cells.length === 0 || cells.every((c) => c === '')) continue
    rows.push({ _key: rowKey(row._key, rows.length), cells })
  }
  if (rows.length === 0) return null

  // Ragged rows would collapse the grid — pad to the widest row.
  const width = Math.max(...rows.map((r) => r.cells.length))
  for (const row of rows) {
    while (row.cells.length < width) row.cells.push('')
  }

  const block: RichTextTableBlock = {
    _type: 'richTextTable',
    _key: key,
    headerRow: raw.headerRow !== false,
    rows,
  }
  const caption = optionalText(raw.caption, RICH_TEXT_LIMITS.caption)
  if (caption) block.caption = caption
  return block
}

function sanitizeCalloutBlock(
  raw: Record<string, unknown>,
  key: string,
): RichTextCalloutBlock | null {
  const body = optionalText(raw.body, RICH_TEXT_LIMITS.calloutBody)
  if (!body) return null
  const block: RichTextCalloutBlock = {
    _type: 'richTextCallout',
    _key: key,
    tone: oneOf(raw.tone, RICH_TEXT_CALLOUT_TONES, 'info'),
    body,
  }
  const title = optionalText(raw.title, RICH_TEXT_LIMITS.calloutTitle)
  if (title) block.title = title
  return block
}

/**
 * Coerce arbitrary stored data into the allowlisted model. NEVER throws and
 * never propagates an unrecognised shape: an entry that is not one of the five
 * known types, or that cannot be repaired into a valid one, is DROPPED.
 *
 * This is the render-side half of the two-sided contract described at the top of
 * this file — call it before handing content to `PortableText`, on every path,
 * including paths whose data came through the validating mutation.
 */
export function sanitizeRichTextContent(
  value: unknown,
): RichTextContentBlock[] {
  if (!Array.isArray(value)) return []
  const blockKey = keyFactory('b')
  const out: RichTextContentBlock[] = []
  for (const entry of value.slice(0, RICH_TEXT_LIMITS.blocks)) {
    const raw = asRecord(entry)
    if (!raw) continue
    const key = blockKey(raw._key, out.length)
    let block: RichTextContentBlock | null = null
    switch (raw._type) {
      case 'block':
        block = sanitizeProseBlock(raw, key)
        break
      case 'richTextCode':
        block = sanitizeCodeBlock(raw, key)
        break
      case 'richTextImage':
        block = sanitizeImageBlock(raw, key)
        break
      case 'richTextTable':
        block = sanitizeTableBlock(raw, key)
        break
      case 'richTextCallout':
        block = sanitizeCalloutBlock(raw, key)
        break
      default:
        block = null
    }
    if (block) out.push(block)
  }
  return out
}

/** True when nothing would render — the block should be skipped entirely. */
export function isRichTextContentEmpty(
  blocks: RichTextContentBlock[],
): boolean {
  return blocks.every(
    (b) =>
      b._type === 'block' &&
      b.children.every((c) => c.text.trim().length === 0),
  )
}

// === admin editor segments ===============================================

/**
 * The admin editor's working shape. The stored content is ONE flat ordered
 * array, but the prose editor (`@portabletext/editor`) only understands `block`
 * items — so contiguous runs of prose collapse into a single `prose` segment
 * with its own editor instance, and each non-prose block becomes its own card.
 * Order is preserved exactly, which is what lets an organizer put a paragraph
 * BETWEEN two code blocks instead of appending everything at the end.
 */
export type RichTextSegment =
  | { kind: 'prose'; _key: string; blocks: RichTextProseBlock[] }
  | { kind: 'object'; _key: string; block: RichTextObjectBlock }

let segmentCounter = 0
export const nextRichTextKey = (prefix = 'rt') =>
  `${prefix}-${Date.now().toString(36)}-${++segmentCounter}`

export function toRichTextSegments(value: unknown): RichTextSegment[] {
  const segments: RichTextSegment[] = []
  for (const block of sanitizeRichTextContent(value)) {
    const last = segments[segments.length - 1]
    if (block._type === 'block') {
      if (last?.kind === 'prose') last.blocks.push(block)
      else
        segments.push({
          kind: 'prose',
          _key: nextRichTextKey('prose'),
          blocks: [block],
        })
    } else {
      segments.push({ kind: 'object', _key: block._key, block })
    }
  }
  return segments
}

/** Flatten segments back to the stored array. Inverse of {@link toRichTextSegments}. */
export function fromRichTextSegments(
  segments: RichTextSegment[],
): RichTextContentBlock[] {
  return segments.flatMap<RichTextContentBlock>((segment) =>
    segment.kind === 'prose' ? segment.blocks : [segment.block],
  )
}

/** A blank block of each kind, for the editor's "Add …" buttons. */
export function emptyRichTextBlock(
  type: RichTextObjectType,
): RichTextObjectBlock {
  const _key = nextRichTextKey(type)
  switch (type) {
    case 'richTextCode':
      return { _type: 'richTextCode', _key, language: 'yaml', code: '' }
    case 'richTextImage':
      return {
        _type: 'richTextImage',
        _key,
        asset: { _type: 'reference', _ref: '' },
        alt: '',
      }
    case 'richTextTable':
      return {
        _type: 'richTextTable',
        _key,
        headerRow: true,
        rows: [
          { _key: nextRichTextKey('r'), cells: ['', ''] },
          { _key: nextRichTextKey('r'), cells: ['', ''] },
        ],
      }
    case 'richTextCallout':
      return { _type: 'richTextCallout', _key, tone: 'info', body: '' }
  }
}

/** Human labels for the editor's add-menu and segment cards. */
export const RICH_TEXT_OBJECT_LABELS: Record<RichTextObjectType, string> = {
  richTextCode: 'Code / preformatted',
  richTextImage: 'Image',
  richTextTable: 'Table',
  richTextCallout: 'Callout',
}
