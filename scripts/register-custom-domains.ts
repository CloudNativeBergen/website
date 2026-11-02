#!/usr/bin/env tsx

/**
 * Per-tenant Cloudflare registration of backfilled custom domains (#1825).
 * Run once per org before cutover, after owner approval. It READS the remote
 * tenant-directory D1 (wrangler, SELECT only), creates the Cloudflare custom
 * hostnames, and writes the ids to an SQL file of UPDATEs that the owner
 * applies with `wrangler d1 execute --file`. The cron then verifies.
 *
 * Usage (from the repo root, CF_API_TOKEN and CF_ZONE_ID set):
 *   pnpm tsx scripts/register-custom-domains.ts --org <slug> --dry-run
 *   pnpm tsx scripts/register-custom-domains.ts --org <slug> [--out <dir>]
 *
 * Apply the file before any rerun: an unapplied rerun asks Cloudflare for
 * the same hostnames again.
 */

import { execFileSync } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { cloudflareHostnames } from '../services/tenant-directory/src/data/cloudflare'
import { SLUG } from '../services/tenant-directory/src/data/naming'
import { registerCustomDomains } from '../services/tenant-directory/scripts/register'

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : undefined
  }
  const org = arg('--org')
  if (!org || !SLUG.test(org)) throw new Error('--org <slug> is required')
  const dryRun = args.includes('--dry-run')

  const out = execFileSync(
    'pnpm',
    [
      '--silent',
      '--filter',
      '@runkonf/tenant-directory',
      'exec',
      'wrangler',
      'd1',
      'execute',
      'konf-tenant-directory',
      '--remote',
      '--json',
      '--command',
      `SELECT d.hostname FROM domains d JOIN organizations o ON o.id = d.org_id WHERE o.slug = '${org}' AND d.kind = 'custom' AND d.cf_custom_hostname_id IS NULL ORDER BY d.hostname`,
    ],
    { encoding: 'utf8' },
  )
  const rows: { hostname: string }[] = JSON.parse(out)[0].results
  console.log(`${org}: ${rows.length} unregistered custom domains`)
  for (const r of rows) console.log(`  ${r.hostname}`)

  const env = {
    CF_API_TOKEN: process.env.CF_API_TOKEN ?? '',
    CF_ZONE_ID: process.env.CF_ZONE_ID ?? '',
  }
  if (!dryRun && (!env.CF_API_TOKEN || !env.CF_ZONE_ID))
    throw new Error('CF_API_TOKEN and CF_ZONE_ID are required')
  const { sql, failed } = await registerCustomDomains(
    rows,
    cloudflareHostnames(env),
    dryRun,
  )
  for (const f of failed) console.error(`  failed ${f}`)
  if (dryRun) return

  const file = join(arg('--out') ?? '.', `register-${org}.sql`)
  writeFileSync(file, sql)
  console.log(`wrote ${file}`)
  if (failed.length) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
