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
 * Usage: node scripts/smoke-protected-routes.mjs [--port 3123] [--start-cmd "…"]
 * Assumes a production build already exists in `.next` (run `next build` first).
 */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(
  process.env.SMOKE_PORT ??
    (process.argv.includes('--port')
      ? process.argv[process.argv.indexOf('--port') + 1]
      : 3123),
)
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

// Kill the server whatever happens.
for (const sig of ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException']) {
  process.on(sig, stopServer)
}

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

  if (failed) {
    log('SMOKE TEST FAILED — a protected route errored or returned 500.')
    log('This is the exact failure class of the #462 incident (see #671).')
    process.exitCode = 1
  } else {
    log('SMOKE TEST PASSED — all protected routes redirect/render, no 500s.')
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
