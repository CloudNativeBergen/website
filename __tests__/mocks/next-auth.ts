import { jest } from '@jest/globals'

import { NextAuthRequest } from '@/lib/auth'
import { NextRequest } from 'next/server'
import { Account } from 'next-auth'
import speakers from '../testdata/speakers'
import { Speaker } from '@/lib/speaker/types'

export class AuthError extends Error {
  type: string
  constructor(type: string) {
    super(type)
    this.type = type
  }
}

const NextAuth = () => ({
  auth: jest.fn((handler: (req: NextAuthRequest, ctx: any) => any) => {
    return (req: NextAuthRequest, ctx: any) => {
      if (!req) req = {} as NextAuthRequest

      let user: Speaker | undefined

      if (req.headers && req.headers.get('x-test-auth-user')) {
        user = speakers.find(
          (speaker) => speaker._id === req.headers.get('x-test-auth-user'),
        )
      }

      if (user) {
        const account: Account = {
          provider: 'github',
          providerAccountId: '123',
          access_token: 'abc',
          type: 'oidc',
        }

        req.auth = {
          expires: (Date.now() + 1000).toString(),
          user: {
            email: user.email!,
            name: user.name,
            picture: 'https://example.com/foo.jpg',
          },
          speaker: {
            _id: user._id!,
            isOrganizer: user.isOrganizer === true,
          },
          account,
        }
      }

      return handler(req, ctx)
    }
  }),
  signIn: jest.fn(),
  signOut: jest.fn(),
  handlers: {
    GET: jest.fn(),
    POST: jest.fn(),
  },
  AuthError: AuthError,
})

export default NextAuth
