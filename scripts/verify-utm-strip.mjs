#!/usr/bin/env node
/**
 * REAL-BROWSER ACCEPTANCE for #1146 (spec `docs/MARKETING_SHORT_LINKS_SPEC.md`
 * §3): a tagged landing loses its `utm_*` from the address bar AFTER PostHog
 * has read them, and attribution survives. A mocked SDK cannot show this; the
 * question is what the real SDK does in a real browser.
 *
 * What it drives (headless Chromium, the dev server, the tenant's real
 * PostHog project through the `/ingest` rewrite):
 *   A. cookieless: land tagged, never answer the bar. The landing `$pageview`
 *      carries the tags, then the bar is clean (`keep=1` and the hash kept),
 *      no history entry added.
 *   B. accept AFTER the strip: land tagged, wait for the clean bar, click
 *      Accept, then capture a later event. `$opt_in` (the new session's first
 *      event) and the later events carry the campaign.
 *   C. `/cfp` tagged: the CFP first-touch stash holds the tags after the
 *      strip.
 * Then, only when `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` are set,
 * it asks PostHog (HogQL) what was INGESTED: A's session must have
 * `$entry_utm_campaign`/`$entry_utm_content`, B's `$opt_in` and later event
 * must carry the campaign. Without them those checks print NOT RUN.
 *
 * Events are tagged by the development-only `__ph_verify` flag
 * (`src/lib/posthog/init.ts`): it lifts the SDK's bot filter and files them
 * under `conference = 'verify-test'`, never the real conference.
 *
 * Usage: node scripts/verify-utm-strip.mjs
 *   VERIFY_BASE_URL   an already-running dev server (default: start one)
 *   VERIFY_PORT       port for the dev server this script starts (default 3947)
 *   VERIFY_TENANT_HOST the Host the server must see to pick the tenant
 *                     (default localhost:3000; a proxy rewrites it, so the
 *                     server itself can run on any free port)
 *   POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID, POSTHOG_API_HOST
 *                     (default https://eu.posthog.com) for the HogQL checks
 */

import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const RUN = `v1146-${Date.now()}`
const TENANT_HOST = process.env.VERIFY_TENANT_HOST ?? 'localhost:3000'
const STRIP_BUDGET_MS = 3500
// One user agent per scenario: PostHog's cookieless server session is keyed
// on IP + user agent + host, so scenarios sharing one would share a session
// and its first-touch entry UTMs (#1000 finding 3).
const ua = (scenario) =>
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 verify/${RUN}-${scenario}`

const results = []
function check(name, ok, detail = '') {
  results.push({ name, status: ok ? 'PASS' : 'FAIL', detail })
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
  )
}
function notRun(name, why) {
  results.push({ name, status: 'NOT RUN', detail: why })
  console.log(`NOT RUN  ${name}  (${why})`)
}

// ── server ────────────────────────────────────────────────────────────────
const cleanups = []
async function waitFor(url, headers, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers })
      if (res.status < 500) return
    } catch {}
    await sleep(1000)
  }
  throw new Error(`server at ${url} did not come up`)
}

async function upstream() {
  if (process.env.VERIFY_BASE_URL) return new URL(process.env.VERIFY_BASE_URL)
  const port = Number(process.env.VERIFY_PORT ?? 3947)
  const child = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(port)], {
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  })
  cleanups.push(() => process.kill(-child.pid, 'SIGTERM'))
  const url = new URL(`http://127.0.0.1:${port}`)
  await waitFor(url, { host: TENANT_HOST }, 180_000)
  return url
}

/** A proxy that presents the tenant Host to the server, whatever its port. */
function hostProxy(target) {
  const server = http.createServer((req, res) => {
    const out = http.request(
      {
        host: target.hostname,
        port: target.port,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: TENANT_HOST },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      },
    )
    out.on('error', () => res.destroy())
    req.pipe(out)
  })
  server.on('upgrade', (req, socket, head) => {
    const up = net.connect(Number(target.port), target.hostname, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`]
      for (const [k, v] of Object.entries({
        ...req.headers,
        host: TENANT_HOST,
      }))
        lines.push(`${k}: ${v}`)
      up.write(lines.join('\r\n') + '\r\n\r\n')
      up.write(head)
      up.pipe(socket).pipe(up)
    })
    up.on('error', () => socket.destroy())
    socket.on('error', () => up.destroy())
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      cleanups.push(() => server.close())
      resolve(`http://localhost:${server.address().port}`)
    })
  })
}

// ── browser ───────────────────────────────────────────────────────────────
/** Records every event the SDK captures, from before its first pageview. */
function recorder() {
  window.__verifyEvents = []
  window.__historyLengthAtLanding = history.length
  window.addEventListener('tenant-analytics:ready', () => {
    window.__tenantAnalytics.client.on('eventCaptured', (e) => {
      const p = e.properties ?? {}
      window.__verifyEvents.push({
        event: e.event,
        utm_campaign: p.utm_campaign ?? null,
        utm_content: p.utm_content ?? null,
        current_url: p.$current_url ?? null,
        cookieless: p.$cookieless_mode === true,
        session: p.$session_id ?? null,
      })
    })
  })
}

