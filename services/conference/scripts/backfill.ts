// Sanity -> conference D1 backfill (#1788). Pure: documents in, rows and SQL
// out. The Sanity read lives in scripts/backfill-conference.ts at the repo
// root, because services may not import Sanity (eslint, #1800). Ids are the
// Sanity `_id`s, the same ones the tenant-directory backfill writes.

export interface SanityConference {
  _id: string
  orgId?: string | null
  title?: string | null
  tagline?: string | null
  city?: string | null
  country?: string | null
  venueName?: string | null
  venueAddress?: string | null
  startDate?: string | null
  endDate?: string | null
  lifecycleStatus?: string | null
  visibility?: string | null
  backgroundPattern?: string | null
  theme?: { primaryColor?: string | null; accentColor?: string | null } | null
  registrationLink?: string | null
  socialLinks?: string[] | null
  // Settings phase 1 (#2019).
  cfpStartDate?: string | null
  cfpEndDate?: string | null
  cfpNotifyDate?: string | null
  programDate?: string | null
  travelSupportPaymentDate?: string | null
  earlyBirdEndDate?: string | null
  registrationCloseDate?: string | null
  speakersAnnouncedDate?: string | null
  sponsorDeadlineDate?: string | null
  recordingsLiveDate?: string | null
  travelSupportBudget?: number | null
  registrationEnabled?: boolean | null
  organizer?: string | null
  organizerAddress?: string | null
  organizerOrgNumber?: string | null
  socialHashtag?: string | null
  ticketCustomization?: { showVanityMetrics?: boolean | null } | null
  analyticsPirschCode?: string | null
  // Settings phase 2 (#2038).
  sponsorRegistrationLink?: string | null
  speakerRegistrationLink?: string | null
  volunteerRegistrationLink?: string | null
  contactEmail?: string | null
  cfpEmail?: string | null
  sponsorEmail?: string | null
  salesNotificationChannel?: string | null
  cfpNotificationChannel?: string | null
  speakerSlackChannel?: string | null
  speakerSlackInviteUrl?: string | null
  volunteerSlackInviteUrl?: string | null
  // Settings phase 3 (#2080).
  ticketingProvider?: string | null
  checkinCustomerId?: number | null
  checkinEventId?: number | null
  titoAccountSlug?: string | null
  titoEventSlug?: string | null
  ticketCapacity?: number | null
  ticketTargets?: {
    enabled?: boolean | null
    salesStartDate?: string | null
    targetCurve?: string | null
    milestones?: Milestone[] | null
  } | null
  ticketTypeRoles?: TicketTypeRole[] | null
  publicFreeTicketIds?: number[] | null
  workshopRegistrationSponsorStart?: string | null
  workshopRegistrationStart?: string | null
  workshopRegistrationEnd?: string | null
  workshopEarlyAccessTicketTypes?: string[] | null
  workshopReminderLastSentAt?: string | null
  workshopReminderLastSentCount?: number | null
  workshopReminderReservedAt?: string | null
}

export interface Milestone {
  date?: string | null
  targetPercentage?: number | null
  label?: string | null
}
/** Three states per answer: absent is not false (src/lib/tickets/classification). */
export interface TicketTypeRole {
  typeName?: string | null
  admits?: boolean | null
  grantsWorkshop?: boolean | null
}

/** The GROQ projection of the settings fields, phase 1 (#2019), 2 (#2038) and 3 (#2080). */
export const SETTINGS_PROJECTION = `cfpStartDate, cfpEndDate, cfpNotifyDate,
  programDate, travelSupportPaymentDate, earlyBirdEndDate,
  registrationCloseDate, speakersAnnouncedDate, sponsorDeadlineDate,
  recordingsLiveDate, travelSupportBudget, registrationEnabled, organizer,
  organizerAddress, organizerOrgNumber, socialHashtag,
  "ticketCustomization": ticketCustomization{ showVanityMetrics },
  analyticsPirschCode, sponsorRegistrationLink, speakerRegistrationLink, volunteerRegistrationLink, contactEmail, cfpEmail, sponsorEmail, salesNotificationChannel, cfpNotificationChannel, speakerSlackChannel, speakerSlackInviteUrl, volunteerSlackInviteUrl,
  ticketingProvider, checkinCustomerId, checkinEventId, titoAccountSlug,
  titoEventSlug, ticketCapacity,
  "ticketTargets": ticketTargets{ enabled, salesStartDate, targetCurve,
    "milestones": milestones[]{ date, targetPercentage, label } },
  "ticketTypeRoles": ticketTypeRoles[]{ typeName, admits, grantsWorkshop },
  publicFreeTicketIds, workshopRegistrationSponsorStart,
  workshopRegistrationStart, workshopRegistrationEnd,
  workshopEarlyAccessTicketTypes, workshopReminderLastSentAt,
  workshopReminderLastSentCount, workshopReminderReservedAt`

