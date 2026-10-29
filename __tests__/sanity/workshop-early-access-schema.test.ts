/**
 * THE STUDIO HALF of workshop early access (#1346).
 *
 * Two flags on two fields, each of which Studio alone enforces:
 *
 *  - `sponsorForConference.workshopEarlyAccessToken` is READ-ONLY. The token
 *    is created and revoked on the sponsor's record in the admin, which also
 *    expires the cached links and keeps drafts and release copies in step. A
 *    token typed into Studio would do neither.
 *  - `workshopSignup.earlyAccessSponsor` is a WEAK reference. A strong one
 *    would keep a sponsor with early sign-ups from being removed from the
 *    conference, in Studio as in the admin.
 */
import { describe, expect, it } from 'vitest'
import sponsorForConference from '../../sanity/schemaTypes/sponsorForConference'
import workshopSignup from '../../sanity/schemaTypes/workshopSignup'

type Field = {
  name?: string
  type?: string
  readOnly?: unknown
  weak?: unknown
  to?: { type: string }[]
}
const fieldOf = (schemaType: { fields?: unknown }, name: string) =>
  (schemaType.fields as Field[]).find((field) => field.name === name)

describe('the fields of workshop early access, as Studio has them', () => {
  it('the token on a sponsor of a conference is a read-only string', () => {
    const token = fieldOf(sponsorForConference, 'workshopEarlyAccessToken')

    expect({ type: token?.type, readOnly: token?.readOnly }).toEqual({
      type: 'string',
      readOnly: true,
    })
  })

  it('the sponsor recorded on a sign-up is a weak, read-only reference to a sponsor of a conference', () => {
    const recorded = fieldOf(workshopSignup, 'earlyAccessSponsor')

    expect({
      type: recorded?.type,
      to: recorded?.to,
      weak: recorded?.weak,
      readOnly: recorded?.readOnly,
    }).toEqual({
      type: 'reference',
      to: [{ type: 'sponsorForConference' }],
      weak: true,
      readOnly: true,
    })
  })
})
