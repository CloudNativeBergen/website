// Public data layer. createData is the ONLY export resolvers see: it returns
// a Scoped repository, never the Sanity client.
//
// The store sits behind SponsorSource (DATA_OWNERSHIP rule 3, step 1: proxy
// Sanity, the data does not move). A D1 source implements the same interface
// later; the schema only sees the plain types below.
import { createClient } from '@sanity/client'
import { ScopedRepository, type Envelope } from '@runkonf/tenancy'
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

export function createData(env: DataEnv, envelope: Envelope) {
  const source = new SanitySponsorSource(
    createClient({
      projectId: env.SANITY_PROJECT_ID,
      dataset: env.SANITY_DATASET,
      apiVersion: '2023-05-03',
      useCdn: true,
      // The dataset is private: no token reads nothing.
      token: env.SANITY_API_TOKEN_READ,
      requestTagPrefix: 'sponsors.read',
    }),
  )
  // Built on first use: the constructor refuses a PlatformContext, and that
  // should fail the resolver, not the whole request.
  let sponsors: Sponsors | undefined
  return {
    sponsors: () => (sponsors ??= new Sponsors(source, envelope)),
  }
}
