import { describe, expect, it } from 'vitest'
import { createApi } from '../yoga'
import type { RateLimiter } from './index'

const post = (query: string) =>
  new Request('http://api.test/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/graphql-response+json',
      'cf-connecting-ip': '10.0.0.1',
    },
    body: JSON.stringify({ query }),
  })

const api = (allow: boolean) => {
  const limiter: RateLimiter = { limit: async () => ({ success: allow }) }
  return createApi({
    rateLimit: { limiter, ipSecret: 's', tenant: () => null, maxDepth: 1 },
  })
}

type Body = { errors: { extensions: { code: string } }[] }

describe('rate limiting through Yoga (masked errors on)', () => {
  it('answers 429 with RATE_LIMITED', async () => {
    const res = await api(false).fetch(post('{ health }'))
    expect(res.status).toBe(429)
    expect(((await res.json()) as Body).errors[0].extensions.code).toBe(
      'RATE_LIMITED',
    )
  })

  it('keeps QUERY_TOO_COMPLEX unmasked', async () => {
    const res = await api(true).fetch(
      post('{ __schema { queryType { name } } }'),
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as Body).errors[0].extensions.code).toBe(
      'QUERY_TOO_COMPLEX',
    )
  })

  it('passes allowed queries', async () => {
    const res = await api(true).fetch(post('{ health }'))
    expect(await res.json()).toEqual({ data: { health: 'ok' } })
  })
})
