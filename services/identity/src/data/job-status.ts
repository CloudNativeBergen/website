// job_status is outside the Drizzle mirror on purpose.
export interface MemberSyncDrift {
  orgId: string
  counts: {
    missingInIdentity: number
    missingInSanity: number
    roleMismatch: number
    ownersBelowTwo?: number
    invitePending?: number
  }
}

export interface JobStatusRow {
  job: string
  ran_at: number
  status: 'ok' | 'drift' | 'unknown' | 'failed'
  checked: number | null
  affected: number | null
  granted: number | null
  detail: string | null
}

export async function recordJobStatus(db: D1Database, row: JobStatusRow) {
  try {
    await db
      .prepare(
        `INSERT INTO job_status (job, ran_at, status, checked, affected, granted, detail)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(job) DO UPDATE SET ran_at = excluded.ran_at,
      status = excluded.status, checked = excluded.checked, affected = excluded.affected,
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

export function memberSyncStatus(db: D1Database) {
  return db
    .prepare('SELECT * FROM job_status WHERE job = ?1')
    .bind('identity.member_sync')
    .first<JobStatusRow>()
}
