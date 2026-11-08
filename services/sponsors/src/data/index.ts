// Public data layer. createData is the ONLY export resolvers see: it returns
// a Scoped repository, never the Sanity client.
//
// The store sits behind SponsorSource (DATA_OWNERSHIP rule 3, step 1: proxy
// Sanity, the data does not move). A D1 source implements the same interface
// later; the schema only sees the plain types below.
import { createClient } from '@sanity/client'
import {
  ScopedRepository,
  platformBatch,
  type Envelope,
} from '@runkonf/tenancy'
import {
  SanitySponsorSource,
  type DataEnv,
  type SponsorSource,
  type Tenant,
} from './source'

export * from './source'

/** The envelope's tenant, never one the caller names. */
class Sponsors extends ScopedRepository {
  constructor(
    private readonly source: SponsorSource,
    envelope: Envelope,
  ) {
    super(envelope)
  }

  private get t(): Tenant | null {
    const { org_id, conference_id } = this.columns
    return conference_id ? { orgId: org_id, conferenceId: conference_id } : null
  }

  async sponsors() {
    const t = this.t
    return t ? this.source.sponsors(t) : []
  }
  async tiers() {
    const t = this.t
    return t ? this.source.tiers(t) : []
  }
}

// groq-global-scoped: operator lane only (platformBatch refuses anything but a
// PlatformContext); bounded to the page's conference ids, a count only.
export const SPONSOR_COUNTS = `*[_type == "conference" && _id in $ids]{ _id, "n": count(*[_type == "sponsorForConference" && conference._ref == ^._id && status == "closed-won"]) }`

export function createData(env: DataEnv, envelope: Envelope) {
  const client = createClient({
    projectId: env.SANITY_PROJECT_ID,
    dataset: env.SANITY_DATASET,
    apiVersion: '2023-05-03',
    useCdn: true,
    // The dataset is private: no token reads nothing.
    token: env.SANITY_API_TOKEN_READ,
    requestTagPrefix: 'sponsors.read',
  })
  const source = new SanitySponsorSource(client)
  // Built on first use: the constructor refuses a PlatformContext, and that
  // should fail the resolver, not the whole request.
  let sponsors: Sponsors | undefined
  // Closed-won sponsorships, tiered or not (#2142).
  const sponsorCount = platformBatch<number>(
    envelope,
    'operator conference stats: sponsors (#2142)',
    async (ids) => {
      const rows = await client.fetch<{ _id: string; n: number }[]>(
        SPONSOR_COUNTS,
        { ids },
      )
      return new Map((rows ?? []).map((r) => [r._id, r.n]))
    },
  )
  return {
    sponsorCount,
    sponsors: () => (sponsors ??= new Sponsors(source, envelope)),
  }
}
