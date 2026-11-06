// Public data layer. createData is the ONLY export resolvers see: it returns
// a Scoped repository, never the Sanity client.
//
// The store sits behind ProgramSource (DATA_OWNERSHIP rule 3, step 1: proxy
// Sanity, the data does not move). A D1 source implements the same interface
// later; the schema only sees the plain types below.
import { createClient } from '@sanity/client'
import { ScopedRepository, type Envelope } from '@runkonf/tenancy'
import {
  osloToday,
  SanityProgramSource,
  type DataEnv,
  type Day,
  type ProgramSource,
  type Speaker,
  type Talk,
  type Tenant,
} from './source'

export * from './source'

/** Talk without its schedule (withoutUnpublishedSchedule). */
const unscheduled = (t: Talk): Talk => ({ ...t, scheduleInfo: null })

/** The envelope's tenant, never one the caller names. */
class Program extends ScopedRepository {
  private open?: Promise<boolean>

  constructor(
    private readonly source: ProgramSource,
    private readonly programDate: DataEnv['CONFERENCE']['programDate'],
    envelope: Envelope,
  ) {
    super(envelope)
  }

  private get t(): Tenant | null {
    const { org_id, conference_id } = this.columns
    return conference_id ? { orgId: org_id, conferenceId: conference_id } : null
  }

  /**
   * On or after programDate (src/lib/conference/state.ts
   * isProgramPublished), read from D1 whatever the source, once per request.
   * Fails closed: no date, or a failed read, is not published.
   */
  private published(t: Tenant): Promise<boolean> {
    return (this.open ??= this.programDate(t.orgId, t.conferenceId).then(
      (date) => !!date && osloToday(new Date()) >= date,
      (e: unknown) => {
        console.error('program: programDate read failed', e)
        return false
      },
    ))
  }

  /** Strip every talk's scheduleInfo before programDate. */
  private async gate<T>(t: Tenant, v: T, strip: (v: T) => T): Promise<T> {
    return (await this.published(t)) ? v : strip(v)
  }
  private gateSpeaker = (sp: Speaker): Speaker => ({
    ...sp,
    talks: sp.talks.map(unscheduled),
  })

  async program(): Promise<Day[]> {
    const t = this.t
    if (!t || !(await this.published(t))) return []
    return this.source.program(t)
  }
  async talk(id: string) {
    const t = this.t
    if (!t) return null
    const talk = await this.source.talk(t, id)
    return talk && this.gate(t, talk, unscheduled)
  }
  async speakers() {
    const t = this.t
    if (!t) return []
    return this.gate(t, await this.source.speakers(t), (l) =>
      l.map(this.gateSpeaker),
    )
  }
  async speaker(id: string) {
    const t = this.t
    if (!t) return null
    const sp = await this.source.speaker(t, id)
    return sp && this.gate(t, sp, this.gateSpeaker)
  }
  async speakerBySlug(slug: string) {
    const t = this.t
    if (!t) return null
    const sp = await this.source.speakerBySlug(t, slug)
    return sp && this.gate(t, sp, this.gateSpeaker)
  }
}

export function createData(env: DataEnv, envelope: Envelope) {
  const source = new SanityProgramSource(
    createClient({
      projectId: env.SANITY_PROJECT_ID,
      dataset: env.SANITY_DATASET,
      apiVersion: '2023-05-03',
      useCdn: true,
      // The dataset is private: no token reads nothing.
      token: env.SANITY_API_TOKEN_READ,
      requestTagPrefix: 'program.read',
    }),
  )
  // async: a missing binding rejects, so published() fails closed.
  const programDate: DataEnv['CONFERENCE']['programDate'] = async (o, c) =>
    env.CONFERENCE.programDate(o, c)
  // Built on first use: the constructor refuses a PlatformContext, and that
  // should fail the resolver, not the whole request. One per request, so
  // programDate is read once.
  let program: Program | undefined
  return {
    program: () => (program ??= new Program(source, programDate, envelope)),
  }
}
