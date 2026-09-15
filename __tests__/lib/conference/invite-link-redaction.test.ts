/**
 * Neither `sponsorRegistrationLink` nor `speakerRegistrationLink` may ride the
 * tenant read by default.
 *
 * The tenant query projects `...`, so every field on the conference document
 * reaches the RSC payload of whatever page performed the read — readable by
 * anyone viewing source on a public page. That is tolerable for the document's
 * other private fields; it is not for this one, which carries Checkin's `pass`:
 * a STABLE, reusable token that reveals the hidden sponsor ticket types and
 * lets whoever holds it buy them.
 *
 * `speakerRegistrationLink` is the same shape of secret and worse in one way:
 * it is ONE SHARED URL for every speaker rather than a per-person invitation,
 * so a single leak hands anyone a free ticket with nothing to revoke per
 * holder.
 *
 * So both fields are opt-in, and this pins them. A regression here does not
 * break any page or any type — it silently publishes a working purchase link,
 * which is exactly the kind of failure no other assertion in the suite would
 * catch.
 */

const HOST = 'example.com'

const SPONSOR_LINK =
  'https://event.checkin.no/999999?action=invite&category=111111&pass=FAKE-TEST-TOKEN'

const SPEAKER_LINK =
  'https://event.checkin.no/999999?action=invite&category=222222&pass=FAKE-SPEAKER-TOKEN'

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
  registrationLink: 'https://event.checkin.no/999999',
  sponsorRegistrationLink: SPONSOR_LINK,
  speakerRegistrationLink: SPEAKER_LINK,
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
    expect(conference.registrationLink).toBe('https://event.checkin.no/999999')
  })

  it('is present when an admin surface asks for it', async () => {
    const { getConferenceForCurrentDomain } =
      await import('@/lib/conference/sanity')

    const { conference } = await getConferenceForCurrentDomain({
      includeSponsorRegistrationLink: true,
    })

    expect(conference.sponsorRegistrationLink).toBe(SPONSOR_LINK)
    // The flags are independent: asking for one must not drag the other along.
    expect(conference.speakerRegistrationLink).toBeUndefined()
  })
})

describe('speakerRegistrationLink redaction', () => {
  it('is absent from a default read', async () => {
    const { getConferenceForCurrentDomain } =
      await import('@/lib/conference/sanity')

    const { conference } = await getConferenceForCurrentDomain()

    expect(conference.speakerRegistrationLink).toBeUndefined()
    expect(conference.registrationLink).toBe('https://event.checkin.no/999999')
  })

  it('is present when a server surface asks for it', async () => {
    const { getConferenceForCurrentDomain } =
      await import('@/lib/conference/sanity')

    const { conference } = await getConferenceForCurrentDomain({
      includeSpeakerRegistrationLink: true,
    })

    expect(conference.speakerRegistrationLink).toBe(SPEAKER_LINK)
    expect(conference.sponsorRegistrationLink).toBeUndefined()
  })
})
