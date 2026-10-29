import 'server-only'
import { WorkOS } from '@workos-inc/node'

let client: WorkOS | undefined

/**
 * The WorkOS client of the central workshop sign-in: the plain server SDK,
 * with no session handling of its own. One instance per process.
 */
export function workshopWorkOS(): WorkOS {
  client ??= new WorkOS(process.env.WORKOS_API_KEY, {
    clientId: process.env.WORKOS_CLIENT_ID,
  })
  return client
}
