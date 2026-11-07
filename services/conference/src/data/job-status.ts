// job_status is intentionally outside the Drizzle mirror of conference tables.
export interface JobStatusRow {
  job: string
  ran_at: number
  status: 'ok' | 'drift' | 'unknown' | 'failed'
  checked: number | null
  affected: number | null
  granted: number | null
  detail: string | null
}

export interface ConferenceParityDrift {
  conferenceId: string
  fields: string[]
}

export async function recordJobStatus(db: D1Database, row: JobStatusRow) {
  try {
    await db
      .prepare(
        `INSERT INTO job_status (job, ran_at, status, checked, affected, granted, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(job) DO UPDATE SET
           ran_at = excluded.ran_at, status = excluded.status,
           checked = excluded.checked, affected = excluded.affected,
           granted = excluded.granted, detail = excluded.detail`,
      )
      .bind(
        row.job,
        row.ran_at,
        row.status,
        row.checked,
        row.affected,
        row.granted,
        row.detail,
      )
      .run()
  } catch {
    console.error(
      JSON.stringify({ event: 'job_status.write_failed', job: row.job }),
    )
  }
}

export async function conferenceParityStatus(db: D1Database) {
  const row = await db
    .prepare('SELECT * FROM job_status WHERE job = ?')
    .bind('conference.parity')
    .first<JobStatusRow>()
  return row
    ? {
        ranAt: new Date(row.ran_at).toISOString(),
        status: row.status,
        checked: row.checked,
        affected: row.affected,
        drifted: row.detail
          ? (JSON.parse(row.detail) as ConferenceParityDrift[])
          : [],
      }
    : null
}
