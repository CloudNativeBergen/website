/**
 * The `postMessage` contract between the homepage COMPOSER (parent document)
 * and the live PREVIEW (same-origin iframe).
 *
 * WHY A MODULE. The two ends of this channel live in different documents and
 * will be edited by different batches; a shared, typed, unit-tested vocabulary
 * is the only thing that keeps them speaking the same language. Nothing here
 * touches the DOM or React — it is a pure leaf module, like `./editor`.
 *
 * THE HANDSHAKE, and why it is idempotent in both directions:
 *
 *   iframe mounts ──▶ `konf-preview-ready`
 *                 ◀── `konf-preview-state` (the parent's CURRENT state)
 *   …edits…       ◀── `konf-preview-state` (debounced)
 *   band hover    ──▶ `konf-preview-hover`
 *   band click    ──▶ `konf-preview-select`
 *   after layout  ──▶ `konf-preview-size`
 *
 * The iframe re-posts `ready` after ANY reload — HMR, a session refresh, a
 * navigation inside the frame — and the parent answers every `ready` with the
 * last state it has. Neither side keeps a "handshake done" flag, so a reload on
 * either end heals without a reconnect protocol.
 *
 * SECURITY. Every message carries `type` and `v`, and both ends MUST check
 * `event.origin` against their own origin before trusting a payload: this origin
 * also serves tenant-authored public pages, so `event.source` alone proves
 * nothing. {@link isPreviewMessageEvent} is the one place that check lives.
 * Unknown types and version mismatches are IGNORED, never thrown on — a newer
 * deploy on one side of the boundary must degrade to "no live updates", not to a
 * broken editor.
 */

import type { HomepageSection } from './sections'

/** Bumped only on a BREAKING change; a mismatched version is ignored. */
export const PREVIEW_PROTOCOL_VERSION = 1

/** Which truth the preview is showing. See the mode contract in the composer. */
export type PreviewMode =
  /** Placeholders on, self-hiding bands ghosted, sample content chipped. */
  | 'design'
  /** Byte-for-byte what a visitor gets: no placeholders, nothing ghosted. */
  | 'live'

/** The preview's own colour scheme, independent of the admin document's. */
export type PreviewColorScheme = 'light' | 'dark'

/** Which viewport the preview is framed at. */
export type PreviewDevice = 'desktop' | 'mobile'

/** The layout width, in CSS pixels, each device frame gives the iframe. */
export const PREVIEW_DEVICE_WIDTH: Record<PreviewDevice, number> = {
  /** A real phone viewport — rendered 1:1, never scaled. */
  mobile: 390,
  /** The desktop layout width; the iframe ELEMENT is scaled down to the pane. */
  desktop: 1440,
}

export const PREVIEW_MESSAGE_TYPES = {
  ready: 'konf-preview-ready',
  state: 'konf-preview-state',
  hover: 'konf-preview-hover',
  select: 'konf-preview-select',
  size: 'konf-preview-size',
} as const

/** The UI half of a state push — everything that is not the section list. */
export interface PreviewUiState {
  mode: PreviewMode
  scheme: PreviewColorScheme
  /** `_key` of the section whose config is open in the rail, if any. */
  focusKey: string | null
  /** `_key` of the section hovered in the rail, if any. */
  hoverKey: string | null
}

/** iframe → parent: "I am mounted; send me the current state." */
export interface PreviewReadyMessage {
  type: typeof PREVIEW_MESSAGE_TYPES.ready
  v: typeof PREVIEW_PROTOCOL_VERSION
}

/** parent → iframe: the unsaved composition plus the toolbar's UI state. */
export interface PreviewStateMessage {
  type: typeof PREVIEW_MESSAGE_TYPES.state
  v: typeof PREVIEW_PROTOCOL_VERSION
  /**
   * The sections to render, serialized through the SAME function the Save path
   * uses. That is deliberate: when the preview drops an unfinished FAQ item or
   * a blank CTA, it is telling the truth about what would be stored.
   */
  sections: HomepageSection[]
  ui: PreviewUiState
}

/** iframe → parent: a band was hovered (`null` on leave). */
export interface PreviewHoverMessage {
  type: typeof PREVIEW_MESSAGE_TYPES.hover
  v: typeof PREVIEW_PROTOCOL_VERSION
  key: string | null
}

/** iframe → parent: a band was clicked; focus its config in the rail. */
export interface PreviewSelectMessage {
  type: typeof PREVIEW_MESSAGE_TYPES.select
  v: typeof PREVIEW_PROTOCOL_VERSION
  key: string
}

/** iframe → parent: the rendered document height, so the pane can size itself. */
export interface PreviewSizeMessage {
  type: typeof PREVIEW_MESSAGE_TYPES.size
  v: typeof PREVIEW_PROTOCOL_VERSION
  height: number
}

