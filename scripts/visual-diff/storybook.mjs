/**
 * Storybook lifecycle helpers for the visual-diff harness.
 *
 * Same mechanics as `scripts/shoot-story.mjs` (detect a running instance, else
 * spawn `<pm> run storybook --ci --quiet -p <port>` detached and kill the whole
 * process group afterwards), generalised so the harness can point at an
 * arbitrary checkout directory and its own port.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

/** Resolve the package manager that invoked us, defaulting to this repo's pnpm. */
function packageManager() {
  const ua = process.env.npm_config_user_agent || ''
  const pm = ua.startsWith('npm')
    ? 'npm'
    : ua.startsWith('yarn')
      ? 'yarn'
      : 'pnpm'
  return { pm, bin: process.platform === 'win32' ? `${pm}.cmd` : pm }
}

export function baseUrl(port) {
  return `http://127.0.0.1:${port}`
}

export async function isUp(port) {
  try {
    const r = await fetch(`${baseUrl(port)}/index.json`)
    return r.ok
  } catch {
    return false
  }
}

/**
 * Start Storybook for `cwd` on `port`, or attach to one already listening.
 *
 * Attaching is a hazard for this harness specifically: a Storybook left running
 * by another checkout serves THAT checkout's stories, so a whole capture run
 * can silently describe the wrong branch. Callers therefore pass a dedicated
 * port (default 6207, not shoot-story's 6006) and we refuse to attach unless
 * `allowReuse` is set.
 *
 * @param {{cwd: string, port: number, allowReuse?: boolean, timeoutMs?: number,
 *   log?: (msg: string) => void}} options
 * @returns {Promise<{stop: () => void, reused: boolean}>}
 */
export async function startStorybook({
  cwd,
  port,
  allowReuse = false,
  timeoutMs = 300_000,
  log = () => {},
}) {
  if (await isUp(port)) {
    if (!allowReuse)
      throw new Error(
        `Something is already serving Storybook on :${port}. It may belong to a ` +
          `different checkout — captures would silently describe the wrong tree. ` +
          `Pass --port to pick a free one, or --reuse-server if you are sure it ` +
          `is serving ${cwd}.`,
      )
    log(`attached to the Storybook already on :${port}`)
    return { stop: () => {}, reused: true }
  }

  const { pm, bin } = packageManager()
  log(`starting Storybook for ${cwd} on :${port} (via ${pm}) …`)
  // npm needs `--` to forward flags; pnpm/yarn pass a literal `--` through to
  // the Storybook CLI, which Storybook 10 rejects. (Mirrors shoot-story.mjs.)
  const args = ['run', 'storybook']
  if (pm === 'npm') args.push('--')
  args.push('--ci', '--quiet', '-p', String(port))
  const child = spawn(bin, args, { cwd, stdio: 'ignore', detached: true })

  const deadline = Date.now() + timeoutMs
  let exited = false
  child.on('exit', () => {
    exited = true
  })
  while (Date.now() < deadline) {
    if (await isUp(port)) {
      log(`Storybook is up on :${port}`)
      return { stop: () => stopChild(child), reused: false }
    }
    if (exited) break
    await sleep(1500)
  }
  stopChild(child)
  throw new Error(`Storybook did not come up on :${port} within ${timeoutMs}ms`)
}

function stopChild(child) {
  if (!child?.pid) return
  try {
    // Detached spawn puts the child in its own process group; the negative pid
    // takes the Vite/Node children with it instead of orphaning them.
    process.kill(process.platform === 'win32' ? child.pid : -child.pid)
  } catch {
    try {
      child.kill()
    } catch {
      /* already gone */
    }
  }
}

/**
 * Fetch the story index. This is how the harness enumerates stories — never a
 * hand-maintained list, so new stories are covered the day they land.
 *
 * @param {number} port
 * @returns {Promise<object[]>} raw index entries
 */
export async function fetchStoryIndex(port) {
  const res = await fetch(`${baseUrl(port)}/index.json`)
  if (!res.ok) throw new Error(`GET /index.json failed: ${res.status}`)
  const json = await res.json()
  return Object.values(json.entries ?? {})
}
