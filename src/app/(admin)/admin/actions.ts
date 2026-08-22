'use server'

import { Conference } from '@/lib/conference/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { clientWrite } from '@/lib/sanity/client'
import { WIDGET_REGISTRY } from '@/lib/dashboard/widget-registry'
import {
  isDashboardWidgetKey,
  loadDashboardWidgetData,
  needsScheduleExpansion,
  type DashboardBatch,
  type DashboardWidgetKey,
} from '@/lib/dashboard/widget-data'
import { resolveConferenceId } from '@/server/trpc'

// --- Auth ---

async function requireOrganizer(): Promise<void> {
  const session = await getAuthSession()
  // ORG-SCOPED (CaaS T1-2, #614): organizer of the CURRENT domain's org. No
  // bridges — an unresolvable org, or a token without `organizerOrgIds`, denies.
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
    throw new Error('Unauthorized: organizer access required')
  }
}

// --- Conference resolution ---
//
// NONE of the actions in this file accept a conference or conferenceId from
// the client. The conference is always resolved server-side from the request
// domain (`resolveConferenceId()` — the same helper the tRPC routers use — or
// `resolveConference()` below when an action needs conference FIELDS such as
// dates, checkin ids or budgets). Trusting a client-supplied conference here
// would let any organizer read another tenant's data — or, worse for the
// ticket-sales widget, point the server's Checkin credentials at arbitrary
// customer/event ids.

/**
 * Domain-resolved conference document for actions that need conference fields
 * (dates, phase, checkin ids, budgets, schedules). Server-side counterpart of
 * {@link resolveConferenceId} that returns the full document.
 */
async function resolveConference(
  options: Parameters<typeof getConferenceForCurrentDomain>[0] = {},
): Promise<Conference> {
  const { conference, error } = await getConferenceForCurrentDomain(options)
  if (error || !conference?._id) {
    throw new Error('Could not resolve conference from request domain')
  }
  return conference
}

/**
 * Like {@link requireOrganizer} but also returns the caller's identity, for
 * actions that scope data to the CURRENT organizer (e.g. per-organizer
 * dashboard configs). The speaker id comes from the server session — never
 * from client input.
 */
async function requireOrganizerSession(): Promise<{ speakerId: string }> {
  const session = await getAuthSession()
  // ORG-SCOPED (CaaS T1-2, #614): same org gate as requireOrganizer, but also
  // returns the caller's server-derived speaker id for per-organizer scoping.
  if (
    !session?.speaker?._id ||
    !(await isOrganizerForCurrentOrg(session.speaker))
  ) {
    throw new Error('Unauthorized: organizer access required')
  }
  return { speakerId: session.speaker._id }
}

// --- Dashboard widget data (ONE round-trip) ---

/**
 * The dashboard's single data action.
 *
 * WHAT REPLACED WHAT. There used to be thirteen exported actions here, one per
 * widget, each re-running `requireOrganizer()`, re-resolving the conference and
 * issuing its own 1-3 GROQ queries — roughly 20 Sanity round-trips for a default
 * dashboard, on EVERY human pageview, and the single largest per-pageview cost
 * against the project's API quota. This action does the authorization pass once,
 * resolves the conference once, and composes the widgets' reads into one GROQ
 * object projection (`@/lib/dashboard/aggregate`).
 *
 * AUTHORIZATION IS UNCHANGED, not relaxed. Every widget's data was gated by
 * `requireOrganizer()` and by nothing else; the gate below is that same gate,
 * evaluated once for a request that returns the same data set. Two per-widget
 * gates that are NOT organizer-membership survive intact downstream, because
 * they are different questions:
 *
 *   - `ticket-sales` still passes through `resolveTicketingAdminAccess`, an
 *     ENTITLEMENT/kill-switch check on the organization, not on the viewer.
 *   - `my-areas` still shows a metric only for teams the viewer is on, and its
 *     count roots are only emitted for those teams.
 *
 * `widgetKeys` selects WHICH widgets to compute. It is caller-supplied and
 * therefore untrusted, but it is not a tenant key and cannot become one: unknown
 * strings are dropped against `WIDGET_REGISTRY`, and the conference is resolved
 * from the request domain regardless of what the client sends. Passing a single
 * key is how a widget fetches on its own (e.g. a retry after an error).
 *
 * PER-WIDGET FAILURE ISOLATION. The result is a map of SETTLED results: a widget
 * whose source fails carries `{ ok: false }` and every other widget still
 * renders, exactly as when each had its own action.
 */
