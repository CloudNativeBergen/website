/**
 * `sponsorRegistrationLink` must not ride the tenant read by default.
 *
 * The tenant query projects `...`, so every field on the conference document
 * reaches the RSC payload of whatever page performed the read — readable by
 * anyone viewing source on a public page. That is tolerable for the document's
 * other private fields; it is not for this one, which carries Checkin's `pass`:
 * a STABLE, reusable token that reveals the hidden sponsor ticket types and
 * lets whoever holds it buy them.
 *
 * So the field is opt-in, and this pins it. A regression here does not break
 * any page or any type — it silently publishes a working purchase link, which
 * is exactly the kind of failure no other assertion in the suite would catch.
 */

const HOST = 'example.com'

const SPONSOR_LINK =
  'https://event.checkin.no/999999?action=invite&category=111111&pass=FAKE-TEST-TOKEN'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: HOST }),
}))

vi.mock('next/cache', () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
}))

vi.mock('@/lib/domain-verification/routing', () => ({
  isHostRoutable: async () => true,
}))

const CONFERENCE = {
  _id: 'conference-1',
  title: 'Example Conf',
  domains: [HOST],
  registrationLink: 'https://event.checkin.no/218308',
  sponsorRegistrationLink: SPONSOR_LINK,
}

// A FRESH object per fetch: the redaction deletes the key off the result, so a
// shared literal would let the first test mutate what the second one reads.
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: async () => ({ ...CONFERENCE }) },
  clientReadCached: { fetch: async () => ({ ...CONFERENCE }) },
  clientReadUncached: { fetch: async () => ({ ...CONFERENCE }) },
}))

describe('sponsorRegistrationLink redaction', () => {
  it('is absent from a default read', async () => {
    const { getConferenceForCurrentDomain } =
      await import('@/lib/conference/sanity')

    const { conference } = await getConferenceForCurrentDomain()

    expect(conference.sponsorRegistrationLink).toBeUndefined()
    // The PUBLIC link is not secret and must survive — a redaction that took
    // the whole registration fieldset with it would pass the assertion above.
    expect(conference.registrationLink).toBe('https://event.checkin.no/218308')
  })

  it('is present when an admin surface asks for it', async () => {
    const { getConferenceForCurrentDomain } =
      await import('@/lib/conference/sanity')

    const { conference } = await getConferenceForCurrentDomain({
      includeSponsorRegistrationLink: true,
    })

    expect(conference.sponsorRegistrationLink).toBe(SPONSOR_LINK)
  })
})
