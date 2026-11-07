// Public data layer. createData is the ONLY export resolvers see: it returns
// a Scoped repository, never the Sanity client.
//
// The store sits behind CfpSource (DATA_OWNERSHIP rule 3, step 1: proxy
// Sanity, the data does not move).
import { createClient } from '@sanity/client'
import { ScopedRepository, type Envelope } from '@runkonf/tenancy'
import { SanityCfpSource, type CfpSource, type DataEnv } from './source'

export * from './source'

/** The envelope's tenant, never one the caller names. */
class Cfps extends ScopedRepository {
  constructor(
    private readonly source: CfpSource,
    envelope: Envelope,
  ) {
    super(envelope)
  }

  async cfp() {
    const { org_id, conference_id } = this.columns
    return conference_id
      ? this.source.cfp({ orgId: org_id, conferenceId: conference_id })
      : null
  }
}

export function createData(env: DataEnv, envelope: Envelope) {
  const source = new SanityCfpSource(
    createClient({
      projectId: env.SANITY_PROJECT_ID,
      dataset: env.SANITY_DATASET,
      apiVersion: '2023-05-03',
      useCdn: true,
      // The dataset is private: no token reads nothing.
      token: env.SANITY_API_TOKEN_READ,
      requestTagPrefix: 'cfp.read',
    }),
  )
  // Built on first use: the constructor refuses a PlatformContext, and that
  // should fail the resolver, not the whole request.
  let cfps: Cfps | undefined
  return {
    cfp: () => (cfps ??= new Cfps(source, envelope)),
  }
}
