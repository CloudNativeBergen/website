import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import {
  mapBackfill,
  SETTINGS_PHASE1_COLUMNS,
  SETTINGS_PHASE2_COLUMNS,
  SETTINGS_PHASE3_COLUMNS,
  SETTINGS_PROJECTION,
  toSql,
} from './backfill'

const docs = [
  {
    _id: 'conf-b',
    orgId: 'org-a',
    title: "Acme's 2026",
    city: ' Bergen ',
    visibility: 'unlisted',
    theme: { primaryColor: '#123456' },
    socialLinks: ['https://x.example'],
  },
  { _id: 'conf-a', orgId: 'org-a', title: '' },
  { _id: 'conf-orphan', title: 'Orphan' },
  { _id: 'conf-unrouted', orgId: 'org-a', title: 'Unrouted' },
  {
    _id: 'conf-c',
    orgId: 'org-a',
    title: 'Cancelled',
    lifecycleStatus: 'cancelled',
  },
]
/** In-memory SQLite with every migration applied, in order. */
function migrated() {
  const db = new DatabaseSync(':memory:')
  const dir = new URL('../migrations/', import.meta.url)
  for (const f of readdirSync(dir).sort())
    db.exec(readFileSync(new URL(f, dir), 'utf8'))
  return db
}

const routable = new Set(['conf-a', 'conf-b', 'conf-c', 'conf-orphan'])

