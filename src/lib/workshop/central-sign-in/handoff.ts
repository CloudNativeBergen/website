import type { z } from 'zod'
import { sessionSchema } from './session'
import { startStateSchema } from './start-seals'

export { HANDOFF_TTL_SECONDS } from './start-seals'

/**
 * Sealed as `handoff` by the auth host: what the session needs, for one host
 * and the conference that claimed it when the sign-in started, with the hash
 * of the value in that host's browser cookie.
 */
export const handOffSchema = sessionSchema.extend({
  challenge: startStateSchema.shape.challenge,
})

export type HandOff = z.infer<typeof handOffSchema>
