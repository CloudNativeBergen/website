import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { appRouter } from '@/server/_app'
import speakers from '../testdata/speakers'

const t = initTRPC.context<Context>().create()
const createCaller = t.createCallerFactory(appRouter)

function mockReq(): Context['req'] {
  return {
    headers: new Headers(),
    url: 'http://localhost:3000',
  } as unknown as Context['req']
}

export function createAnonymousCaller() {
  return createCaller({
    req: mockReq(),
    session: null,
    speaker: undefined,
    user: undefined,
    workosUser: null,
    ipAddress: '',
  })
}

/**
 * A caller authenticated as a WorkOS AuthKit workshop attendee (NOT a NextAuth
 * speaker). Mirrors what `createTRPCContext` derives from the sealed
 * `wos-session` cookie, so workshop-router authz can be exercised directly.
 */
export function createWorkshopCaller(
  workosUser?: Partial<import('@/server/trpc').WorkshopUserIdentity>,
) {
  return createCaller({
    req: mockReq(),
    session: null,
    speaker: undefined,
    user: undefined,
    workosUser: {
      id: workosUser?.id ?? 'workos-user-1',
      email: workosUser?.email ?? 'attendee@example.com',
      firstName: workosUser?.firstName ?? 'Test',
      lastName: workosUser?.lastName ?? 'Attendee',
    },
    ipAddress: '127.0.0.1',
  })
}

export function createAuthenticatedCaller(speakerId?: string) {
  const speaker = speakers.find((s) => s._id === speakerId) ?? speakers[0]
  return createCaller({
    req: mockReq(),
    session: {
      expires: new Date(Date.now() + 86400000).toISOString(),
      user: {
        email: speaker.email!,
        name: speaker.name!,
        picture: 'https://example.com/avatar.jpg',
      },
      speaker: {
        _id: speaker._id!,
        isOrganizer: speaker.isOrganizer === true,
      },
    },
    speaker: {
      _id: speaker._id!,
      isOrganizer: speaker.isOrganizer === true,
    },
    user: {
      email: speaker.email!,
      name: speaker.name!,
      picture: 'https://example.com/avatar.jpg',
    },
    workosUser: null,
    ipAddress: '127.0.0.1',
  })
}

export function createAdminCaller() {
  const admin = speakers.find((s) => s.isOrganizer === true)!
  return createAuthenticatedCaller(admin._id)
}

export { speakers }