async function landing(browser, url, scenario) {
  const context = await browser.newContext({ userAgent: ua(scenario) })
  const page = await context.newPage()
  await page.addInitScript(recorder)
  // Status of every batch the SDK posts to the ingestion rewrite.
  const ingest = []
  page.on('response', (res) => {
    if (/\/e\/(\?|$)/.test(new URL(res.url()).pathname + '?'))
      ingest.push(res.status())
  })
  const start = Date.now()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  let clean = false
  try {
    await page.waitForFunction(() => !/[?&]utm_/.test(location.search), null, {
      timeout: STRIP_BUDGET_MS + 3000,
    })
    clean = true
  } catch {}
  return { context, page, ingest, stripMs: clean ? Date.now() - start : null }
}

const events = (page) => page.evaluate(() => window.__verifyEvents)

async function scenarioCookieless(browser, base) {
  const campaign = `verify-1146-${RUN}-a`
  const { context, page, ingest, stripMs } = await landing(
    browser,
    `${base}/?utm_source=x&utm_medium=y&utm_campaign=${campaign}&utm_content=k1&keep=1&__ph_verify=${RUN}-a#h`,
    'a',
  )
  check(
    'A: address bar clean within 3.5 s of navigation start',
    stripMs !== null && stripMs <= STRIP_BUDGET_MS,
    `${stripMs} ms`,
  )
  const loc = await page.evaluate(() => ({
    search: location.search,
    hash: location.hash,
    length: history.length,
    atLanding: window.__historyLengthAtLanding,
  }))
  check(
    'A: non-UTM params and hash survive',
    loc.search === `?keep=1&__ph_verify=${RUN}-a` && loc.hash === '#h',
    `${loc.search}${loc.hash}`,
  )
  check(
    'A: no history entry added',
    loc.length === loc.atLanding,
    `history.length ${loc.atLanding} -> ${loc.length}`,
  )
  // The Next router keeps its own copy of the URL and rewrites the address
  // bar from it on every router state change; a strip it did not see would
  // come back on the next refresh.
  await page.waitForFunction(() => window.next?.router, null, {
    timeout: 60_000,
  })
  await page.evaluate(() => window.next.router.refresh())
  await sleep(3000)
  const afterRefresh = await page.evaluate(() => location.search)
  check(
    'A: still clean after a router refresh',
    !afterRefresh.includes('utm_'),
    afterRefresh,
  )
  const [first] = (await events(page)).filter((e) => e.event === '$pageview')
  check(
    'A: landing $pageview captured cookieless WITH the tags, before the strip',
    first?.cookieless &&
      first.utm_campaign === campaign &&
      first.utm_content === 'k1' &&
      first.current_url?.includes('utm_campaign='),
    JSON.stringify(first ?? null),
  )
  await sleep(6000) // past the SDK batch interval
  check(
    'A: PostHog ingestion accepted the batches',
    ingest.length > 0 && ingest.every((s) => s === 200),
    JSON.stringify(ingest),
  )
  await context.close()
  return { campaign }
}

async function scenarioAccept(browser, base) {
  const campaign = `verify-1146-${RUN}-b`
  const { context, page, ingest, stripMs } = await landing(
    browser,
    `${base}/?utm_source=x&utm_campaign=${campaign}&utm_content=k2&__ph_verify=${RUN}-b`,
    'b',
  )
  check('B: bar clean before Accept', stripMs !== null, `${stripMs} ms`)
  await page
    .getByRole('region', { name: 'Analytics cookie choice' })
    .getByRole('button', { name: 'Accept' })
    .click()
  await page.evaluate(() => {
    const ph = window.__tenantAnalytics.client
    ph.capture('verify_later')
    ph.capture('$pageview')
  })
  const recorded = await events(page)
  const afterAccept = recorded.slice(
    recorded.findIndex((e) => e.event === '$opt_in'),
  )
  const optIn = afterAccept[0]
  check(
    'B: $opt_in (first event of the accepted session) carries the campaign',
    optIn?.event === '$opt_in' &&
      !optIn.cookieless &&
      optIn.utm_campaign === campaign,
    JSON.stringify(optIn ?? null),
  )
  const optInPageview = afterAccept.find(
    (e) => e.event === '$pageview' && e !== afterAccept.at(-1),
  )
  console.log(
    `INFO  B: SDK-fired opt-in $pageview: ${optInPageview ? JSON.stringify(optInPageview) : 'none (the landing pageview had already gone out)'}`,
  )
  const later = afterAccept.filter((e) => e.event !== '$opt_in')
  check(
    'B: later events carry the campaign',
    later.length >= 2 && later.every((e) => e.utm_campaign === campaign),
    JSON.stringify(later.map((e) => [e.event, e.utm_campaign])),
  )
  const cookie = await page.evaluate(() => document.cookie.includes('ph_'))
  check('B: Accept set the PostHog cookie', cookie)
  await sleep(6000)
  check(
    'B: PostHog ingestion accepted the batches',
    ingest.length > 0 && ingest.every((s) => s === 200),
    JSON.stringify(ingest),
  )
  await context.close()
  return { campaign }
}