export interface Row {
  conference_id: string
  org_id: string
  published: 0 | 1
  title: string | null
  tagline: string | null
  city: string | null
  country: string | null
  venue_name: string | null
  venue_address: string | null
  start_date: string | null
  end_date: string | null
  visibility: 'live' | 'unlisted'
  background_pattern: string | null
  primary_color: string | null
  accent_color: string | null
  registration_link: string | null
  social_links: string
  cfp_start_date: string | null
  cfp_end_date: string | null
  cfp_notify_date: string | null
  program_date: string | null
  travel_support_payment_date: string | null
  early_bird_end_date: string | null
  registration_close_date: string | null
  speakers_announced_date: string | null
  sponsor_deadline_date: string | null
  recordings_live_date: string | null
  travel_support_budget: number | null
  registration_enabled: 0 | 1 | null
  organizer_name: string | null
  organizer_address: string | null
  organizer_org_number: string | null
  social_hashtag: string | null
  show_vanity_metrics: 0 | 1 | null
  analytics_pirsch_code: string | null
  sponsor_registration_link: string | null
  speaker_registration_link: string | null
  volunteer_registration_link: string | null
  contact_email: string | null
  cfp_email: string | null
  sponsor_email: string | null
  sales_notification_channel: string | null
  cfp_notification_channel: string | null
  speaker_slack_channel: string | null
  speaker_slack_invite_url: string | null
  volunteer_slack_invite_url: string | null
  ticketing_provider: string | null
  checkin_customer_id: number | null
  checkin_event_id: number | null
  tito_account_slug: string | null
  tito_event_slug: string | null
  ticket_capacity: number | null
  ticket_targets_enabled: 0 | 1 | null
  ticket_sales_start_date: string | null
  ticket_target_curve: string | null
  /** JSON; the four list columns are null when the list is absent or empty. */
  ticket_target_milestones: string | null
  ticket_type_roles: string | null
  public_free_ticket_ids: string | null
  workshop_registration_sponsor_start: string | null
  workshop_registration_start: string | null
  workshop_registration_end: string | null
  workshop_early_access_ticket_types: string | null
  workshop_reminder_last_sent_at: string | null
  workshop_reminder_last_sent_count: number | null
  workshop_reminder_reserved_at: string | null
}

const s = (v: string | null | undefined) => v?.trim() || null
const b = (v: boolean | null | undefined) =>
  typeof v === 'boolean' ? (v ? 1 : 0) : null
const n = (v: number | null | undefined) =>
  typeof v === 'number' && Number.isFinite(v) ? v : null
/** A list as JSON, or null when absent or empty (one value for parity). */
const j = (v: unknown[] | null | undefined) =>
  v?.length ? JSON.stringify(v) : null

/** The stored shape of a milestone: no `_key`, label only when set. */
export const milestone = (m: Milestone) => ({
  date: m.date ?? null,
  targetPercentage: m.targetPercentage ?? null,
  ...(m.label?.trim() && { label: m.label.trim() }),
})
/** The stored shape of a role: no `_key`, and an unanswered question stays absent. */
export const ticketTypeRole = (r: TicketTypeRole) => ({
  typeName: r.typeName ?? null,
  ...(typeof r.admits === 'boolean' && { admits: r.admits }),
  ...(typeof r.grantsWorkshop === 'boolean' && {
    grantsWorkshop: r.grantsWorkshop,
  }),
})

