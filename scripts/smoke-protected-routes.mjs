#!/usr/bin/env node
/**
 * POST-BUILD RUNTIME SMOKE TEST — the guardrail for the #462 incident.
 *
 * Context (issue #671): PR #462 fed NextAuth a CONFIG FUNCTION (Auth.js "lazy"
 * form). In next-auth v5 that changes the shape of the returned `auth`, so the
 * middleware wrapper `auth((req) => …)` in `src/proxy.ts` produced a
 * NON-function — every authenticated route (admin + speaker dashboard) 500'd
 * with `nextAuthMiddleware is not a function`. It passed CI because `next build`
 * COMPILES the lazy form fine (the failure is runtime-only) and vitest aliases
 * `next-auth` to a mock whose `auth()` always returns a function — so no unit
 * test could ever tell the two config shapes apart.
 *
 * This script closes that gap by exercising the REAL production bundle: it boots
 * `next start` against a real `next build`, then hits the exact failure surface —
 * a PROTECTED route, which runs the middleware — plus a NextAuth route handler,
 * and FAILS LOUDLY on any 500 or `is not a function` / `TypeError` signature.
 * Hitting a protected route UNAUTHENTICATED runs the middleware and should
 * redirect to sign-in (3xx) WITHOUT needing Sanity/WorkOS/any backend.
 *
 * PART 2 — PER-REQUEST SESSION-COOKIE DOMAIN (#682). The same lesson applies to
 * the multi-tenant cookie fix: unit tests cannot see what the real bundle puts
 * on the wire. The session cookie's `Domain` used to be computed ONCE at module
 * load and applied to every host, so a tenant on their own apex got a `Domain`
 * the browser REJECTS — sign-in failed SILENTLY (OAuth succeeded, cookie
 * dropped, back to the sign-in page with no error). This script therefore drives
 * a real sign-OUT (the only route that emits a session `Set-Cookie` without a
 * live OAuth round-trip) against SEVERAL simulated hosts in ONE server process
 * and asserts each gets the `Domain` that host's browser would accept.
 *
 * Usage: node scripts/smoke-protected-routes.mjs [--port 3123]
 *   (or set SMOKE_PORT). Assumes a production build already exists in `.next`
 *   (run `next build` first).
 */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const RAW_PORT =
  process.env.SMOKE_PORT ??
  (process.argv.includes('--port')
    ? process.argv[process.argv.indexOf('--port') + 1]
    : '3123')
const PORT = Number(RAW_PORT)
// A bare `--port` with no value, or a non-numeric SMOKE_PORT, yields NaN — fail
// loudly instead of booting `next start` against an invalid `http://…:NaN` URL.
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  process.stderr.write(
    `[smoke] invalid port: ${JSON.stringify(RAW_PORT)} — pass a valid --port <1-65535> or SMOKE_PORT.\n`,
  )
  process.exit(1)
}
const BASE = `http://127.0.0.1:${PORT}`
const BOOT_TIMEOUT_MS = 90_000
const POLL_INTERVAL_MS = 750

// Error signatures that indicate the middleware/config regression (or any
// unhandled server error) rather than an expected auth redirect.
const ERROR_SIGNATURES = [
  'is not a function',
  'TypeError',
  'Internal Server Error',
  'ReferenceError',
]

/**
 * Surfaces to probe. `expectRedirect` routes MUST run the middleware
 * (protected paths) and are the precise crash surface; the API handler proves
 * the NextAuth route handlers (the other half of the returned `auth`) boot.
 */
const SURFACES = [
  {
    name: 'admin dashboard (middleware, unauthenticated)',
    path: '/admin',
    expect: 'redirect-or-ok',
  },
  {
    name: 'speaker CFP list (middleware, unauthenticated)',
    path: '/cfp/list',
    expect: 'redirect-or-ok',
  },
  {
    name: 'NextAuth providers route handler',
    path: '/api/auth/providers',
    expect: 'ok',
  },
]

/**
 * Hosts to drive the sign-out cookie probe with, and the `Domain` each MUST get.
 * `null` means "no Domain attribute" (host-only) — the correct, safe answer for
 * a platform-shared parent whose subdomains belong to different tenants.
 *
 * Two DIFFERENT registrable domains are deliberately probed in ONE process:
 * that is exactly what a module-load-time constant cannot satisfy.
 */
