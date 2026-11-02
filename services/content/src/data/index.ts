// Public data layer. createData is the ONLY export resolvers see: it returns
// Scoped repositories, never the Sanity client.
//
// @sanity/client directly, not the site's src/lib/sanity client: that one is
// next-sanity and reads process.env, neither of which belongs in a Worker.
// The filters are scoped.ts's (ORG_FILTER), with the tenant from the envelope.
import { createClient, type SanityClient } from '@sanity/client'
import { ScopedRepository, type Envelope } from '@runkonf/tenancy'

/** Bindings the data layer needs; the generated WorkerEnv extends it. */
export interface DataEnv {
  SANITY_PROJECT_ID: string
  SANITY_DATASET: string
  /** wrangler secret put SANITY_API_TOKEN_READ (per environment) */
  SANITY_API_TOKEN_READ: string
}

// The projection scripts/backfill-conference.ts reads (#1829).
const CONFERENCE = `*[_type == "conference" && _id == $conferenceId && organization._ref == $orgId][0]{
  _id, title, tagline, description, city, country, venueName, venueAddress,
  startDate, endDate, lifecycleStatus, visibility, logoBright, logoDark,
  logomarkBright, logomarkDark, backgroundPattern, theme, registrationLink,
  socialLinks, homepageSections, announcement, cfpStartDate, cfpEndDate,
  cfpNotifyDate, programDate, earlyBirdEndDate, registrationCloseDate,
  speakersAnnouncedDate, recordingsLiveDate, sponsorRegistrationLink,
  speakerRegistrationLink, volunteerRegistrationLink, registrationEnabled,
  ticketCustomization, ticketInclusions, ticketFaqs, vanityMetrics,
  socialHashtag, venueTravelInfo, localRecommendations, formats, organizer,
  organizerAddress, speakerInfo, sponsorshipCustomization, lifecycleHeadline,
  lifecycleMessage
}`

type Doc = Record<string, unknown> & {
  _id: string
  lifecycleStatus?: string | null
  theme?: { primaryColor?: string | null; accentColor?: string | null } | null
  socialLinks?: string[] | null
  homepageSections?: Block[] | null
}

/** A homepage block as Sanity stores it; `_type` picks the GraphQL type. */
export type Block = Record<string, unknown> & {
  _type: string
  hidden?: boolean
}

const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])

const s = (v: unknown) => (typeof v === 'string' && v.trim()) || null

/**
 * Same mapping as services/conference/scripts/backfill.ts (#1829), plus the
 * #1831 fields. `member`: the caller is in the conference's org.
 */
function toConference(c: Doc, member: boolean) {
  const blocks = list<Block>(c.homepageSections).filter(
    (b) => member || !b.hidden,
  )
  return {
    conferenceId: c._id,
    // Blank stays null: the id is not a title.
    title: s(c.title),
    tagline: s(c.tagline),
    description: s(c.description),
    city: s(c.city),
    country: s(c.country),
    venueName: s(c.venueName),
    venueAddress: s(c.venueAddress),
    startDate: s(c.startDate),
    endDate: s(c.endDate),
    // Absent means live (src/lib/conference/contract.ts).
    visibility: c.visibility === 'unlisted' ? 'unlisted' : 'live',
    logoBright: s(c.logoBright),
    logoDark: s(c.logoDark),
    logomarkBright: s(c.logomarkBright),
    logomarkDark: s(c.logomarkDark),
    backgroundPattern: s(c.backgroundPattern),
    primaryColor: s(c.theme?.primaryColor),
    accentColor: s(c.theme?.accentColor),
    registrationLink: s(c.registrationLink),
    socialLinks: c.socialLinks ?? [],
    // Hidden blocks are drafts: org members only (#1830), in both fields.
    homepageSections: JSON.stringify(blocks),
    homepageBlocks: blocks,
    // Portable Text, as Sanity stores it; the site renders it with PortableText.
    announcement: c.announcement ? JSON.stringify(c.announcement) : null,
    speakerInfo: c.speakerInfo ? JSON.stringify(c.speakerInfo) : null,
    sponsorshipCustomization: c.sponsorshipCustomization
      ? JSON.stringify(c.sponsorshipCustomization)
      : null,
    lifecycleHeadline: s(c.lifecycleHeadline),
    lifecycleMessage: s(c.lifecycleMessage),
    cfpStartDate: s(c.cfpStartDate),
    cfpEndDate: s(c.cfpEndDate),
    cfpNotifyDate: s(c.cfpNotifyDate),
    programDate: s(c.programDate),
    earlyBirdEndDate: s(c.earlyBirdEndDate),
    registrationCloseDate: s(c.registrationCloseDate),
    speakersAnnouncedDate: s(c.speakersAnnouncedDate),
    recordingsLiveDate: s(c.recordingsLiveDate),
    // Invite links that hand out free tickets: never public (types.ts).
    sponsorRegistrationLink: member ? s(c.sponsorRegistrationLink) : null,
    speakerRegistrationLink: member ? s(c.speakerRegistrationLink) : null,
    volunteerRegistrationLink: s(c.volunteerRegistrationLink),
    registrationEnabled: c.registrationEnabled === true,
    ticketCustomization: (c.ticketCustomization ?? null) as Record<
      string,
      unknown
    > | null,
    ticketInclusions: list<Record<string, unknown>>(c.ticketInclusions),
    ticketFaqs: list<Record<string, unknown>>(c.ticketFaqs),
    vanityMetrics: list<Record<string, unknown>>(c.vanityMetrics),
    socialHashtag: s(c.socialHashtag),
    venueTravelInfo: s(c.venueTravelInfo),
    localRecommendations: s(c.localRecommendations),
    formats: list<string>(c.formats),
    organizer: s(c.organizer),
    organizerAddress: s(c.organizerAddress),
  }
}

export type Conference = ReturnType<typeof toConference>

class Conferences extends ScopedRepository {
  constructor(
    private readonly sanity: Pick<SanityClient, 'fetch'>,
    envelope: Envelope,
  ) {
    super(envelope)
  }

  /**
   * The envelope's Conference, never one the caller names. An unpublished
   * one is for members of the org only (epic #1772, req. 2).
   */
  async current(): Promise<Conference | null> {
    const { org_id, conference_id } = this.columns
    if (!conference_id) return null
    const doc = await this.sanity.fetch<Doc | null>(CONFERENCE, {
      orgId: org_id,
      conferenceId: conference_id,
    })
    if (!doc) return null
    // Cancelled and archived editions are not public; unlisted ones are.
    const published = !['cancelled', 'archived'].includes(
      doc.lifecycleStatus ?? '',
    )
    if (!published && !this.tenant.orgRole) return null
    return toConference(doc, !!this.tenant.orgRole)
  }

  /** Entity resolution: an id other than the envelope's resolves to null. */
  async byId(id: string): Promise<Conference | null> {
    return id === this.columns.conference_id ? this.current() : null
  }
}

export function createData(env: DataEnv, envelope: Envelope) {
  const sanity = createClient({
    projectId: env.SANITY_PROJECT_ID,
    dataset: env.SANITY_DATASET,
    apiVersion: '2023-05-03',
    useCdn: true,
    // The dataset is private: no token reads nothing (src/lib/sanity/client.ts).
    token: env.SANITY_API_TOKEN_READ,
    requestTagPrefix: 'content.read',
  })
  // Built on first use: the constructor refuses a PlatformContext, and that
  // should fail the resolver, not the whole request.
  return { conferences: () => new Conferences(sanity, envelope) }
}