/**
 * Drafts are never passed in. `routable` is the set of conference ids the
 * tenant-directory backfill writes: a row for any other id could never be
 * reached, so it is skipped.
 */
export function mapBackfill(
  docs: SanityConference[],
  routable: ReadonlySet<string>,
) {
  const rows: Row[] = []
  const anomalies: string[] = []
  for (const c of [...docs].sort((a, b) => a._id.localeCompare(b._id))) {
    if (!c.orgId || !routable.has(c._id)) {
      anomalies.push(`conference ${c._id}: not in tenant-directory; skipped`)
      continue
    }
    rows.push({
      conference_id: c._id,
      org_id: c.orgId,
      // Cancelled and archived editions are not public; unlisted ones are.
      published: ['cancelled', 'archived'].includes(c.lifecycleStatus ?? '')
        ? 0
        : 1,
      title: s(c.title),
      tagline: s(c.tagline),
      city: s(c.city),
      country: s(c.country),
      venue_name: s(c.venueName),
      venue_address: s(c.venueAddress),
      start_date: s(c.startDate),
      end_date: s(c.endDate),
      // Absent means live (src/lib/conference/contract.ts).
      visibility: c.visibility === 'unlisted' ? 'unlisted' : 'live',
      background_pattern: s(c.backgroundPattern),
      primary_color: s(c.theme?.primaryColor),
      accent_color: s(c.theme?.accentColor),
      registration_link: s(c.registrationLink),
      social_links: JSON.stringify(c.socialLinks ?? []),
      cfp_start_date: s(c.cfpStartDate),
      cfp_end_date: s(c.cfpEndDate),
      cfp_notify_date: s(c.cfpNotifyDate),
      program_date: s(c.programDate),
      travel_support_payment_date: s(c.travelSupportPaymentDate),
      early_bird_end_date: s(c.earlyBirdEndDate),
      registration_close_date: s(c.registrationCloseDate),
      speakers_announced_date: s(c.speakersAnnouncedDate),
      sponsor_deadline_date: s(c.sponsorDeadlineDate),
      recordings_live_date: s(c.recordingsLiveDate),
      travel_support_budget: n(c.travelSupportBudget),
      registration_enabled: b(c.registrationEnabled),
      organizer_name: s(c.organizer),
      organizer_address: s(c.organizerAddress),
      organizer_org_number: s(c.organizerOrgNumber),
      social_hashtag: s(c.socialHashtag),
      show_vanity_metrics: b(c.ticketCustomization?.showVanityMetrics),
      analytics_pirsch_code: s(c.analyticsPirschCode),
      sponsor_registration_link: s(c.sponsorRegistrationLink),
      speaker_registration_link: s(c.speakerRegistrationLink),
      volunteer_registration_link: s(c.volunteerRegistrationLink),
      contact_email: s(c.contactEmail),
      cfp_email: s(c.cfpEmail),
      sponsor_email: s(c.sponsorEmail),
      sales_notification_channel: s(c.salesNotificationChannel),
      cfp_notification_channel: s(c.cfpNotificationChannel),
      speaker_slack_channel: s(c.speakerSlackChannel),
      speaker_slack_invite_url: s(c.speakerSlackInviteUrl),
      volunteer_slack_invite_url: s(c.volunteerSlackInviteUrl),
      ticketing_provider: s(c.ticketingProvider),
      checkin_customer_id: n(c.checkinCustomerId),
      checkin_event_id: n(c.checkinEventId),
      tito_account_slug: s(c.titoAccountSlug),
      tito_event_slug: s(c.titoEventSlug),
      ticket_capacity: n(c.ticketCapacity),
      ticket_targets_enabled: b(c.ticketTargets?.enabled),
      ticket_sales_start_date: s(c.ticketTargets?.salesStartDate),
      ticket_target_curve: s(c.ticketTargets?.targetCurve),
      ticket_target_milestones: j(c.ticketTargets?.milestones?.map(milestone)),
      ticket_type_roles: j(c.ticketTypeRoles?.map(ticketTypeRole)),
      public_free_ticket_ids: j(c.publicFreeTicketIds),
      workshop_registration_sponsor_start: s(
        c.workshopRegistrationSponsorStart,
      ),
      workshop_registration_start: s(c.workshopRegistrationStart),
      workshop_registration_end: s(c.workshopRegistrationEnd),
      workshop_early_access_ticket_types: j(c.workshopEarlyAccessTicketTypes),
      workshop_reminder_last_sent_at: s(c.workshopReminderLastSentAt),
      workshop_reminder_last_sent_count: n(c.workshopReminderLastSentCount),
      workshop_reminder_reserved_at: s(c.workshopReminderReservedAt),
    })
    if (!c.title?.trim()) anomalies.push(`conference ${c._id}: no title`)
  }
  return { rows, anomalies }
}

