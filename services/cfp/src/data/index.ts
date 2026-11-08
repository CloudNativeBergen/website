// Public data layer. createData is the ONLY export resolvers see: it returns
// a Scoped repository, never the Sanity client.
//
// The store sits behind CfpSource (DATA_OWNERSHIP rule 3, step 1: proxy
// Sanity, the data does not move).
import { createClient } from '@sanity/client'
import { createGraphQLError } from 'graphql-yoga'
import { ScopedRepository, type Envelope } from '@runkonf/tenancy'
import { SanityCfpSource, type CfpSource, type DataEnv } from './source'
import {
  MyProposals,
  ProposalError,
  SPEAKERS_BY_KEYS,
  pickSpeaker,
  type CfpWindow,
  type ProposalFields,
  type SpeakerLink,
  type Writer,
} from './mine'

export * from './source'
export type { MyProposal, ProposalFields } from './mine'

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

/**
 * The session user's own proposals (#2078). The TENANT lane with a userId
 * only: a proposal belongs to one conference, and the user lane carries no
 * tenant, so it could only mean "every conference", which no Scoped
 * repository serves. The user comes from the envelope, never an argument.
 */
class Mine extends ScopedRepository {
  constructor(
    private readonly proposals: MyProposals,
    private readonly sanity: Writer,
    private readonly identity: DataEnv['IDENTITY'],
    envelope: Envelope,
  ) {
    super(envelope)
  }

  private who?: Promise<{ who: Who | null; link: SpeakerLink }>

  /** The tenant plus the user's Sanity speaker id; null when there is none. */
  private resolve() {
    return (this.who ??= (async () => {
      const { org_id, conference_id } = this.columns
      const userId = this.tenant.userId
      // Anonymous, or no conference: nobody's speaker, so an empty list and
      // NOT_FOUND, like any other caller with no proposals.
      if (!userId || !conference_id)
        return { who: null, link: { providers: [], emails: [], profile: null } }
      const link = await this.identity.link(userId)
      const rows =
        link.providers.length || link.emails.length
          ? await this.sanity.fetch<Record<string, unknown>[]>(
              SPEAKERS_BY_KEYS,
              {
                providers: link.providers,
                emails: link.emails,
              },
            )
          : []
      const speakerId = pickSpeaker(rows ?? [], link)
      return {
        who: speakerId
          ? { orgId: org_id, conferenceId: conference_id, speakerId }
          : null,
        link,
      }
    })())
  }

  private async run<T>(
    f: (w: Who, link: SpeakerLink) => Promise<T>,
    none: () => T,
  ) {
    const { who, link } = await this.resolve()
    if (!who) return none()
    try {
      return await f(who, link)
    } catch (e) {
      if (e instanceof ProposalError)
        throw createGraphQLError(e.message, { extensions: { code: e.code } })
      throw e
    }
  }
  private notFound = (): never => {
    throw createGraphQLError('Proposal not found', {
      extensions: { code: 'NOT_FOUND' },
    })
  }

  list() {
    return this.run(
      (w) => this.proposals.list(w),
      () => [],
    )
  }
  get(id: string) {
    return this.run((w) => this.proposals.get(w, id), this.notFound)
  }
  submit(input: ProposalFields) {
    return this.run(
      (w, link) => this.proposals.submit(w, input, link),
      () => {
        throw createGraphQLError(
          'No speaker profile is linked to this account; sign in on the conference site once',
          { extensions: { code: 'FORBIDDEN' } },
        )
      },
    )
  }
  update(id: string, input: ProposalFields) {
    return this.run((w) => this.proposals.update(w, id, input), this.notFound)
  }
  withdraw(id: string) {
    return this.run((w) => this.proposals.withdraw(w, id), this.notFound)
  }
}
type Who = { orgId: string; conferenceId: string; speakerId: string }

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
  let mine: Mine | undefined
  return {
    cfp: () => (cfps ??= new Cfps(source, envelope)),
    mine: () =>
      (mine ??= (() => {
        // A speaker's own reads must be fresh and their writes need the write
        // token: no CDN.
        const sanity = createClient({
          projectId: env.SANITY_PROJECT_ID,
          dataset: env.SANITY_DATASET,
          apiVersion: '2023-05-03',
          useCdn: false,
          token: env.SANITY_API_TOKEN_WRITE,
          requestTagPrefix: 'cfp.mine',
        })
        const t = envelope.typ === 'tenant' ? envelope : null
        let win: Promise<CfpWindow | null> | undefined
        const window = () =>
          (win ??= t?.conferenceId
            ? env.CONFERENCE.cfpWindow(t.orgId, t.conferenceId)
            : Promise.resolve(null))
        return new Mine(
          new MyProposals(sanity, window),
          sanity,
          env.IDENTITY,
          envelope,
        )
      })()),
  }
}