describe('mapBackfill', () => {
  const b = mapBackfill(docs, routable)

  it('maps public fields under the Sanity ids', () => {
    expect(b.rows.map((r) => r.conference_id)).toEqual([
      'conf-a',
      'conf-b',
      'conf-c',
    ])
    expect(b.rows[2].published).toBe(0)
    expect(b.rows[1]).toMatchObject({
      org_id: 'org-a',
      published: 1,
      city: 'Bergen',
      visibility: 'unlisted',
      primary_color: '#123456',
      accent_color: null,
      social_links: '["https://x.example"]',
    })
    expect(b.rows[0]).toMatchObject({
      title: null,
      visibility: 'live',
      social_links: '[]',
    })
  })

  it('maps every settings phase 1 field with its type (#2019)', () => {
    const settings = {
      cfpStartDate: '2026-01-01',
      cfpEndDate: '2026-02-01',
      cfpNotifyDate: '2026-03-01',
      programDate: '2026-04-01',
      travelSupportPaymentDate: '2026-05-01',
      earlyBirdEndDate: '2026-06-01',
      registrationCloseDate: '2026-07-01',
      speakersAnnouncedDate: '2026-08-01',
      sponsorDeadlineDate: '2026-09-01',
      recordingsLiveDate: '2026-10-01',
      travelSupportBudget: 12500.5,
      registrationEnabled: true,
      organizer: ' Acme AS ',
      organizerAddress: 'Street 1',
      organizerOrgNumber: '123 456 789',
      socialHashtag: '#acme',
      ticketCustomization: { showVanityMetrics: false },
      analyticsPirschCode: 'pirsch-1',
    }
    const want = {
      cfp_start_date: '2026-01-01',
      cfp_end_date: '2026-02-01',
      cfp_notify_date: '2026-03-01',
      program_date: '2026-04-01',
      travel_support_payment_date: '2026-05-01',
      early_bird_end_date: '2026-06-01',
      registration_close_date: '2026-07-01',
      speakers_announced_date: '2026-08-01',
      sponsor_deadline_date: '2026-09-01',
      recordings_live_date: '2026-10-01',
      travel_support_budget: 12500.5,
      registration_enabled: 1,
      organizer_name: 'Acme AS',
      organizer_address: 'Street 1',
      organizer_org_number: '123 456 789',
      social_hashtag: '#acme',
      show_vanity_metrics: 0,
      analytics_pirsch_code: 'pirsch-1',
    }
    const [full, empty] = mapBackfill(
      [
        { _id: 'x', orgId: 'o', ...settings },
        { _id: 'y', orgId: 'o', registrationEnabled: false },
      ],
      new Set(['x', 'y']),
    ).rows
    expect(full).toMatchObject(want)
    // Absent is null, not false or 0; false is kept as 0.
    expect(empty).toMatchObject({
      ...Object.fromEntries(Object.keys(want).map((k) => [k, null])),
      registration_enabled: 0,
    })
    // Every Sanity field is read by the GROQ projection.
    for (const k of Object.keys(settings))
      expect(SETTINGS_PROJECTION).toContain(k)
    expect(SETTINGS_PROJECTION).toContain('showVanityMetrics')
    // ...and every column exists in the migrations and round-trips.
    const db = migrated()
    db.exec(toSql([full]))
    expect(
      db.prepare("SELECT * FROM conferences WHERE conference_id = 'x'").get(),
    ).toMatchObject(want)
  })

  it('reports the anomalies', () => {
    expect(b.anomalies).toEqual([
      'conference conf-a: no title',
      'conference conf-orphan: not in tenant-directory; skipped',
      'conference conf-unrouted: not in tenant-directory; skipped',
    ])
  })

  it('emits idempotent upserts that apply to the migration', () => {
    const sql = toSql(b.rows)
    expect(sql).toContain("'Acme''s 2026'")
    const sets = sql.split('\n').map((l) => l.split(' WHERE ')[0])
    expect(sets.join('\n')).not.toMatch(/\b(org_id|conference_id) = excluded/)
    const db = migrated()
    db.exec(sql)
    db.exec(sql)
    expect(db.prepare('SELECT count(*) AS n FROM conferences').get()).toEqual({
      n: 3,
    })
    // A row owned by another org is left alone on rerun.
    db.exec(
      "UPDATE conferences SET org_id = 'org-x' WHERE conference_id = 'conf-b'",
    )
    db.exec(sql)
    expect(
      db
        .prepare(
          "SELECT org_id, city FROM conferences WHERE conference_id = 'conf-b'",
        )
        .get(),
    ).toEqual({ org_id: 'org-x', city: 'Bergen' })
  })

  it('with only, updates just those columns and keeps D1-edited ones (#2019)', () => {
    const db = migrated()
    db.exec(toSql(b.rows))
    // A d1_write tenant edited the title after the Sanity freeze.
    db.exec(
      "UPDATE conferences SET title = 'D1 edit' WHERE conference_id = 'conf-b'",
    )
    const [row] = mapBackfill(
      [{ ...docs[0], socialHashtag: '#new' }],
      routable,
    ).rows
    db.exec(toSql([row], { only: SETTINGS_PHASE1_COLUMNS }))
    expect(
      db
        .prepare(
          "SELECT title, social_hashtag FROM conferences WHERE conference_id = 'conf-b'",
        )
        .get(),
    ).toEqual({ title: 'D1 edit', social_hashtag: '#new' })
    // A new row is still inserted whole.
    const [fresh] = mapBackfill(
      [{ _id: 'conf-new', orgId: 'org-a', title: 'New' }],
      new Set(['conf-new']),
    ).rows
    db.exec(toSql([fresh], { only: SETTINGS_PHASE1_COLUMNS }))
    expect(
      db
        .prepare(
          "SELECT title FROM conferences WHERE conference_id = 'conf-new'",
        )
        .get(),
    ).toEqual({ title: 'New' })
  })

  const PHASE2 = {
    sponsorRegistrationLink: 'https://t.example/s',
    speakerRegistrationLink: 'https://t.example/sp',
    volunteerRegistrationLink: 'https://t.example/v',
    contactEmail: ' hi@acme.example ',
    cfpEmail: 'cfp@acme.example',
    sponsorEmail: 'sponsor@acme.example',
    salesNotificationChannel: '#sales',
    cfpNotificationChannel: '#cfp',
    speakerSlackChannel: '#speakers',
    speakerSlackInviteUrl: 'https://join.slack.com/s',
    volunteerSlackInviteUrl: 'https://join.slack.com/v',
  }
  const PHASE2_ROW = {
    sponsor_registration_link: 'https://t.example/s',
    speaker_registration_link: 'https://t.example/sp',
    volunteer_registration_link: 'https://t.example/v',
    contact_email: 'hi@acme.example',
    cfp_email: 'cfp@acme.example',
    sponsor_email: 'sponsor@acme.example',
    sales_notification_channel: '#sales',
    cfp_notification_channel: '#cfp',
    speaker_slack_channel: '#speakers',
    speaker_slack_invite_url: 'https://join.slack.com/s',
    volunteer_slack_invite_url: 'https://join.slack.com/v',
  }

  it('maps every settings phase 2 field (#2038)', () => {
    const [full, empty] = mapBackfill(
      [
        { _id: 'x', orgId: 'o', ...PHASE2 },
        { _id: 'y', orgId: 'o', contactEmail: '  ' },
      ],
      new Set(['x', 'y']),
    ).rows
    expect(full).toMatchObject(PHASE2_ROW)
    expect(empty).toMatchObject(
      Object.fromEntries(Object.keys(PHASE2_ROW).map((k) => [k, null])),
    )
    expect([...SETTINGS_PHASE2_COLUMNS].sort()).toEqual(
      Object.keys(PHASE2_ROW).sort(),
    )
    for (const k of Object.keys(PHASE2))
      expect(SETTINGS_PROJECTION).toContain(k)
    const db = migrated()
    db.exec(toSql([full]))
    expect(
      db.prepare("SELECT * FROM conferences WHERE conference_id = 'x'").get(),
    ).toMatchObject(PHASE2_ROW)
  })

  it('migrates a populated phase 1 database without touching its rows (#2038)', () => {
    const dir = new URL('../migrations/', import.meta.url)
    const files = readdirSync(dir)
      .filter((f) => f <= '0005_settings_phase2.sql')
      .sort()
    const last = files.pop()
    expect(last).toBe('0005_settings_phase2.sql')
    const db = new DatabaseSync(':memory:')
    for (const f of files) db.exec(readFileSync(new URL(f, dir), 'utf8'))
    // Rows as phase 1 wrote them: no phase 2 columns.
    const phase1 = b.rows.map(
      (r) =>
        Object.fromEntries(
          Object.entries(r).filter(
            ([k]) => !(k in PHASE2_NULLS) && !(k in PHASE3_NULLS),
          ),
        ) as unknown as typeof r,
    )
    db.exec(toSql(phase1))
    const before = db.prepare('SELECT * FROM conferences').all()
    db.exec(readFileSync(new URL(last!, dir), 'utf8'))
    const after = db.prepare('SELECT * FROM conferences').all()
    expect(after).toEqual(
      before.map((r) => ({ ...(r as object), ...PHASE2_NULLS })),
    )
  })

  it('with only settings-phase2, keeps a D1-edited title and phase 1 field (#2038)', () => {
    const db = migrated()
    db.exec(toSql(b.rows))
    db.exec(
      "UPDATE conferences SET title = 'D1 edit', social_hashtag = '#d1' WHERE conference_id = 'conf-b'",
    )
    const [row] = mapBackfill(
      [{ ...docs[0], socialHashtag: '#sanity', ...PHASE2 }],
      routable,
    ).rows
    db.exec(toSql([row], { only: SETTINGS_PHASE2_COLUMNS }))
    expect(
      db
        .prepare(
          `SELECT title, social_hashtag, ${SETTINGS_PHASE2_COLUMNS.join(', ')} FROM conferences WHERE conference_id = 'conf-b'`,
        )
        .get(),
    ).toEqual({ title: 'D1 edit', social_hashtag: '#d1', ...PHASE2_ROW })
  })
})