export async function fetchDashboardData(
  widgetKeys: string[],
): Promise<DashboardBatch> {
  await requireOrganizer()

  // Untrusted input, narrowed to the registry. Deduplicated so a dashboard with
  // two instances of the same widget still computes it once.
  const keys: DashboardWidgetKey[] = Array.from(
    new Set(
      (Array.isArray(widgetKeys) ? widgetKeys : []).filter(
        (key): key is DashboardWidgetKey =>
          isDashboardWidgetKey(key) && key in WIDGET_REGISTRY,
      ),
    ),
  )
  if (keys.length === 0) return {}

  // ONE resolution. The schedule-expanded document is a different (heavier)
  // read, so it is only asked for when the schedule widget is on the dashboard.
  //
  // `schedule: true` dereferences schedules[] (tracks + slots); with
  // `confirmedTalksOnly: false` every assigned slot counts toward fill,
  // regardless of the talk's status — this is an admin progress view.
  const conference = needsScheduleExpansion(keys)
    ? await resolveConference({ schedule: true, confirmedTalksOnly: false })
    : await resolveConference()

  const session = await getAuthSession()

  return loadDashboardWidgetData(
    {
      conference,
      conferenceId: conference._id,
      speakerId: session?.speaker?._id ?? null,
    },
    keys,
  )
}

// --- Dashboard Config Persistence ---
//
// Layouts are PER-ORGANIZER: each organizer has their own dashboardConfig doc,
// identified deterministically as `dashboardConfig-<conferenceId>-<speakerId>`
// and carrying a `speaker` reference. The legacy conference-wide doc (no
// speaker reference) is kept READ-ONLY as the first-visit default: it is
// consulted by load when no personal doc exists, and never written again.
//
// Both actions take NO conferenceId from the client — the conference is
// resolved server-side from the request domain (resolveConferenceId, same
// helper the tRPC routers use) and the speaker id comes from the session.

interface DashboardConfigWidget {
  _key: string
  widgetId: string
  widgetType: string
  title: string
  row: number
  col: number
  rowSpan: number
  colSpan: number
  config?: string
}

interface DashboardConfigDocument {
  _id: string
  _type: 'dashboardConfig'
  conference: { _ref: string; _type: 'reference' }
  speaker?: { _ref: string; _type: 'reference' }
  preset?: string
  widgets?: DashboardConfigWidget[]
}

export interface SerializedWidget {
  id: string
  type: string
  title: string
  position: { row: number; col: number; rowSpan: number; colSpan: number }
  config?: Record<string, unknown>
}

/**
 * Deterministic id for an organizer's personal dashboard config. Both inputs
 * are Sanity document ids (letters/digits/dots/dashes/underscores), but any
 * other character is sanitized defensively so the result is always a valid
 * Sanity `_id`. Determinism makes saves race-free: concurrent saves by the
 * same user `createOrReplace` the SAME doc instead of racing a
 * fetch-then-create into duplicates.
 */
function personalDashboardConfigId(
  conferenceId: string,
  speakerId: string,
): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '-')
  // The conference id's LENGTH is encoded into the id so the two source ids
  // are unambiguously delimited: because ids may themselves contain "-", a
  // bare separator would let distinct (conference, speaker) pairs collide
  // (e.g. "a-b"/"c" vs "a"/"b-c"). With the length prefix the mapping is
  // injective for any inputs the sanitizer leaves distinct.
  const conf = clean(conferenceId)
  return `dashboardConfig-${conf.length}-${conf}-${clean(speakerId)}`
}