async function scenarioCfp(browser, base) {
  const campaign = `verify-1146-${RUN}-cfp`
  const { context, page, stripMs } = await landing(
    browser,
    `${base}/cfp?utm_source=s&utm_medium=m&utm_campaign=${campaign}&utm_content=c3&__ph_verify=${RUN}-c`,
    'c',
  )
  check('C: /cfp bar clean', stripMs !== null, `${stripMs} ms`)
  const stash = await page.evaluate(() =>
    sessionStorage.getItem('konf.landingUtm.v1'),
  )
  const parsed = stash ? JSON.parse(stash) : null
  check(
    'C: CFP first-touch stash holds the tags after the strip',
    parsed?.campaign === campaign &&
      parsed.content === 'c3' &&
      parsed.source === 's',
    stash ?? 'null',
  )
  await context.close()
}

// ── PostHog ───────────────────────────────────────────────────────────────
async function hogql(query) {
  const host = process.env.POSTHOG_API_HOST ?? 'https://eu.posthog.com'
  const res = await fetch(
    `${host}/api/projects/${process.env.POSTHOG_PROJECT_ID}/query/`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
        'content-type': 'application/json',
      },
      // Never a cached answer: the first poll would pin an empty result.
      body: JSON.stringify({
        query: { kind: 'HogQLQuery', query },
        refresh: 'force_blocking',
      }),
    },
  )
  const body = await res.json()
  if (!res.ok) throw new Error(`HogQL ${res.status}: ${body.detail ?? ''}`)
  return body.results
}

async function ingested(a, b) {
  const names = [
    'PostHog: cookieless session has $entry_utm_campaign and $entry_utm_content',
    'PostHog: accepted visit: $opt_in and a later event carry the campaign, and the accepted session starts with it',
  ]
  if (
    !process.env.POSTHOG_PERSONAL_API_KEY ||
    !process.env.POSTHOG_PROJECT_ID
  ) {
    for (const n of names)
      notRun(n, 'no POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID')
    return
  }
  const query = `SELECT event, properties.utm_campaign, properties.utm_content,
      session.$entry_utm_campaign, session.$entry_utm_content,
      properties.$cookieless_mode, properties.$current_url
    FROM events
    WHERE properties.conference = 'verify-test'
      AND timestamp > now() - INTERVAL 1 HOUR
      AND properties.$current_url LIKE '%__ph_verify=${RUN}-%'
    ORDER BY timestamp`
  let rows = []
  // Ingestion lags; poll for up to ten minutes.
  for (let i = 0; i < 60; i++) {
    rows = await hogql(query)
    const haveA = rows.some((r) => r[6]?.includes(`${RUN}-a`))
    const haveB = rows.some((r) => r[0] === 'verify_later')
    if (haveA && haveB) break
    await sleep(10_000)
  }
  console.log(`INFO  ${rows.length} ingested rows:`)
  for (const r of rows) console.log('     ', JSON.stringify(r))
  const rowsA = rows.filter((r) => r[6]?.includes(`${RUN}-a`))
  check(
    names[0],
    rowsA.length > 0 &&
      rowsA.every((r) => r[3] === a.campaign && r[4] === 'k1'),
    `${rowsA.length} rows`,
  )
  const rowsB = rows.filter((r) => r[6]?.includes(`${RUN}-b`))
  const optIn = rowsB.find((r) => r[0] === '$opt_in')
  const later = rowsB.find((r) => r[0] === 'verify_later')
  check(
    names[1],
    optIn?.[1] === b.campaign &&
      optIn?.[3] === b.campaign &&
      later?.[1] === b.campaign,
    JSON.stringify({ optIn, later }),
  )
}

// ── main ──────────────────────────────────────────────────────────────────
let exitCode = 0
try {
  const base = await hostProxy(await upstream())
  console.log(`run ${RUN} against ${base} (Host: ${TENANT_HOST})`)
  const browser = await chromium.launch()
  cleanups.push(() => browser.close())
  const a = await scenarioCookieless(browser, base)
  const b = await scenarioAccept(browser, base)
  await scenarioCfp(browser, base)
  await ingested(a, b)
} catch (error) {
  console.error(error)
  exitCode = 1
} finally {
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup()
    } catch {}
  }
}
if (results.some((r) => r.status === 'FAIL')) exitCode = 1
console.log(
  `\n${results.filter((r) => r.status === 'PASS').length} pass, ${results.filter((r) => r.status === 'FAIL').length} fail, ${results.filter((r) => r.status === 'NOT RUN').length} not run`,
)
process.exit(exitCode)
