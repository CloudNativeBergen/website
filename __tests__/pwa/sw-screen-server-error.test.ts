/**
 * @vitest-environment node
 *
 * A venue screen's reload can reach a server that answers 502/503/504 for a
 * moment (a deploy, a cold function). On Photo Wall Screen Mode
 * (`/wall/screen`, Photo Wall spec §9.2) nobody would press reload on that
 * error page, so the worker serves the precached `/offline` page instead,
 * which retries by itself there (`src/app/offline/offline-retry.ts`). Every
 * other page gets the server's answer as before.
 *
 * Runs the REAL `public/sw.js` in a sandbox and calls its navigation handler.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { SCREEN_PATH } from '@/lib/photo-wall/screen'

const source = readFileSync(join(__dirname, '../../public/sw.js'), 'utf8')
const OFFLINE = '<h1>Offline</h1>'

function loadWorker(answer: Response) {
  const sandbox = {
    self: { addEventListener: () => {}, registration: {}, clients: {} },
    caches: {
      open: async () => ({
        match: async () =>
          new Response(OFFLINE, { headers: { 'Content-Type': 'text/html' } }),
      }),
    },
    fetch: async () => answer.clone(),
    Response,
    Headers,
    URL,
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(
    `${source}\n;globalThis.handleNavigate = handleNavigate`,
    sandbox,
  )
  return sandbox as typeof sandbox & {
    handleNavigate: (request: Request) => Promise<Response>
  }
}

const navigate = async (url: string, status: number) => {
  const worker = loadWorker(new Response(`status ${status}`, { status }))
  const response = await worker.handleNavigate(new Request(url))
  return { status: response.status, body: await response.text() }
}

describe('service worker: a server error on Screen Mode', () => {
  it('serves the self-retrying offline page for a 5xx on /wall/screen', async () => {
    for (const status of [500, 502, 503, 504]) {
      for (const path of ['/wall/screen', '/wall/screen/', '/WALL/SCREEN']) {
        expect(
          await navigate(`https://2026.example.no${path}`, status),
        ).toEqual({ status: 200, body: OFFLINE })
      }
    }
  })

  it('passes the screen its page when the server answers, and a 404 as it is', async () => {
    expect(await navigate('https://2026.example.no/wall/screen', 200)).toEqual({
      status: 200,
      body: 'status 200',
    })
    expect(await navigate('https://2026.example.no/wall/screen', 404)).toEqual({
      status: 404,
      body: 'status 404',
    })
  })

  it('leaves a server error on any other page alone', async () => {
    for (const path of ['/program', '/wall', '/wall/screens', '/f/k7m2qx']) {
      expect(await navigate(`https://2026.example.no${path}`, 503)).toEqual({
        status: 503,
        body: 'status 503',
      })
    }
  })

  it('matches Screen Mode exactly as the app does', () => {
    expect(source).toContain(
      `const SCREEN_MODE_PATTERN = /${SCREEN_PATH.source}/${SCREEN_PATH.flags}`,
    )
  })
})