// --- Server-side validation limits for saved layouts ---
const MAX_WIDGETS = 40
const MAX_TITLE_LENGTH = 200
const MAX_ROW = 500
const MAX_COL = 11
const MAX_ROW_SPAN = 24
const MAX_COL_SPAN = 12
const MAX_CONFIG_JSON_BYTES = 8 * 1024

/**
 * Validates a layout before it is written. The canonical widget-type list is
 * the registry itself (Object.keys(WIDGET_REGISTRY)) so it can never drift
 * from the real widget set — the registry module is metadata + zod only (no
 * React components), so importing it server-side is safe.
 *
 * Note the save/load asymmetry: SAVE rejects unknown widget types, but LOAD
 * keeps tolerating unknown STORED types (the renderer shows a "Widget not
 * available" placeholder) so old docs never break the dashboard.
 */
function validateDashboardWidgets(widgets: SerializedWidget[]): void {
  if (!Array.isArray(widgets)) {
    throw new Error('Invalid dashboard config: widgets must be an array')
  }
  if (widgets.length > MAX_WIDGETS) {
    throw new Error(
      `Invalid dashboard config: at most ${MAX_WIDGETS} widgets allowed (got ${widgets.length})`,
    )
  }

  const validTypes = new Set(Object.keys(WIDGET_REGISTRY))

  for (const w of widgets) {
    if (typeof w.id !== 'string' || !w.id || w.id.length > MAX_TITLE_LENGTH) {
      throw new Error(
        `Invalid dashboard config: widget id must be a non-empty string of at most ${MAX_TITLE_LENGTH} characters`,
      )
    }
    if (!validTypes.has(w.type)) {
      throw new Error(
        `Invalid dashboard config: unknown widget type "${String(w.type)}"`,
      )
    }
    if (typeof w.title !== 'string' || w.title.length > MAX_TITLE_LENGTH) {
      throw new Error(
        `Invalid dashboard config: widget title must be a string of at most ${MAX_TITLE_LENGTH} characters`,
      )
    }

    const { row, col, rowSpan, colSpan } = w.position ?? {}
    const intInRange = (v: unknown, min: number, max: number) =>
      typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    if (!intInRange(row, 0, MAX_ROW)) {
      throw new Error(
        `Invalid dashboard config: widget row must be an integer between 0 and ${MAX_ROW}`,
      )
    }
    if (!intInRange(col, 0, MAX_COL)) {
      throw new Error(
        `Invalid dashboard config: widget col must be an integer between 0 and ${MAX_COL}`,
      )
    }
    if (!intInRange(rowSpan, 1, MAX_ROW_SPAN)) {
      throw new Error(
        `Invalid dashboard config: widget rowSpan must be an integer between 1 and ${MAX_ROW_SPAN}`,
      )
    }
    if (!intInRange(colSpan, 1, MAX_COL_SPAN)) {
      throw new Error(
        `Invalid dashboard config: widget colSpan must be an integer between 1 and ${MAX_COL_SPAN}`,
      )
    }

    // Per-widget minima/maxima from the registry, on top of the generic
    // bounds above: a span outside the widget's own constraints can only come
    // from a bypassed client (the UI clamps resizes and normalizes loads), so
    // it is rejected like every other invalid payload rather than silently
    // rewritten. `w.type` is known-valid here (checked above).
    const { minCols, maxCols, minRows, maxRows } =
      WIDGET_REGISTRY[w.type].constraints
    if (!intInRange(rowSpan, minRows, maxRows)) {
      throw new Error(
        `Invalid dashboard config: "${w.type}" rowSpan must be between ${minRows} and ${maxRows}`,
      )
    }
    if (!intInRange(colSpan, minCols, maxCols)) {
      throw new Error(
        `Invalid dashboard config: "${w.type}" colSpan must be between ${minCols} and ${maxCols}`,
      )
    }

    if (w.config !== undefined) {
      if (
        typeof w.config !== 'object' ||
        w.config === null ||
        Array.isArray(w.config)
      ) {
        throw new Error(
          'Invalid dashboard config: widget config must be a plain object',
        )
      }
      const serialized = JSON.stringify(w.config)
      // Byte length, not string length: JS .length counts UTF-16 code units,
      // which undercounts multibyte characters against a BYTE cap.
      if (Buffer.byteLength(serialized, 'utf8') > MAX_CONFIG_JSON_BYTES) {
        throw new Error(
          `Invalid dashboard config: widget config exceeds ${MAX_CONFIG_JSON_BYTES} bytes when serialized`,
        )
      }
    }
  }
}

