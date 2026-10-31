import { describe, expect, it } from 'vitest'
import {
  countAttempt,
  createRateLimitPlugin,
  deriveCallerKey,
  measureQuery,
  RateLimitedError,
  type AstNode,
  type DocumentLike,
  type RateLimiter,
  signClientIp,
  SIGNED_IP_HEADER,
  verifyClientIp,
} from './index'

const SECRET = 'test-secret'
const NOW = 1_800_000_000_000

function fakeLimiter(allow: number) {
  const seen: string[] = []
  const limiter: RateLimiter = {
    async limit({ key }) {
      seen.push(key)
      return { success: seen.filter((k) => k === key).length <= allow }
    },
  }
  return { limiter, seen }
}

describe('signed client IP header', () => {
  it('accepts a fresh valid signature', async () => {
    const h = await signClientIp('203.0.113.7', SECRET, NOW)
    expect(await verifyClientIp(h, SECRET, NOW + 60_000)).toBe('203.0.113.7')
  })

  it('accepts IPv6', async () => {
    const h = await signClientIp('2001:db8::1', SECRET, NOW)
    expect(await verifyClientIp(h, SECRET, NOW)).toBe('2001:db8::1')
  })

  it('rejects an expired or future timestamp', async () => {
    const h = await signClientIp('203.0.113.7', SECRET, NOW)
    expect(await verifyClientIp(h, SECRET, NOW + 301_000)).toBeNull()
    expect(await verifyClientIp(h, SECRET, NOW - 301_000)).toBeNull()
  })

  it('rejects a tampered IP, timestamp or wrong secret', async () => {
    const h = await signClientIp('203.0.113.7', SECRET, NOW)
    const [, ts, sig] = h.split('.').slice(-3)
    expect(
      await verifyClientIp(`198.51.100.1.${ts}.${sig}`, SECRET, NOW),
    ).toBeNull()
    expect(
      await verifyClientIp(h.replace(`.${ts}.`, `.${+ts! + 1}.`), SECRET, NOW),
    ).toBeNull()
    expect(await verifyClientIp(h, 'other', NOW)).toBeNull()
    expect(await verifyClientIp('garbage', SECRET, NOW)).toBeNull()
    expect(await verifyClientIp(h, '', NOW)).toBeNull()
  })
})

describe('deriveCallerKey', () => {
  const opts = { ipSecret: SECRET, tenant: 'cnb' }

  it('keys token callers on the token hash, never the raw token', async () => {
    const key = await deriveCallerKey(
      new Request('https://api', {
        headers: { authorization: 'Bearer abc', 'cf-connecting-ip': '1.1.1.1' },
      }),
      opts,
    )
    expect(key).toBe(
      'token:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('keys anonymous callers on signed IP plus tenant', async () => {
    const signed = await signClientIp('203.0.113.7', SECRET, NOW)
    const req = new Request('https://api', {
      headers: { [SIGNED_IP_HEADER]: signed, 'cf-connecting-ip': '10.0.0.1' },
    })
    expect(await deriveCallerKey(req, opts, NOW)).toBe('anon:cnb:203.0.113.7')
  })

  it('falls back to cf-connecting-ip on an invalid header', async () => {
    const req = new Request('https://api', {
      headers: {
        [SIGNED_IP_HEADER]: '9.9.9.9.1.x',
        'cf-connecting-ip': '10.0.0.1',
      },
    })
    expect(await deriveCallerKey(req, opts, NOW)).toBe('anon:cnb:10.0.0.1')
  })
})

describe('createRateLimitPlugin', () => {
  it('maps limiter denial to RATE_LIMITED with HTTP 429', async () => {
    const { limiter, seen } = fakeLimiter(1)
    const plugin = createRateLimitPlugin({
      limiter,
      ipSecret: SECRET,
      tenant: () => 'cnb',
    })
    const request = new Request('https://api', {
      headers: { 'cf-connecting-ip': '10.0.0.1' },
    })
    const ext: Record<string, unknown> = {}
    await plugin.onContextBuilding({
      context: { request },
      extendContext: (e) => Object.assign(ext, e),
    })
    expect(ext.rateLimitKey).toBe('anon:cnb:10.0.0.1')

    const err = await plugin
      .onContextBuilding({ context: { request }, extendContext: () => {} })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RateLimitedError)
    expect((err as RateLimitedError).name).toBe('GraphQLError')
    expect((err as RateLimitedError).extensions).toEqual({
      code: 'RATE_LIMITED',
      http: { status: 429 },
    })
    expect(seen).toHaveLength(2)
  })

  const field = (name: string, ...children: AstNode[]): AstNode => ({
    kind: 'Field',
    name: { value: name },
    selectionSet: children.length ? { selections: children } : undefined,
  })
  const op = (...selections: AstNode[]): DocumentLike => ({
    definitions: [
      { kind: 'OperationDefinition', selectionSet: { selections } },
    ],
  })

  it('measures depth and cost through fragments', () => {
    const doc: DocumentLike = {
      definitions: [
        ...op(field('a', { kind: 'FragmentSpread', name: { value: 'F' } }))
          .definitions,
        {
          kind: 'FragmentDefinition',
          name: { value: 'F' },
          selectionSet: { selections: [field('b', field('c'))] },
        },
      ],
    }
    expect(measureQuery(doc)).toEqual({ depth: 3, cost: 3 })
  })

  it('rejects queries over depth or cost', () => {
    const plugin = createRateLimitPlugin({
      limiter: fakeLimiter(1).limiter,
      ipSecret: SECRET,
      tenant: () => 'cnb',
      maxDepth: 2,
      maxCost: 3,
    })
    const run = (doc: DocumentLike) => {
      let errors: Error[] | undefined
      plugin.onValidate({
        params: { documentAST: doc },
        setResult: (e) => (errors = e),
      })
      return errors?.[0]?.message
    }
    expect(run(op(field('a', field('b'))))).toBeUndefined()
    expect(run(op(field('a', field('b', field('c')))))).toMatch(/depth 3/)
    expect(run(op(field('a'), field('b'), field('c'), field('d')))).toMatch(
      /cost 4/,
    )
  })
})

describe('countAttempt', () => {
  it('counts each resolver call and denies past the limit', async () => {
    const { limiter, seen } = fakeLimiter(2)
    const ctx = { rateLimitKey: 'anon:cnb:1.1.1.1' }
    await countAttempt(ctx, limiter, 'redeem')
    await countAttempt(ctx, limiter, 'redeem')
    await expect(countAttempt(ctx, limiter, 'redeem')).rejects.toBeInstanceOf(
      RateLimitedError,
    )
    expect(seen[0]).toBe('redeem:anon:cnb:1.1.1.1')
  })

  it('fails closed without a key', async () => {
    await expect(
      countAttempt({}, fakeLimiter(5).limiter, 'redeem'),
    ).rejects.toBeInstanceOf(RateLimitedError)
  })
})
