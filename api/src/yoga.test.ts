import { createSchema } from 'graphql-yoga'
import { describe, expect, it } from 'vitest'
import { createApi } from './yoga'

const post = (body: unknown) =>
  new Request('http://api.test/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('api', () => {
  it('answers the health query', async () => {
    const res = await createApi().fetch(post({ query: '{ health }' }))
    expect(await res.json()).toEqual({ data: { health: 'ok' } })
  })

  it('masks thrown errors', async () => {
    const schema = createSchema({
      typeDefs: 'type Query { boom: String }',
      resolvers: {
        Query: {
          boom: () => {
            throw new Error('secret detail')
          },
        },
      },
    })
    const res = await createApi({ schema }).fetch(post({ query: '{ boom }' }))
    const text = await res.text()
    expect(text).not.toContain('secret detail')
    expect(JSON.parse(text).errors[0].message).toBe('Unexpected error.')
  })

  it('rejects batched requests', async () => {
    const res = await createApi().fetch(
      post([{ query: '{ health }' }, { query: '{ health }' }]),
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('allows introspection', async () => {
    const res = await createApi().fetch(
      post({ query: '{ __schema { queryType { name } } }' }),
    )
    const body = (await res.json()) as {
      data: { __schema: { queryType: { name: string } } }
    }
    expect(body.data.__schema.queryType.name).toBe('Query')
  })
})