const COOKIE_DOMAIN_HOSTS = [
  { host: 'admin.cloudnativedays.no', expect: '.cloudnativedays.no' },
  { host: 'www.someconf.com', expect: '.someconf.com' },
  // A tenant on their OWN apex — the host the old module-load derivation broke.
  { host: 'someconf.com', expect: '.someconf.com' },
  // Platform-shared parents: host-only, or one tenant could read another's
  // session cookie (and every tenant apex would break).
  { host: 'tenant.konf.run', expect: null },
  { host: 'tenant.konf.app', expect: null },
]

/** Session-token cookie names @auth/core may use (https adds `__Secure-`). */
const SESSION_COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
]

function log(msg) {
  process.stdout.write(`[smoke] ${msg}\n`)
}

let server

function startServer() {
  const startArgs = ['next', 'start', '-p', String(PORT)]
  log(`booting: pnpm exec ${startArgs.join(' ')}`)
  server = spawn('pnpm', ['exec', ...startArgs], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      // Force the auth base URL to THIS smoke server's port so next-auth's
      // host/URL construction matches where we actually boot — the ambient
      // NEXTAUTH_URL/AUTH_URL (CI sets localhost:3000) would mismatch our port
      // and make the smoke flaky. Self-contained over inherited.
      NEXTAUTH_URL: `http://localhost:${PORT}`,
      AUTH_URL: `http://localhost:${PORT}`,
      AUTH_TRUST_HOST: 'true',
      // Minimal dummy env — a protected-route redirect never needs real
      // secrets. Mirrors the CI Build job's placeholder env. Real env wins.
      AUTH_SECRET:
        process.env.AUTH_SECRET ?? 'ci-smoke-secret-not-for-production',
      AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID ?? 'ci-smoke-github-id',
      AUTH_GITHUB_SECRET:
        process.env.AUTH_GITHUB_SECRET ?? 'ci-smoke-github-secret',
      AUTH_LINKEDIN_ID: process.env.AUTH_LINKEDIN_ID ?? 'ci-smoke-linkedin-id',
      AUTH_LINKEDIN_SECRET:
        process.env.AUTH_LINKEDIN_SECRET ?? 'ci-smoke-linkedin-secret',
      // Auth.js v5 refuses to serve its route handlers on an "untrusted" Host
      // unless trustHost is set — Vercel auto-enables it in prod, but a bare
      // `next start` (local/CI) does not, so `/api/auth/*` would 500 with
      // `UntrustedHost` and mask the real signal. Trust the loopback host we
      // ourselves bind to.
      AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? 'true',
      // A few modules assert their env at import-time (e.g. the contract-
      // reminders cron route asserts RESEND_API_KEY); provide dummies so an
      // unrelated route's module-eval cannot throw during boot.
      RESEND_API_KEY: process.env.RESEND_API_KEY ?? 're_ci_smoke_not_for_prod',
      INVITATION_TOKEN_SECRET:
        process.env.INVITATION_TOKEN_SECRET ?? 'ci_smoke_invitation_secret',
      VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? 'ci_smoke_vapid_public',
      VAPID_PRIVATE_KEY:
        process.env.VAPID_PRIVATE_KEY ?? 'ci_smoke_vapid_private',
      VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? 'mailto:ci@example.com',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  server.on('exit', (code, signal) => {
    if (code && code !== 0 && !shuttingDown) {
      log(`server exited early (code=${code} signal=${signal})`)
    }
  })
}

let shuttingDown = false
function stopServer() {
  if (shuttingDown || !server) return
  shuttingDown = true
  try {
    server.kill('SIGTERM')
  } catch {
    // already gone
  }
}

// Best-effort cleanup on NORMAL process exit — the 'exit' handler runs
// synchronously and cannot change the exit code or run async work.
process.on('exit', stopServer)

// On a SIGNAL or an UNCAUGHT EXCEPTION we must exit EXPLICITLY: installing a
// handler overrides Node's default behavior of terminating the process, so if
// we only stopped the child the process would hang (child killed, parent alive
// with nothing left to do). Stop the child, then exit non-zero.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log(`received ${sig} — stopping server and exiting`)
    stopServer()
    process.exit(1)
  })
}
process.on('uncaughtException', (err) => {
  log(`uncaught exception: ${err?.stack ?? err}`)
  stopServer()
  process.exit(1)
})