const q = (v: string | number | null) =>
  v === null
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : `'${v.replace(/'/g, "''")}'`

/** The settings phase 1 columns (#2019), for `toSql(rows, { only })`. */
export const SETTINGS_PHASE1_COLUMNS = [
  'cfp_start_date',
  'cfp_end_date',
  'cfp_notify_date',
  'program_date',
  'travel_support_payment_date',
  'early_bird_end_date',
  'registration_close_date',
  'speakers_announced_date',
  'sponsor_deadline_date',
  'recordings_live_date',
  'travel_support_budget',
  'registration_enabled',
  'organizer_name',
  'organizer_address',
  'organizer_org_number',
  'social_hashtag',
  'show_vanity_metrics',
  'analytics_pirsch_code',
] as const satisfies readonly (keyof Row)[]

/** The settings phase 2 columns (#2038), for `toSql(rows, { only })`. */
export const SETTINGS_PHASE2_COLUMNS = [
  'sponsor_registration_link',
  'speaker_registration_link',
  'volunteer_registration_link',
  'contact_email',
  'cfp_email',
  'sponsor_email',
  'sales_notification_channel',
  'cfp_notification_channel',
  'speaker_slack_channel',
  'speaker_slack_invite_url',
  'volunteer_slack_invite_url',
] as const satisfies readonly (keyof Row)[]

/** The settings phase 3 columns (#2080), for `toSql(rows, { only })`. */
export const SETTINGS_PHASE3_COLUMNS = [
  'ticketing_provider',
  'checkin_customer_id',
  'checkin_event_id',
  'tito_account_slug',
  'tito_event_slug',
  'ticket_capacity',
  'ticket_targets_enabled',
  'ticket_sales_start_date',
  'ticket_target_curve',
  'ticket_target_milestones',
  'ticket_type_roles',
  'public_free_ticket_ids',
  'workshop_registration_sponsor_start',
  'workshop_registration_start',
  'workshop_registration_end',
  'workshop_early_access_ticket_types',
  'workshop_reminder_last_sent_at',
  'workshop_reminder_last_sent_count',
  'workshop_reminder_reserved_at',
] as const satisfies readonly (keyof Row)[]

/** The columns `toSql` puts in ON CONFLICT DO UPDATE SET for a row. */
export function updateColumns(
  row: Row,
  only?: readonly (keyof Row)[],
): (keyof Row)[] {
  return (only ?? (Object.keys(row) as (keyof Row)[])).filter(
    (c) => c !== 'conference_id' && c !== 'org_id',
  )
}

/**
 * Idempotent upserts. A rerun never moves a row to another org. New rows are
 * inserted whole; with `only`, an existing row has ONLY those columns
 * updated. Without it every column is overwritten from Sanity, which reverts
 * D1-owned fields that d1_write tenants edited after the freeze (#2013).
 */
export function toSql(
  rows: Row[],
  opts: { only?: readonly (keyof Row)[] } = {},
): string {
  return rows
    .map((r) => {
      const cols = Object.keys(r) as (keyof Row)[]
      const set = updateColumns(r, opts.only)
        .map((c) => `${c} = excluded.${c}`)
        .join(', ')
      return `INSERT INTO conferences (${cols.join(', ')}) VALUES (${cols.map((c) => q(r[c])).join(', ')}) ON CONFLICT (conference_id) DO UPDATE SET ${set} WHERE conferences.org_id = excluded.org_id;`
    })
    .join('\n')
    .concat('\n')
}
