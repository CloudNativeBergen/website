/**
 * @jest-environment node
 */
import { expect, it } from '@jest/globals'
import * as appHandler from './route'
import { describe } from 'node:test'
import { testApiHandler } from 'next-test-api-route-handler'
import speakers from '../../../__tests__/testdata/speakers'

const speaker = speakers[0]!

describe('GET /api', () => {
  it('should return 200 for authenticated user', async () => {
    await testApiHandler({
      appHandler,
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker._id!)
      },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ message: 'Hello, world!' })
      },
    })
  })
})
