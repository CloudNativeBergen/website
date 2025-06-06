/**
 * @jest-environment node
 */
import {
  jest,
  expect,
  it,
  describe,
  beforeEach,
  beforeAll,
} from '@jest/globals'
import * as appHandler from './route'
import { clientWrite } from '@/lib/sanity/client'
import nock from 'nock'
import speakers from '../../../../../__tests__/testdata/speakers'
import { testApiHandler } from 'next-test-api-route-handler'

const speaker = speakers[0]!

beforeAll(async () => {
  try {
    clientWrite.createOrReplace({
      ...speaker,
      _type: 'speaker',
      _id: speaker._id!,
    })
  } catch (error) {
    expect(error).toBeNull()
  }
})

beforeEach(() => {
  nock.cleanAll()
})

describe('PUT /api/profile/emails', () => {
  it('should update the user email', async () => {
    nock('https://api.github.com')
      .get('/user/emails')
      .reply(200, [
        {
          email: 'foo@bar.com',
          primary: true,
          verified: true,
          visibility: 'public',
        },
        {
          email: 'baz@bix.com',
          primary: false,
          verified: false,
          visibility: 'public',
        },
        {
          email: 'bar@foo.com',
          primary: false,
          verified: true,
          visibility: 'private',
        },
      ])

    await testApiHandler({
      appHandler,
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'PUT',
          body: JSON.stringify({ email: 'new@email.com' }),
        })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.emails).toHaveLength(0)
      },
    })
  })
})

describe('GET /api/profile/emails', () => {
  it('should return data with status 200', async () => {
    nock('https://api.github.com')
      .get('/user/emails')
      .reply(200, [
        {
          email: 'foo@bar.com',
          primary: true,
          verified: true,
          visibility: 'public',
        },
        {
          email: 'baz@bix.com',
          primary: false,
          verified: false,
          visibility: 'public',
        },
        {
          email: 'bar@foo.com',
          primary: false,
          verified: true,
          visibility: 'private',
        },
      ])

    await testApiHandler({
      appHandler,
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker._id!)
      },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.emails).toHaveLength(2)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(body.emails.every((email: any) => email.verified)).toBe(true)
      },
    })
  })

  it('should return default email if no verified email exists', async () => {
    nock('https://api.github.com')
      .get('/user/emails')
      .reply(200, [
        {
          email: 'test@example.com',
          primary: false,
          verified: false,
          visibility: 'public',
        },
      ])

    await testApiHandler({
      appHandler,
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker._id!)
      },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.emails).toHaveLength(1)
        expect(body.emails[0].email).toBe('john@acme.com') // defined in __tests__/testdata/speakers.ts
      },
    })
  })

  it('should return default email if upstream request fails', async () => {
    nock('https://api.github.com').get('/user/emails').reply(500)

    // Suppress console.error output for this test since we expect an error to be logged
    jest.spyOn(console, 'error').mockImplementation(() => {})

    await testApiHandler({
      appHandler,
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker._id!)
      },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.emails).toHaveLength(1)
        expect(body.emails[0].email).toBe('john@acme.com') // defined in __tests__/testdata/speakers.ts
      },
    })
  })
})