async function waitForReady() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (server?.exitCode != null) {
      throw new Error(
        `server process exited (code=${server.exitCode}) before ready`,
      )
    }
    try {
      // Any HTTP response (even non-200) means the server accepts connections.
      const res = await fetch(`${BASE}/api/auth/providers`, {
        redirect: 'manual',
      })
      if (res.status > 0) {
        log(`server ready (providers responded ${res.status})`)
        return
      }
    } catch {
      // not up yet
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`server not ready within ${BOOT_TIMEOUT_MS}ms`)
}

function bodySignatureHit(body) {
  return ERROR_SIGNATURES.find((sig) => body.includes(sig))
}

async function probe(surface) {
  const res = await fetch(`${BASE}${surface.path}`, { redirect: 'manual' })
  const body = await res.text().catch(() => '')
  const failures = []

  if (res.status >= 500) {
    failures.push(`HTTP ${res.status} (server error)`)
  }
  const sig = bodySignatureHit(body)
  if (sig) {
    failures.push(`body contains error signature: "${sig}"`)
  }
  if (surface.expect === 'redirect-or-ok') {
    const ok =
      (res.status >= 300 && res.status < 400) ||
      (res.status >= 200 && res.status < 300)
    if (!ok) {
      failures.push(
        `expected a 2xx render or 3xx sign-in redirect, got ${res.status}`,
      )
    }
  } else if (surface.expect === 'ok') {
    if (res.status >= 400) {
      failures.push(`expected a 2xx/3xx response, got ${res.status}`)
    }
  }

  const loc = res.headers.get('location')
  const detail = `${res.status}${loc ? ` → ${loc}` : ''}`
  return { failures, detail }
}

/** The cookie name of a raw `Set-Cookie` value. */
function setCookieName(value) {
  return value.split(';')[0].split('=')[0].trim()
}

/** The `Domain` attribute of a raw `Set-Cookie` value, or null when host-only. */
function setCookieDomain(value) {
  for (const attr of value.split(';').slice(1)) {
    const eq = attr.indexOf('=')
    if (eq === -1) continue
    if (attr.slice(0, eq).trim().toLowerCase() === 'domain') {
      return attr.slice(eq + 1).trim()
    }
  }
  return null
}

function isSessionCookie(value) {
  const name = setCookieName(value)
  return SESSION_COOKIE_NAMES.some(
    (base) => name === base || name.startsWith(`${base}.`),
  )
}

/**
 * Drive a real sign-OUT for `host` and return the `Domain` the running server
 * scoped the session cookie to.
 *
 * Sign-out is the only route that emits a session `Set-Cookie` without a live
 * OAuth round-trip — @auth/core clears the cookie through the SAME cookie
 * options it sets it with, so whatever `Domain` shows up here is exactly what a
 * successful sign-IN would have used. It needs no Sanity/provider backend.
 *
 * Two requests are needed: `/api/auth/csrf` for the double-submit token, then
 * the POST. A dummy session cookie must ride along — @auth/core returns early
 * (and emits no cookies) when the request carries no session token at all; its
 * JWT fails to decode, which is logged and ignored, and the clear is still sent.
 */
async function signOutSessionCookies(host) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { 'x-forwarded-host': host },
    redirect: 'manual',
  })
  const csrfBody = await csrfRes.json().catch(() => ({}))
  const csrfToken = csrfBody?.csrfToken
  if (!csrfToken) {
    throw new Error(`could not obtain a CSRF token (HTTP ${csrfRes.status})`)
  }
  const csrfCookies = csrfRes.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')

  const res = await fetch(`${BASE}/api/auth/signout`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'x-forwarded-host': host,
      'content-type': 'application/x-www-form-urlencoded',
      cookie: `${csrfCookies}; authjs.session-token=smoke-not-a-real-token`,
    },
    body: new URLSearchParams({
      csrfToken,
      callbackUrl: '/',
      json: 'true',
    }).toString(),
  })

  const body = await res.text().catch(() => '')
  const sig = bodySignatureHit(body)
  if (sig) throw new Error(`sign-out body contains error signature: "${sig}"`)
  if (res.status >= 500) throw new Error(`sign-out returned HTTP ${res.status}`)

  return res.headers.getSetCookie().filter(isSessionCookie)
}

/**
 * Assert the session cookie `Domain` the SERVER actually emits for one host.
 *
 * This is the runtime half of the #682 fix: a `Domain` derived once at module
 * load would give every host below the SAME value, which the browser rejects on
 * all but one of them — dropping the cookie and failing sign-in silently.
 */
