/**
 * Where one host stands for workshop sign-in, for the organizer's surfaces
 * (the domain card, system status). It answers what the sign-in itself would:
 * the proof rule of the destination check (`isProven`), then what this
 * deployment's configuration says about the host (`configurationRefuses`).
 *
 * - `available`: the host signs attendees in.
 * - `unverified`: its ownership is not proven. Named first, since it is the
 *   one the organizer can act on.
 * - `blocked`: proven, but the deployment's configuration refuses it:
 *   `WORKSHOP_AUTH_ORIGIN` cannot be used (every host), or names this host.
 *
 * No read: the caller supplies the record.
 */

import {
  configurationRefuses,
  type ConfigurationRefusal,
} from '@/lib/workshop/central-sign-in/decision'
import { isProven } from './destination'
import type { DomainVerificationRecord } from './types'

export type WorkshopSignInStanding =
  | { state: 'available' }
  | { state: 'unverified' }
  | { state: 'blocked'; by: ConfigurationRefusal }

export function workshopSignInStanding(
  record: DomainVerificationRecord | null,
  now: Date,
): WorkshopSignInStanding {
  if (!record || !isProven(record, now)) return { state: 'unverified' }
  const by = configurationRefuses(record.hostname)
  return by ? { state: 'blocked', by } : { state: 'available' }
}
