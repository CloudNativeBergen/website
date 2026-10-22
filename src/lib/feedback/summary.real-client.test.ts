/**
 * @vitest-environment node
 *
 * The claim path's requests end on time, on the REAL @sanity/client (a mock
 * is never evidence about what it mocks): a local server accepts every
 * request and answers only the ones a case needs, and each claim-path call
 * must give up within its cap, after exactly one request. Measured on 7.27:
 * the client's own `timeout` does not bound a no-store fetch, and doc reads
 * retry a socket timeout up to six times; only an abort signal holds.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { createClient } from '@sanity/client'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

// The grace between the two read-backs: immediate here.
vi.mock('@/lib/email/config', async (original) => ({
  ...(await original<typeof import('@/lib/email/config')>()),
  delay: async () => {},
}))

import { claimSummary } from './summary'
import {
  SWEEP_REQUEST_TIMEOUT_MS,
  readTalkVersions,
  sweepTalkVersions,
} from './talk-versions'

const CAP = 300
/** Room for the event loop and the local socket, nothing like a retry. */
const SLACK = 1_000

const TALK = {
  _id: 'talk-1',
  _type: 'talk',
  _rev: 'rev-1',
  status: 'confirmed',
  conference: { _ref: 'conf-A' },
}

const h = {
  requests: [] as string[],
  /** Answer queries (with an empty list) instead of hanging. */
  answerQueries: false,
  /** Except the release list, which hangs. */
  hangReleases: false,
  /** Answer this many doc-endpoint reads, then hang. */
  answerDocs: 0,
  /** The documents a doc read answers with. */
  docs: [] as Record<string, unknown>[],
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url ?? '', 'http://local').pathname
  const kind = path.includes('/data/query/')
    ? 'query'
    : path.includes('/data/doc/')
      ? 'doc'
      : path.includes('/data/mutate/')
        ? 'mutate'
        : path
  h.requests.push(kind)
  const answer = (body: unknown) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }
  const releases = decodeURIComponent(req.url ?? '').includes('releases::')
  if (kind === 'query' && h.answerQueries && !(releases && h.hangReleases)) {
    return answer({ result: [], ms: 1 })
  }
  if (kind === 'doc' && h.answerDocs > 0) {
    h.answerDocs--
    return answer({ documents: h.docs })
  }
  // Anything else: accepted, never answered.
})

let client: ReturnType<typeof createClient>

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  // As the claim's client is made: the pinned API version, a timeout.
  client = createClient({
    projectId: 'abc123',
    dataset: 'production',
    apiVersion: '2025-02-19',
    useCdn: false,
    token: 'test-token',
    apiHost: `http://127.0.0.1:${port}`,
    useProjectHostname: false,
    timeout: 5_000,
  })
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  h.requests = []
  h.answerQueries = false
  h.hangReleases = false
  h.answerDocs = 0
  h.docs = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const timed = async (work: () => Promise<unknown>) => {
  const start = Date.now()
  const outcome = await work().then(
    () => 'resolved',
    () => 'rejected',
  )
  return { outcome, ms: Date.now() - start }
}

const count = (kind: string) => h.requests.filter((r) => r === kind).length

describe('the claim path on the real client, against a server that never answers', () => {
  it('the version reads give up within their cap, one request each', async () => {
    const { outcome, ms } = await timed(() =>
      readTalkVersions(client, 'talk-1', { requestTimeoutMs: CAP }),
    )
    expect(outcome).toBe('rejected')
    expect(ms).toBeLessThan(CAP + SLACK)
    // The version lookup and the release list, in parallel.
    expect(h.requests).toEqual(['query', 'query'])
  })

  it('a release list that hangs gives up within its cap, and is read as not listed', async () => {
    h.answerQueries = true
    h.hangReleases = true
    h.answerDocs = 1
    h.docs = [TALK]

    const { outcome, ms } = await timed(async () => {
      const read = await readTalkVersions(client, 'talk-1', {
        requestTimeoutMs: CAP,
      })
      expect(read.releasesListed).toBe(false)
    })

    expect(outcome).toBe('resolved')
    expect(ms).toBeLessThan(CAP + SLACK)
    expect(count('query')).toBe(2)
  }, 15_000)

  it('the by-id read of the versions gives up within its cap, one request', async () => {
    h.answerQueries = true

    const { outcome, ms } = await timed(() =>
      readTalkVersions(client, 'talk-1', { requestTimeoutMs: CAP }),
    )

    expect(outcome).toBe('rejected')
    expect(ms).toBeLessThan(CAP + SLACK)
    expect(count('doc')).toBe(1)
  })

  it('a commit and both read-backs give up within their caps, one request each', async () => {
    h.answerQueries = true
    h.answerDocs = 1 // the claim's own read of the talk
    h.docs = [TALK]

    const { outcome, ms } = await timed(() =>
      claimSummary(
        client,
        TALK as never,
        'conf-A',
        new Date('2026-06-12T08:00:00.000Z'),
        () => true,
        CAP,
      ),
    )

    expect(outcome).toBe('rejected')
    expect(ms).toBeLessThan(3 * CAP + SLACK)
    expect(count('mutate')).toBe(1)
    // The claim's read of the talk, then the two read-backs.
    expect(count('doc')).toBe(3)
  }, 15_000)

  it('the sweep gives up within its cap and does not throw, when its reads hang', async () => {
    const { outcome, ms } = await timed(() =>
      sweepTalkVersions(client, 'talk-1', 'feedbackSummarySentAt', {
        requestTimeoutMs: CAP,
      }),
    )
    expect(outcome).toBe('resolved')
    expect(ms).toBeLessThan(CAP + SLACK)
    expect(h.requests).toEqual(['query', 'query'])
  })

  it('a sweep given no cap still bounds every request, by its default', async () => {
    h.answerQueries = true
    h.answerDocs = 1
    h.docs = [
      { ...TALK, feedbackSummarySentAt: '2026-06-12T08:00:00.000Z' },
      { ...TALK, _id: 'drafts.talk-1', _rev: 'rev-d' },
    ]
    const timeout = AbortSignal.timeout.bind(AbortSignal)
    const asked: number[] = []
    const spy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      asked.push(ms)
      return timeout(CAP)
    })
    try {
      const { outcome, ms } = await timed(() =>
        sweepTalkVersions(client, 'talk-1', 'feedbackSummarySentAt'),
      )
      expect(outcome).toBe('resolved')
      expect(ms).toBeLessThan(CAP + SLACK)
      expect(count('mutate')).toBe(1)
      expect(asked.length).toBeGreaterThan(0)
      expect(new Set(asked)).toEqual(new Set([SWEEP_REQUEST_TIMEOUT_MS]))
    } finally {
      spy.mockRestore()
    }
  }, 15_000)

  it('the sweep’s commit gives up within its cap, one request', async () => {
    h.answerQueries = true
    h.answerDocs = 1
    // The published talk carries the marker; its draft does not.
    h.docs = [
      { ...TALK, feedbackSummarySentAt: '2026-06-12T08:00:00.000Z' },
      { ...TALK, _id: 'drafts.talk-1', _rev: 'rev-d' },
    ]

    const { outcome, ms } = await timed(() =>
      sweepTalkVersions(client, 'talk-1', 'feedbackSummarySentAt', {
        requestTimeoutMs: CAP,
      }),
    )

    expect(outcome).toBe('resolved')
    expect(ms).toBeLessThan(CAP + SLACK)
    expect(count('mutate')).toBe(1)
  }, 15_000)
})
