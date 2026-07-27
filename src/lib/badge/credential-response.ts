import { isJWTFormat } from '@/lib/openbadges'
import type { BadgeRecord } from './types'

/**
 * Serialize a badge's stored credential for HTTP delivery. New badges store the
 * embedded-proof JSON-LD credential (pretty-printed here); legacy badges store a
 * Compact JWS string. Shared by the /json route and the credential-`id` route so
 * both emit byte-identical payloads.
 *
 * Throws (SyntaxError) when a non-JWT `badgeJson` is not valid JSON — callers
 * translate that into a 500.
 */
export function badgeCredentialBody(badge: Pick<BadgeRecord, 'badgeJson'>): {
  body: string
  isJwt: boolean
} {
  if (isJWTFormat(badge.badgeJson)) {
    return { body: badge.badgeJson, isJwt: true }
  }
  const assertion = JSON.parse(badge.badgeJson)
  return { body: JSON.stringify(assertion, null, 2), isJwt: false }
}
