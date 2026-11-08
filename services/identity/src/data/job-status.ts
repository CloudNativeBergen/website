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

export function memberSyncStatus(db: D1Database, job = 'identity.member_sync') {
  return db
    .prepare('SELECT * FROM job_status WHERE job = ?1')
    .bind(job)
    .first<JobStatusRow>()
}

/** Access drift of the orgs still granting from Sanity (#2101). */
export const PREFLIGHT_JOB = 'identity.member_sync.preflight'

/** Orgs switched to identity-as-source (#2101), from the member_source table. */
export async function identitySourceOrgs(db: D1Database) {
  const { results } = await db
    .prepare('SELECT organizationId FROM member_source')
    .all<{ organizationId: string }>()
  return new Set(results.map((r) => r.organizationId))
}

export async function isIdentitySource(db: D1Database, orgId: string) {
  return !!(await db
    .prepare('SELECT 1 FROM member_source WHERE organizationId = ?1')
    .bind(orgId)
    .first())
}

/** A switch needs a member sync this recent (it runs hourly). */
export const SWITCH_MAX_SYNC_AGE_MS = 2 * 3600_000

/**
 * Why the org may not switch to identity-as-source yet, or null. The latest
 * member sync must be recent, not failed, and report no access drift for the
 * org: nobody in Sanity missing from identity, nobody in identity missing
 * from Sanity, no role that fails org.manage_members. ownersBelowTwo and
 * invitePending are not access drift and do not block.
 */
export async function switchRefusal(db: D1Database, orgId: string) {
  // Both rows come from one run: the main one for orgs already in drift mode
  // (MEMBER_SOURCE_ORGS), the preflight one for orgs still granting.
  for (const job of ['identity.member_sync', PREFLIGHT_JOB]) {
    const row = await memberSyncStatus(db, job)
    if (!row || Date.now() - row.ran_at > SWITCH_MAX_SYNC_AGE_MS)
      return 'No member sync in the last two hours'
    if (row.status === 'failed') return 'The latest member sync failed'
    const d = (JSON.parse(row.detail ?? '[]') as MemberSyncDrift[]).find(
      (x) => x.orgId === orgId,
    )?.counts
    if (d && d.missingInIdentity + d.missingInSanity + d.roleMismatch > 0)
      return 'The latest member sync reported drift for this organization'
  }
  return null
}

/** Switch on (after the gate) or off (rollback, always allowed). Audited. */
export async function setMemberSource(
  db: D1Database,
  orgId: string,
  identity: boolean,
  actorId: string,
): Promise<string | null> {
  if (
    !(await db
      .prepare('SELECT 1 FROM organization WHERE id = ?1')
      .bind(orgId)
      .first())
  )
    return 'Unknown organization'
  if (identity) {
    const refusal = await switchRefusal(db, orgId)
    if (refusal) return refusal
  }
  const write = identity
    ? db
        .prepare(
          'INSERT INTO member_source (organizationId, switchedAt, switchedBy) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING',
        )
        .bind(orgId, Date.now(), actorId)
    : db
        .prepare('DELETE FROM member_source WHERE organizationId = ?1')
        .bind(orgId)
  await db.batch([
    write,
    db
      .prepare(
        'INSERT INTO audit_event (action, userId, detail) VALUES (?1, ?2, ?3)',
      )
      .bind(
        identity ? 'member_source.identity' : 'member_source.sanity',
        actorId,
        JSON.stringify({ actorId, orgId }),
      ),
  ])
  return null
}
