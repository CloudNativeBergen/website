/**
 * @vitest-environment node
 *
 * Offline test of `pnpm erase-speaker --commit` through the REAL package
 * script (#1201). Under `--conditions=react-server` the CLI talks to Sanity
 * through the browser build of `@sanity/client` and `get-it`'s fetch adapter;
 * the mocked suites never reach that code. Here the script runs unmocked and a
 * preload rewrites `<project>.api.sanity.io` to a fake HTTP server in this
 * process, which records every request.
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')
const PROJECT = 'fakeproj'
const SPEAKER = 'abcd1234efgh5678ijkl90'
const ASSET = 'image-abc-500x500-png'
const WRITE_TOKEN = 'write-token-for-test'

interface Seen {
  method: string
  path: string
  query: string | null
  perspective: string | null
  tag: string | null
  auth: string | undefined
  body: unknown
}

const seen: Seen[] = []
let speaker: Record<string, unknown> = {}

function answer(query: string): unknown {
  if (query.includes('releases::all()')) return []
  if (query.includes('_id == $speakerId')) return speaker
  // Nothing else references the speaker or the asset: counts are 0 (the
  // asset is orphaned), lists are empty.
  const q = query.trim()
  if (q.startsWith('{')) return { n: 0 }
  return q.startsWith('count(') ? 0 : []
}

/** The speaker after the transaction: `set` applied, `unset` removed. */
function applyMutations(body: { mutations?: Array<Record<string, any>> }) {
  for (const m of body.mutations ?? []) {
    const patch = m.patch
    if (patch?.id !== SPEAKER) continue
    speaker = { ...speaker, ...patch.setIfMissing, ...patch.set }
    for (const key of patch.unset ?? []) delete speaker[key]
    speaker._rev = 'rev-after'
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://fake')
  const body = await readBody(req)
  const query =
    url.searchParams.get('query') ??
    ((body as { query?: string } | null)?.query || null)
  seen.push({
    method: req.method ?? '',
    path: url.pathname,
    query,
    perspective: url.searchParams.get('perspective'),
    tag: url.searchParams.get('tag'),
    auth: req.headers.authorization,
    body,
  })
  res.setHeader('content-type', 'application/json')
  if (url.pathname.includes('/data/mutate/')) {
    applyMutations(body as { mutations?: [] })
    res.end(JSON.stringify({ transactionId: 'tx-1', results: [] }))
    return
  }
  if (url.pathname.includes('/data/doc/')) {
    res.end(JSON.stringify({ documents: [] }))
    return
  }
  if (query !== null) {
    res.end(JSON.stringify({ result: answer(query), ms: 1 }))
    return
  }
  res.statusCode = 404
  res.end(JSON.stringify({ error: `unhandled ${req.method} ${url.pathname}` }))
})

let preload: string

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  // Route every Sanity API call to the fake server, and refuse anything else
  // so the run cannot reach the network.
  preload = path.join(mkdtempSync(path.join(tmpdir(), 'erase-')), 'pre.mjs')
  writeFileSync(
    preload,
    `const real = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (!url.hostname.endsWith('.api.sanity.io')) throw new Error('offline test: ' + url)
  const target = 'http://127.0.0.1:${port}' + url.pathname + url.search
  return real(input instanceof Request ? new Request(target, input) : target, init)
}
`,
  )
})

afterAll(() => {
  server.close()
})

function run(): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      'pnpm',
      ['--silent', 'erase-speaker', SPEAKER, '--actor', 'test', '--commit'],
      {
        cwd: ROOT,
        timeout: 60_000,
        env: {
          ...process.env,
          NODE_OPTIONS: `--import ${preload}`,
          NEXT_PUBLIC_SANITY_PROJECT_ID: PROJECT,
          NEXT_PUBLIC_SANITY_DATASET: 'test',
          SANITY_API_TOKEN_READ: 'read-token-for-test',
          SANITY_API_TOKEN_WRITE: WRITE_TOKEN,
        },
      },
      (error, stdout, stderr) =>
        resolve({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr }),
    )
  })
}

describe('erase-speaker --commit', () => {
  it('erases through the real client: patch, raw count, asset delete, verify', async () => {
    speaker = {
      _id: SPEAKER,
      _type: 'speaker',
      _rev: 'rev-speaker',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      knownEmails: ['ada@example.com'],
      slug: { _type: 'slug', current: 'ada-lovelace' },
      bio: 'Writes programs.',
      image: { asset: { _type: 'reference', _ref: ASSET } },
    }
    const result = await run()
    expect(result.stderr).not.toContain('FAILED')
    expect(result.stdout).toContain(`deleted ${ASSET}`)
    expect(result.stdout).toContain('Verification: CLEAN')
    expect(result.code).toBe(0)

    const mutates = seen.filter((s) => s.path.includes('/data/mutate/'))
    const patchAt = seen.findIndex((s) =>
      JSON.stringify(s.body).includes(`"ifRevisionID":"rev-speaker"`),
    )
    const countAt = seen.findIndex(
      (s) =>
        s.query?.includes('count(*[references($assetId)])') &&
        s.perspective === 'raw',
    )
    const assetDeleteAt = seen.findIndex((s) =>
      JSON.stringify(s.body).includes(`{"delete":{"id":"${ASSET}"}}`),
    )

    // The plan queries come first, then the guarded patch, then the raw
    // count, then the asset delete, then the verification reads.
    expect(patchAt).toBeGreaterThan(0)
    expect(countAt).toBeGreaterThan(patchAt)
    expect(assetDeleteAt).toBeGreaterThan(countAt)
    expect(seen.slice(assetDeleteAt + 1).some((s) => s.query)).toBe(true)

    // Writes carry the write token and the write tag prefix.
    for (const m of mutates) {
      expect(m.auth).toBe(`Bearer ${WRITE_TOKEN}`)
      expect(m.tag).toMatch(/^web\.write/)
    }
    for (const s of seen) {
      expect(s.auth).toMatch(/^Bearer (read|write)-token-for-test$/)
      expect(s.tag).toMatch(/^web\.(read\.live|write)/)
    }
  }, 90_000)
})