async function probeCookieDomain({ host, expect }) {
  const failures = []
  const cookies = await signOutSessionCookies(host)

  if (cookies.length === 0) {
    return {
      failures: ['no session-token Set-Cookie was emitted by sign-out'],
      detail: 'none',
      domains: [],
    }
  }

  const domains = cookies.map(setCookieDomain)
  const widened = domains.filter((domain) => domain !== null)

  if (expect === null) {
    if (widened.length > 0) {
      failures.push(
        `expected a HOST-ONLY cookie on a platform-shared parent, got Domain=${widened.join(', ')}`,
      )
    }
  } else {
    if (!domains.includes(expect)) {
      failures.push(
        `expected Domain=${expect}, got ${domains.map((d) => d ?? 'host-only').join(', ')}`,
      )
    }
    for (const domain of widened) {
      if (domain !== expect) {
        failures.push(`unexpected extra Domain=${domain}`)
      }
      // A browser only stores a cookie whose Domain domain-matches the request
      // host. Anything else is dropped — the silent failure mode of #682.
      const bare = domain.replace(/^\./, '')
      if (host !== bare && !host.endsWith(`.${bare}`)) {
        failures.push(
          `Domain=${domain} does not domain-match host ${host} — a browser would REJECT it`,
        )
      }
    }
    // Sign-out must also clear any residual HOST-ONLY cookie of the same name;
    // a Set-Cookie carrying a Domain can never delete one.
    if (!domains.includes(null)) {
      failures.push(
        'sign-out did not also clear the host-only cookie (a stale cookie would keep the user signed in)',
      )
    }
  }

  return {
    failures,
    detail: domains.map((d) => d ?? 'host-only').join(', '),
    domains,
  }
}

/**
 * PART 2: per-request session-cookie `Domain`, in ONE server process (#682).
 * Returns true on failure.
 */
async function runCookieDomainProbes() {
  let failed = false
  const observed = new Map()

  for (const target of COOKIE_DOMAIN_HOSTS) {
    try {
      const { failures, detail } = await probeCookieDomain(target)
      observed.set(target.host, detail)
      if (failures.length) {
        failed = true
        log(`FAIL  session cookie Domain for ${target.host} — ${detail}`)
        for (const f of failures) log(`        ✗ ${f}`)
      } else {
        log(`PASS  session cookie Domain for ${target.host} — ${detail}`)
      }
    } catch (err) {
      failed = true
      log(`FAIL  session cookie Domain for ${target.host} — ${err}`)
    }
  }

  // THE core regression: two different registrable domains, one process, one
  // build — they MUST NOT share a cookie Domain. A module-load constant does.
  const a = observed.get('admin.cloudnativedays.no')
  const b = observed.get('www.someconf.com')
  if (a !== undefined && b !== undefined && a === b) {
    failed = true
    log(
      `FAIL  two different hosts received the SAME cookie Domain (${a}) — the Domain is not per-request`,
    )
  }

  return failed
}

async function main() {
  startServer()
  await waitForReady()

  let failed = false
  for (const surface of SURFACES) {
    try {
      const { failures, detail } = await probe(surface)
      if (failures.length) {
        failed = true
        log(`FAIL  ${surface.name} [${surface.path}] — ${detail}`)
        for (const f of failures) log(`        ✗ ${f}`)
      } else {
        log(`PASS  ${surface.name} [${surface.path}] — ${detail}`)
      }
    } catch (err) {
      failed = true
      log(`FAIL  ${surface.name} [${surface.path}] — request threw: ${err}`)
    }
  }

  if (await runCookieDomainProbes()) failed = true

  if (failed) {
    log('SMOKE TEST FAILED — a protected route errored, returned 500, or')
    log('scoped the session cookie to the wrong Domain.')
    log('This is the exact failure class of the #462 incident (see #671/#682).')
    process.exitCode = 1
  } else {
    log(
      'SMOKE TEST PASSED — all protected routes redirect/render with no 500s, and',
    )
    log('every host got a session cookie Domain its browser would accept.')
  }
}

main()
  .catch((err) => {
    log(`SMOKE TEST ERRORED: ${err?.stack ?? err}`)
    process.exitCode = 1
  })
  .finally(() => {
    stopServer()
  })
