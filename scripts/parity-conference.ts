#!/usr/bin/env tsx

/**
 * Sanity vs GraphQL parity for conferences (#1832, epic #1772). READ-ONLY on
 * both sides: one Sanity query and anonymous GraphQL reads. Both sides go
 * through the backfill mapping, so a difference is data, not mapping.
 * Not run in CI: run it by hand after the backfill is applied.
 *
 * Usage:
 *   pnpm tsx scripts/parity-conference.ts --host <host>
 *   pnpm tsx scripts/parity-conference.ts --all
 *   [--api <url>]  default https://api.konf.app/graphql
 *
 * Exits 1 on any difference.
 */

import {
  FIELDS,
  diffConference,
  expected,
} from '../services/conference/scripts/parity'
import { normalizeHost } from '../services/tenant-directory/src/data/naming'
import { loadBackfill } from './backfill-conference'

const QUERY = `{ conference { ${FIELDS.join(' ')} } }`

async function fetchApi(api: string, host: string) {
  const res = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: `https://${host}` },
    body: JSON.stringify({ query: QUERY }),
  })
  const body = await res.json()
  if (!res.ok || body.errors)
    throw new Error(`${host}: ${res.status} ${JSON.stringify(body.errors)}`)
  return body.data.conference
}

async function main() {
  const args = process.argv.slice(2)
  const opt = (k: string) => {
    const i = args.indexOf(k)
    return i >= 0 ? args[i + 1] : undefined
  }
  const api = opt('--api') ?? 'https://api.konf.app/graphql'
  const all = args.includes('--all')
  const host = opt('--host') && normalizeHost(opt('--host')!)
  if (!all && !host) {
    console.error('usage: parity-conference.ts --host <host> | --all')
    process.exit(2)
  }

  const { rows, domains } = await loadBackfill()
  const byId = new Map(rows.map((r) => [r.conference_id, r]))
  // --all: one host per conference, its platform edition host.
  const targets = all
    ? domains.filter((d) => d.kind === 'platform-edition')
    : domains.filter((d) => d.hostname === host)
  if (!targets.length) {
    console.error(`${host}: not a routable host in Sanity`)
    process.exit(1)
  }

  let failed = 0
  for (const d of targets) {
    try {
      const diff = diffConference(
        expected(byId.get(d.conferenceId)),
        await fetchApi(api, d.hostname),
      )
      if (!diff.length) {
        console.log(`ok    ${d.hostname} (${d.conferenceId})`)
        continue
      }
      failed++
      console.log(`DIFF  ${d.hostname} (${d.conferenceId})`)
      for (const f of diff)
        console.log(
          `  ${f.field}\n    sanity: ${f.sanity}\n    api:    ${f.api}`,
        )
    } catch (e) {
      failed++
      console.log(`ERROR ${d.hostname}: ${(e as Error).message}`)
    }
  }
  console.log(
    `\n${targets.length} checked, ${targets.length - failed} equal, ${failed} different`,
  )
  if (failed) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
