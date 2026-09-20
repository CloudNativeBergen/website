/**
 * MARKETING MILESTONES — the named conference dates Template offsets are
 * expressed against (docs/MARKETING_PLAN_SPEC.md §2.6).
 *
 * Six Milestones read required conference fields and never fall back. Five
 * read optional conference fields and one reads the ticket target config;
 * when that source is unset the resolver derives a date from another
 * Milestone and flags the result `provisional`, so a seeded Task can be moved
 * to the real date once the organizer sets it.
 *
 * `TICKETS_OPEN` is special: it reads `ticketTargets.salesStartDate`, which
 * the ticket target tracking feature owns. Marketing never writes it, and it
 * only counts when tracking is enabled — a date left behind on a disabled
 * config is stale, not a plan.
 */

import { isCalendarDate } from '@/lib/time'
import type { Conference } from '@/lib/conference/types'
import type { SalesTargetConfig } from '@/lib/tickets/types'

export const MILESTONES = [
  'CFP_OPEN',
  'CFP_CLOSE',
  'CFP_NOTIFY',
  'PROGRAM_PUBLISHED',
  'CONFERENCE_START',
  'CONFERENCE_END',
  'TICKETS_OPEN',
  'EARLY_BIRD_END',
  'REGISTRATION_CLOSE',
  'SPEAKERS_ANNOUNCED',
  'SPONSOR_DEADLINE',
  'RECORDINGS_LIVE',
] as const

export type Milestone = (typeof MILESTONES)[number]

type DateField = string | null | undefined

/** A Milestone that reads a required field, so it can anchor a fallback. */
type RequiredMilestone =
  | 'CFP_OPEN'
  | 'CFP_CLOSE'
  | 'CFP_NOTIFY'
  | 'PROGRAM_PUBLISHED'
  | 'CONFERENCE_START'
  | 'CONFERENCE_END'

type RequiredField =
  | 'cfpStartDate'
  | 'cfpEndDate'
  | 'cfpNotifyDate'
  | 'programDate'
  | 'startDate'
  | 'endDate'

type OptionalField =
  | 'earlyBirdEndDate'
  | 'registrationCloseDate'
  | 'speakersAnnouncedDate'
  | 'sponsorDeadlineDate'
  | 'recordingsLiveDate'

/**
 * The slice of a conference document the resolver reads. Keyed off
 * {@link Conference} so a renamed field fails to compile here rather than
 * throwing at runtime; every member is optional-or-null because the resolver
 * is exactly the place that decides what an unset field means.
 */
export type MilestoneSource = {
  [K in RequiredField | OptionalField]?: Conference[K] | null
} & {
  ticketTargets?:
    | {
        [K in 'enabled' | 'salesStartDate']?: SalesTargetConfig[K] | null
      }
    | null
}

export interface ResolvedMilestone {
  /** YYYY-MM-DD */
  date: string
  /** True when the date came from a fallback rather than the field itself. */
  provisional: boolean
}

/** Every Milestone of one edition, resolved. */
export type ResolvedMilestones = Record<Milestone, ResolvedMilestone>

/** Anchors are required Milestones only, so a fallback chain is one hop deep
 * and can never cycle; the type enforces it at compile time. */
type Fallback = { anchor: RequiredMilestone; weeks: number }

type MilestoneRule =
  | { kind: 'required'; field: RequiredField }
  | { kind: 'optional'; field: OptionalField; fallback: Fallback }
  | { kind: 'ticketTargets'; fallback: Fallback }

const RULES: Record<Milestone, MilestoneRule> = {
  CFP_OPEN: { kind: 'required', field: 'cfpStartDate' },
  CFP_CLOSE: { kind: 'required', field: 'cfpEndDate' },
  CFP_NOTIFY: { kind: 'required', field: 'cfpNotifyDate' },
  PROGRAM_PUBLISHED: { kind: 'required', field: 'programDate' },
  CONFERENCE_START: { kind: 'required', field: 'startDate' },
  CONFERENCE_END: { kind: 'required', field: 'endDate' },
  TICKETS_OPEN: {
    kind: 'ticketTargets',
    fallback: { anchor: 'CONFERENCE_START', weeks: -12 },
  },
  EARLY_BIRD_END: {
    kind: 'optional',
    field: 'earlyBirdEndDate',
    fallback: { anchor: 'PROGRAM_PUBLISHED', weeks: 0 },
  },
  REGISTRATION_CLOSE: {
    kind: 'optional',
    field: 'registrationCloseDate',
    fallback: { anchor: 'CONFERENCE_START', weeks: -1 },
  },
  SPEAKERS_ANNOUNCED: {
    kind: 'optional',
    field: 'speakersAnnouncedDate',
    fallback: { anchor: 'CFP_NOTIFY', weeks: 1 },
  },
  SPONSOR_DEADLINE: {
    kind: 'optional',
    field: 'sponsorDeadlineDate',
    fallback: { anchor: 'CONFERENCE_START', weeks: -6 },
  },
  RECORDINGS_LIVE: {
    kind: 'optional',
    field: 'recordingsLiveDate',
    fallback: { anchor: 'CONFERENCE_END', weeks: 2 },
  },
}

/** Adds whole weeks to a YYYY-MM-DD string in UTC, so no DST shift leaks in. */
export function addWeeksToDate(date: string, weeks: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + weeks * 7)).toISOString().slice(0, 10)
}

function readRequired(source: MilestoneSource, field: RequiredField): string {
  const value = source[field]
  if (!value || !isCalendarDate(value)) {
    throw new Error(
      `Milestone resolver: conference field "${field}" is required and must be YYYY-MM-DD`,
    )
  }
  return value
}

/**
 * An optional field that is unset, null, blank, or malformed counts as unset
 * and falls back. Unlike a required field it never throws: the write path
 * (`UpdateDatesSchema`) rejects malformed and impossible dates, so a bad value
 * here is legacy data the organizer can fix from settings, not a broken
 * conference.
 */
function readOptional(value: DateField): string | undefined {
  return value && isCalendarDate(value) ? value : undefined
}

function applyFallback(
  source: MilestoneSource,
  { anchor, weeks }: Fallback,
): ResolvedMilestone {
  const { date } = resolveMilestone(anchor, source)
  return { date: addWeeksToDate(date, weeks), provisional: true }
}

/**
 * Resolves one Milestone to a date. Throws when a REQUIRED field (or the
 * required anchor of a fallback) is missing or malformed; a conference in that
 * state cannot carry a Marketing Plan at all.
 */
export function resolveMilestone(
  milestone: Milestone,
  source: MilestoneSource,
): ResolvedMilestone {
  const rule = RULES[milestone]
  switch (rule.kind) {
    case 'required':
      return { date: readRequired(source, rule.field), provisional: false }
    case 'optional': {
      const date = readOptional(source[rule.field])
      return date
        ? { date, provisional: false }
        : applyFallback(source, rule.fallback)
    }
    case 'ticketTargets': {
      const targets = source.ticketTargets
      const date = targets?.enabled
        ? readOptional(targets.salesStartDate)
        : undefined
      return date
        ? { date, provisional: false }
        : applyFallback(source, rule.fallback)
    }
  }
}

export function resolveAllMilestones(
  source: MilestoneSource,
): Record<Milestone, ResolvedMilestone> {
  return Object.fromEntries(
    MILESTONES.map((m) => [m, resolveMilestone(m, source)]),
  ) as Record<Milestone, ResolvedMilestone>
}
