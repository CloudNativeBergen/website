/**
 * Stamp the service worker's CACHE_VERSION with the deploy's commit SHA.
 *
 * `public/sw.js` is a static file. The browser only installs a NEW worker when
 * the bytes of `/sw.js` change — so with a hardcoded `CACHE_VERSION` the file is
 * byte-identical across deploys, no new worker ever installs, and the
 * "update available" banner never fires. Users get stuck on a stale bundle.
 *
 * Run before `next build`. On Vercel/CI a commit SHA is in the env; stamping it
 * into CACHE_VERSION makes `/sw.js` change every deploy, which is what drives the
 * update lifecycle (new worker → banner → reload). Locally (no SHA) it's a no-op
 * so the committed file stays `cndn-dev` and the working tree stays clean.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || ''

if (!sha) {
  console.log(
    '[stamp-sw] no commit SHA in env — leaving CACHE_VERSION unchanged',
  )
  process.exit(0)
}

try {
  const swPath = path.resolve(process.cwd(), 'public/sw.js')
  const src = readFileSync(swPath, 'utf8')
  const version = `cndn-${sha.slice(0, 8)}`
  const next = src.replace(
    /const CACHE_VERSION = '[^']*'/,
    `const CACHE_VERSION = '${version}'`,
  )
  if (next === src) {
    console.warn('[stamp-sw] CACHE_VERSION line not found — nothing stamped')
  } else {
    writeFileSync(swPath, next)
    console.log(`[stamp-sw] CACHE_VERSION → ${version}`)
  }
} catch (err) {
  // Never fail the build over the stamp; a stale-but-working SW beats no deploy.
  console.warn('[stamp-sw] non-fatal:', err && err.message)
}
process.exit(0)
