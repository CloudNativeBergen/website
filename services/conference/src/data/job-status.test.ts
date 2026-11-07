/** @vitest-environment node */
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduled } from './parity'
import { mapBackfill, type SanityConference } from '../../scripts/backfill'

const sanity = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@sanity/client', () => ({ createClient: () => sanity }))
vi.mock('../push', () => ({ emit: vi.fn() }))

const doc: SanityConference = {
  _id: 'conf-a',
  orgId: 'org-a',
  title: 'Private title',
  city: 'Bergen',
}
const now = 1_800_000_000_000
let sqlite: DatabaseSync
let db: D1Database
let logs: string[]

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  const dir = new URL('../../migrations/', import.meta.url)
  for (const file of readdirSync(dir).sort())
    sqlite.exec(readFileSync(new URL(file, dir), 'utf8'))
  const row = mapBackfill([doc], new Set(['conf-a'])).rows[0]
  sqlite
    .prepare(
      `INSERT INTO conferences (${Object.keys(row).join(', ')}) VALUES (${Object.keys(
        row,
      )
        .map(() => '?')
        .join(', ')})`,
    )
    .run(...Object.values(row))
  const statement = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...values: SQLInputValue[]) => statement(sql, values),
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => sqlite.prepare(sql).run(...params),
  })
  db = { prepare: (sql: string) => statement(sql) } as unknown as D1Database
  sanity.fetch.mockReset().mockResolvedValue([doc])
  logs = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    logs.push(line)
  })
  vi.spyOn(console, 'error').mockImplementation((line: string) => {
    logs.push(line)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  sqlite.close()
})
const run = () =>
  scheduled(
    {
      DB: db,
      SANITY_PROJECT_ID: 'p',
      SANITY_DATASET: 'd',
      SANITY_API_TOKEN_READ: 't',
    },
    now,
  )
const status = () => sqlite.prepare('SELECT * FROM job_status').get()

describe('conference parity status storage', () => {
  it('records a clean sweep, then replaces it with column-only drift', async () => {
    await expect(run()).resolves.toBeUndefined()
    expect(status()).toEqual({
      job: 'conference.parity',
      ran_at: now,
      status: 'ok',
      checked: 1,
      affected: 0,
      granted: null,
      detail: '[]',
    })
    // A dual-written column (#2064): frozen ones like city are not compared.
    sqlite.exec(
      "UPDATE conferences SET contact_email = 'private@wrong.example'",
    )
    await run()
    expect(status()).toEqual({
      job: 'conference.parity',
      ran_at: now,
      status: 'drift',
      checked: 1,
      affected: 1,
      granted: null,
      detail: JSON.stringify([
        { conferenceId: 'conf-a', fields: ['contact_email'] },
      ]),
    })
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM job_status').get(),
    ).toEqual({ n: 1 })
  })

  it('stores a vanished Sanity document with its marker, as logged', async () => {
    sqlite.exec(
      "INSERT INTO conferences (conference_id, org_id) VALUES ('conf-missing', 'org-a')",
    )
    await run()
    expect(status()).toMatchObject({
      status: 'drift',
      checked: 2,
      affected: 1,
      detail: JSON.stringify([
        { conferenceId: 'conf-missing', fields: ['(missing in sanity)'] },
      ]),
    })
    expect(logs.map((line) => JSON.parse(line))).toContainEqual({
      event: 'conference.parity.drift',
      conferenceId: 'conf-missing',
      fields: ['(missing in sanity)'],
    })
  })

  it('records unknown after the existing failed-read log', async () => {
    sanity.fetch.mockRejectedValue(new Error('private failure text'))
    await expect(run()).resolves.toBeUndefined()
    expect(status()).toEqual({
      job: 'conference.parity',
      ran_at: now,
      status: 'unknown',
      checked: null,
      affected: null,
      granted: null,
      detail: null,
    })
    expect(logs.map((line) => JSON.parse(line))).toEqual([
      {
        event: 'conference.parity.error',
        status: 'unknown',
        reason: 'read failed',
      },
    ])
  })

  it.each(['clean', 'drift', 'unknown'])(
    'preserves the %s outcome if only status writes fail',
    async (outcome) => {
      if (outcome === 'drift')
        sqlite.exec(
          "UPDATE conferences SET contact_email = 'private@wrong.example'",
        )
      if (outcome === 'unknown')
        sanity.fetch.mockRejectedValue(new Error('private failure text'))
      await run()
      const expectedLogs = [...logs]
      // Each case really is that outcome, so the comparison below means it.
      const events = expectedLogs.map((l) => JSON.parse(l).event)
      expect(events).toContain(
        {
          clean: 'conference.parity.sweep',
          drift: 'conference.parity.drift',
          unknown: 'conference.parity.error',
        }[outcome],
      )
      if (outcome === 'clean')
        expect(events).not.toContain('conference.parity.drift')
      logs.length = 0
      const prepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql) => {
        if (sql.includes('job_status')) throw new Error('private DB failure')
        return prepare(sql)
      })
      await expect(run()).resolves.toBeUndefined()
      expect(logs).toEqual([
        ...expectedLogs,
        JSON.stringify({
          event: 'job_status.write_failed',
          job: 'conference.parity',
        }),
      ])
    },
  )
})
