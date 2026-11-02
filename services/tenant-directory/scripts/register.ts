// Registers backfilled custom domains with Cloudflare (#1825). Same create
// step as addCustomDomain, but the id goes into an SQL file, not into D1.
import type { CustomHostnames } from '../src/data/cloudflare'

export interface UnregisteredDomain {
  hostname: string
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

/** Creates each hostname (unless dryRun); returns UPDATEs and failures. */
export async function registerCustomDomains(
  rows: UnregisteredDomain[],
  hostnames: CustomHostnames,
  dryRun: boolean,
  now = Date.now(),
) {
  const sql: string[] = []
  const failed: string[] = []
  for (const { hostname } of rows) {
    if (dryRun) continue
    try {
      // A rerun before the SQL was applied finds the hostname it made last time.
      const { id, verification } =
        (await hostnames.find(hostname)) ?? (await hostnames.create(hostname))
      sql.push(
        `UPDATE domains SET cf_custom_hostname_id = ${q(id)}, verification = ${q(verification)}, checked_at = ${now} WHERE hostname = ${q(hostname)} AND kind = 'custom' AND cf_custom_hostname_id IS NULL;`,
      )
    } catch (error) {
      // One failure must not lose the ids already created.
      failed.push(`${hostname}: ${(error as Error).message}`)
    }
  }
  return { sql: sql.length ? sql.join('\n') + '\n' : '', failed }
}