/** Anything the parent may send to the preview. */
export type PreviewInboundMessage = PreviewStateMessage

/** Anything the preview may send to the parent. */
export type PreviewOutboundMessage =
  | PreviewReadyMessage
  | PreviewHoverMessage
  | PreviewSelectMessage
  | PreviewSizeMessage

export type PreviewMessage = PreviewInboundMessage | PreviewOutboundMessage

/* -------------------------------------------------------------------------- */
/* Constructors — so neither end hand-writes an envelope                       */
/* -------------------------------------------------------------------------- */

export function previewReadyMessage(): PreviewReadyMessage {
  return { type: PREVIEW_MESSAGE_TYPES.ready, v: PREVIEW_PROTOCOL_VERSION }
}

export function previewStateMessage(
  sections: HomepageSection[],
  ui: PreviewUiState,
): PreviewStateMessage {
  return {
    type: PREVIEW_MESSAGE_TYPES.state,
    v: PREVIEW_PROTOCOL_VERSION,
    sections,
    ui,
  }
}

export function previewHoverMessage(key: string | null): PreviewHoverMessage {
  return { type: PREVIEW_MESSAGE_TYPES.hover, v: PREVIEW_PROTOCOL_VERSION, key }
}

export function previewSelectMessage(key: string): PreviewSelectMessage {
  return {
    type: PREVIEW_MESSAGE_TYPES.select,
    v: PREVIEW_PROTOCOL_VERSION,
    key,
  }
}

export function previewSizeMessage(height: number): PreviewSizeMessage {
  return {
    type: PREVIEW_MESSAGE_TYPES.size,
    v: PREVIEW_PROTOCOL_VERSION,
    height,
  }
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                      */
/* -------------------------------------------------------------------------- */

function isEnvelope(data: unknown): data is { type: string; v: number } {
  if (typeof data !== 'object' || data === null) return false
  const candidate = data as { type?: unknown; v?: unknown }
  return (
    typeof candidate.type === 'string' &&
    candidate.v === PREVIEW_PROTOCOL_VERSION
  )
}

const OUTBOUND_TYPES: ReadonlySet<string> = new Set([
  PREVIEW_MESSAGE_TYPES.ready,
  PREVIEW_MESSAGE_TYPES.hover,
  PREVIEW_MESSAGE_TYPES.select,
  PREVIEW_MESSAGE_TYPES.size,
])

/**
 * A parent → iframe state push. Structural, not just tag-based: a message whose
 * `sections` is not an array would crash the renderer, so it is not a state
 * message as far as this protocol is concerned.
 */
export function isPreviewStateMessage(
  data: unknown,
): data is PreviewStateMessage {
  if (!isEnvelope(data)) return false
  if (data.type !== PREVIEW_MESSAGE_TYPES.state) return false
  const candidate = data as Partial<PreviewStateMessage>
  if (!Array.isArray(candidate.sections)) return false
  const ui = candidate.ui as Partial<PreviewUiState> | undefined
  if (typeof ui !== 'object' || ui === null) return false
  return (
    (ui.mode === 'design' || ui.mode === 'live') &&
    (ui.scheme === 'light' || ui.scheme === 'dark')
  )
}

export function isPreviewReadyMessage(
  data: unknown,
): data is PreviewReadyMessage {
  return isEnvelope(data) && data.type === PREVIEW_MESSAGE_TYPES.ready
}

/** Any well-formed iframe → parent message. */
export function isPreviewOutboundMessage(
  data: unknown,
): data is PreviewOutboundMessage {
  if (!isEnvelope(data)) return false
  if (!OUTBOUND_TYPES.has(data.type)) return false
  const candidate = data as Record<string, unknown>
  switch (data.type) {
    case PREVIEW_MESSAGE_TYPES.hover:
      return candidate.key === null || typeof candidate.key === 'string'
    case PREVIEW_MESSAGE_TYPES.select:
      return typeof candidate.key === 'string'
    case PREVIEW_MESSAGE_TYPES.size:
      return typeof candidate.height === 'number'
    default:
      return true
  }
}

/**
 * The ORIGIN CHECK, in one place so neither end can forget it.
 *
 * The composer and the preview are the same origin by construction (a
 * same-origin iframe on an admin route), so anything from another origin is
 * either a browser extension or an attack, and is dropped without inspection.
 * `expectedOrigin` is passed in rather than read from `location` so this stays a
 * pure function.
 */
export function isPreviewMessageEvent(
  event: Pick<MessageEvent, 'origin' | 'data'>,
  expectedOrigin: string,
): boolean {
  return event.origin === expectedOrigin && isEnvelope(event.data)
}