const PHASE2_NULLS = Object.fromEntries(
  SETTINGS_PHASE2_COLUMNS.map((k) => [k, null]),
)
const PHASE3_NULLS = Object.fromEntries(
  SETTINGS_PHASE3_COLUMNS.map((k) => [k, null]),
)

describe('settings phase 3 (#2080)', () => {
  const b = mapBackfill(docs, routable)
  const PHASE3 = {
    ticketingProvider: 'tito',
    checkinCustomerId: 12,
    checkinEventId: 34,
    titoAccountSlug: ' acme ',
    titoEventSlug: '2026',
    ticketCapacity: 400,
    ticketTargets: {
      enabled: false,
      salesStartDate: '2026-01-15',
      targetCurve: 'linear',
      milestones: [
        { date: '2026-03-01', targetPercentage: 50, label: null },
        { date: '2026-04-01', targetPercentage: 90, label: ' Early bird ' },
      ],
    },
    // As the projection returns them: unanswered questions are null.
    ticketTypeRoles: [
      { typeName: 'Workshop add-on', admits: false, grantsWorkshop: null },
      { typeName: 'Two-day pass', admits: null, grantsWorkshop: true },
    ],
    publicFreeTicketIds: [7, 9],
    workshopRegistrationSponsorStart: '2026-05-01T08:00:00Z',
    workshopRegistrationStart: '2026-05-02T08:00:00Z',
    workshopRegistrationEnd: '2026-06-01T08:00:00Z',
    workshopEarlyAccessTicketTypes: ['Two-day pass'],
    workshopReminderLastSentAt: '2026-05-03T10:00:00Z',
    workshopReminderLastSentCount: 0,
    workshopReminderReservedAt: '2026-05-03T09:59:00Z',
  }
  const PHASE3_ROW = {
    ticketing_provider: 'tito',
    checkin_customer_id: 12,
    checkin_event_id: 34,
    tito_account_slug: 'acme',
    tito_event_slug: '2026',
    ticket_capacity: 400,
    ticket_targets_enabled: 0,
    ticket_sales_start_date: '2026-01-15',
    ticket_target_curve: 'linear',
    ticket_target_milestones: JSON.stringify([
      { date: '2026-03-01', targetPercentage: 50 },
      { date: '2026-04-01', targetPercentage: 90, label: 'Early bird' },
    ]),
    ticket_type_roles: JSON.stringify([
      { typeName: 'Workshop add-on', admits: false },
      { typeName: 'Two-day pass', grantsWorkshop: true },
    ]),
    public_free_ticket_ids: '[7,9]',
    workshop_registration_sponsor_start: '2026-05-01T08:00:00Z',
    workshop_registration_start: '2026-05-02T08:00:00Z',
    workshop_registration_end: '2026-06-01T08:00:00Z',
    workshop_early_access_ticket_types: '["Two-day pass"]',
    workshop_reminder_last_sent_at: '2026-05-03T10:00:00Z',
    workshop_reminder_last_sent_count: 0,
    workshop_reminder_reserved_at: '2026-05-03T09:59:00Z',
  }

  it('maps every field, the lists as JSON, and absent or empty lists as null', () => {
    const [full, empty] = mapBackfill(
      [
        { _id: 'x', orgId: 'o', ...PHASE3 },
        {
          _id: 'y',
          orgId: 'o',
          ticketTargets: { milestones: [] },
          ticketTypeRoles: [],
          publicFreeTicketIds: [],
        },
      ],
      new Set(['x', 'y']),
    ).rows
    expect(full).toMatchObject(PHASE3_ROW)
    expect(empty).toMatchObject(PHASE3_NULLS)
    expect([...SETTINGS_PHASE3_COLUMNS].sort()).toEqual(
      Object.keys(PHASE3_ROW).sort(),
    )
    for (const k of Object.keys(PHASE3))
      expect(SETTINGS_PROJECTION).toContain(k)
    const db = migrated()
    db.exec(toSql([full]))
    expect(
      db.prepare("SELECT * FROM conferences WHERE conference_id = 'x'").get(),
    ).toMatchObject(PHASE3_ROW)
  })

  it('migrates a populated phase 2 database without touching its rows, and checks the JSON', () => {
    const dir = new URL('../migrations/', import.meta.url)
    const files = readdirSync(dir).sort()
    expect(files.pop()).toBe('0007_settings_phase3.sql')
    const db = new DatabaseSync(':memory:')
    for (const f of files) db.exec(readFileSync(new URL(f, dir), 'utf8'))
    const phase2 = b.rows.map(
      (r) =>
        Object.fromEntries(
          Object.entries(r).filter(([k]) => !(k in PHASE3_NULLS)),
        ) as unknown as typeof r,
    )
    db.exec(toSql(phase2))
    const before = db.prepare('SELECT * FROM conferences').all()
    db.exec(readFileSync(new URL('0007_settings_phase3.sql', dir), 'utf8'))
    expect(db.prepare('SELECT * FROM conferences').all()).toEqual(
      before.map((r) => ({ ...(r as object), ...PHASE3_NULLS })),
    )
    expect(() =>
      db.exec(
        "UPDATE conferences SET ticket_type_roles = 'not json' WHERE conference_id = 'conf-b'",
      ),
    ).toThrow(/CHECK constraint/)
  })

  it('with only settings-phase3, keeps a D1-edited title and phase 1 and 2 fields, and reruns idempotently', () => {
    const db = migrated()
    db.exec(toSql(b.rows))
    db.exec(
      "UPDATE conferences SET title = 'D1 edit', social_hashtag = '#d1', contact_email = 'd1@acme.example' WHERE conference_id = 'conf-b'",
    )
    const [row] = mapBackfill(
      [
        {
          ...docs[0],
          socialHashtag: '#sanity',
          contactEmail: 'sanity@acme.example',
          ...PHASE3,
        },
      ],
      routable,
    ).rows
    const sql = toSql([row], { only: SETTINGS_PHASE3_COLUMNS })
    db.exec(sql)
    const read = () =>
      db
        .prepare(
          `SELECT title, social_hashtag, contact_email, ${SETTINGS_PHASE3_COLUMNS.join(', ')} FROM conferences WHERE conference_id = 'conf-b'`,
        )
        .get()
    const once = read()
    expect(once).toEqual({
      title: 'D1 edit',
      social_hashtag: '#d1',
      contact_email: 'd1@acme.example',
      ...PHASE3_ROW,
    })
    db.exec(sql)
    expect(read()).toEqual(once)
    expect(db.prepare('SELECT count(*) AS n FROM conferences').get()).toEqual({
      n: b.rows.length,
    })
  })
})