function serializeStoredWidgets(
  widgets: DashboardConfigWidget[],
): SerializedWidget[] {
  return widgets.map((w) => ({
    id: w.widgetId,
    type: w.widgetType,
    title: w.title || w.widgetType,
    position: {
      row: w.row || 0,
      col: w.col || 0,
      rowSpan: w.rowSpan || 2,
      colSpan: w.colSpan || 3,
    },
    config: (() => {
      if (!w.config) return undefined
      try {
        return JSON.parse(w.config)
      } catch {
        return undefined
      }
    })(),
  }))
}

/**
 * Loads the calling organizer's dashboard layout for the current conference.
 *
 * Fallback chain:
 *  1. personal doc (deterministic `_id`) — returned even when its widgets
 *     array is EMPTY: an existing personal doc with `widgets: []` means the
 *     user deliberately cleared their dashboard, so `[]` is returned and the
 *     client renders an empty grid (not defaults);
 *  2. legacy shared doc (`conference._ref` match, no speaker) as a read-only
 *     first-visit default — an empty legacy doc falls through to null;
 *  3. `null` — the client falls back to the default preset.
 */
export async function loadDashboardConfig(): Promise<
  SerializedWidget[] | null
> {
  const { speakerId } = await requireOrganizerSession()
  const conferenceId = await resolveConferenceId()

  const personal = await clientWrite.fetch<DashboardConfigDocument | null>(
    `*[_type == "dashboardConfig" && _id == $id][0]`,
    { id: personalDashboardConfigId(conferenceId, speakerId) },
  )
  if (personal) {
    return serializeStoredWidgets(personal.widgets ?? [])
  }

  const legacy = await clientWrite.fetch<DashboardConfigDocument | null>(
    `*[_type == "dashboardConfig" && conference._ref == $conferenceId && !defined(speaker)][0]`,
    { conferenceId },
  )
  if (!legacy?.widgets?.length) return null
  return serializeStoredWidgets(legacy.widgets)
}

/**
 * Saves the calling organizer's dashboard layout for the current conference.
 * Always writes the PERSONAL doc via `createOrReplace` with a deterministic
 * `_id` (race-free for concurrent same-user saves; the doc IS the whole
 * layout). The legacy shared doc is never written.
 */
export async function saveDashboardConfig(
  widgets: SerializedWidget[],
): Promise<void> {
  const { speakerId } = await requireOrganizerSession()
  const conferenceId = await resolveConferenceId()

  validateDashboardWidgets(widgets)

  const widgetDocs: DashboardConfigWidget[] = widgets.map((w, i) => ({
    _key: `widget-${i}`,
    widgetId: w.id,
    widgetType: w.type,
    title: w.title,
    row: w.position.row,
    col: w.position.col,
    rowSpan: w.position.rowSpan,
    colSpan: w.position.colSpan,
    config: w.config ? JSON.stringify(w.config) : undefined,
  }))

  await clientWrite.createOrReplace({
    _id: personalDashboardConfigId(conferenceId, speakerId),
    _type: 'dashboardConfig' as const,
    conference: { _ref: conferenceId, _type: 'reference' as const },
    speaker: { _ref: speakerId, _type: 'reference' as const },
    widgets: widgetDocs,
  })
}
