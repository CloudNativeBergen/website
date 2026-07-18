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
import { pathToFileURL } from 'node:url'

// Tolerant of quote style and spacing so a prettier reformat of sw.js can't
// silently defeat the stamp. Shared shape asserted by __tests__/pwa/stamp-sw.
export const CACHE_VERSION_PATTERN =
  /const\s+CACHE_VERSION\s*=\s*['"][^'"]*['"]/

function stampServiceWorker() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || ''

  if (!sha) {
    console.log(
      '[stamp-sw] no commit SHA in env — leaving CACHE_VERSION unchanged',
    )
    return
  }

  const swPath = path.resolve(process.cwd(), 'public/sw.js')
  const src = readFileSync(swPath, 'utf8')

  // FAIL LOUDLY if the target moved: a silent miss would ship a service worker
  // whose bytes never change → back to "PWA never updates", undetected. Better
  // to break the build so the declaration/regex is fixed. (The unit test guards
  // this too, so it's normally caught before a deploy.)
  if (!CACHE_VERSION_PATTERN.test(src)) {
    console.error(
      '[stamp-sw] CACHE_VERSION declaration not found in public/sw.js — the ' +
        'stamp target changed. Refusing to ship a service worker that can never ' +
        'update. Fix the declaration or CACHE_VERSION_PATTERN.',
    )
    process.exit(1)
  }

  const version = `cndn-${sha.slice(0, 8)}`
  const next = src.replace(
    CACHE_VERSION_PATTERN,
    `const CACHE_VERSION = '${version}'`,
  )
  writeFileSync(swPath, next)
  console.log(`[stamp-sw] CACHE_VERSION → ${version}`)
}

// Only run when invoked directly (`node scripts/stamp-sw.mjs`), so importing the
// pattern from a test doesn't execute the stamp or call process.exit.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  stampServiceWorker()
}
