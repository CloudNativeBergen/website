// program: the public program (#1772), read-only. Talks, the official
// schedule and public speaker profiles of the envelope's conference. Nothing
// picks a tenant by argument: it comes from the envelope only. The schema
// knows only the plain types in ./data, never the store behind them.
import { builder } from './builder'
import type {
  Attachment,
  Day,
  GalleryImage,
  ScheduleInfo,
  Slot,
  Speaker,
  SpeakerRef,
  Talk,
  Topic,
  Track,
} from './data'

// The gateway's demand control assumes 20 items per list (gateway.ts), which
// prices a full program query far above the 1000 ceiling. With a real
// edition's sizes (3 days, 30 slots, 2 speakers and topics a talk) it is
// ~900: query it alone, not batched with the speaker roots.
const size = (assumedSize: number) => ({ listSize: { assumedSize } })

const str = { nullable: true } as const

const TalkSpeaker = builder.objectRef<SpeakerRef>('TalkSpeaker').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name', str),
    slug: t.exposeString('slug', str),
    title: t.exposeString('title', str),
    image: t.exposeString('image', { ...str, description: 'URL.' }),
  }),
})

const TopicType = builder.objectRef<Topic>('Topic').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title', str),
    slug: t.exposeString('slug', str),
    color: t.exposeString('color', str),
    description: t.exposeString('description', str),
  }),
})

const AttachmentType = builder.objectRef<Attachment>('Attachment').implement({
  fields: (t) => ({
    key: t.exposeString('key', { ...str, description: 'The Sanity `_key`.' }),
    kind: t.exposeString('kind', { description: 'file or url.' }),
    attachmentType: t.exposeString('attachmentType', str),
    title: t.exposeString('title', str),
    description: t.exposeString('description', str),
    filename: t.exposeString('filename', str),
    url: t.exposeString('url', str),
  }),
})

const ScheduleInfoType = builder
  .objectRef<ScheduleInfo>('ScheduleInfo')
  .implement({
    fields: (t) => ({
      date: t.exposeString('date', str),
      trackTitle: t.exposeString('trackTitle', str),
      startTime: t.exposeString('startTime', str),
      endTime: t.exposeString('endTime', str),
    }),
  })

const TalkType = builder.objectRef<Talk>('Talk').implement({
  description:
    'A talk. Every root returns confirmed talks only; a program slot also carries an unconfirmed one, with title, description, language and speakers null.',
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title', str),
    description: t.exposeString('description', {
      ...str,
      description: 'Portable Text as JSON (Sanity shape).',
    }),
    format: t.exposeString('format', str),
    level: t.exposeString('level', str),
    language: t.exposeString('language', str),
    audiences: t.exposeStringList('audiences', {
      nullable: true,
      directives: size(3),
    }),
    topics: t.field({
      type: [TopicType],
      nullable: true,
      directives: size(2),
      resolve: (x) => x.topics,
    }),
    attachments: t.field({
      type: [AttachmentType],
      nullable: true,
      directives: size(2),
      resolve: (x) => x.attachments,
    }),
    speakers: t.field({
      type: [TalkSpeaker],
      nullable: true,
      directives: size(2),
      resolve: (x) => x.speakers,
    }),
    scheduleInfo: t.field({
      type: ScheduleInfoType,
      nullable: true,
      description: 'Null until the program is published (programDate).',
      resolve: (x) => x.scheduleInfo,
    }),
    hasFeedbackCode: t.exposeBoolean('hasFeedbackCode', {
      nullable: true,
      description:
        'Whether the talk takes feedback, never the code. Program slots only; null elsewhere.',
    }),
  }),
})

const TalkStatusType = builder.enumType('TalkStatus', {
  description: 'Public status class of a scheduled talk.',
  values: ['CONFIRMED', 'WITHDRAWN', 'PENDING'] as const,
})

const TrackType = builder.objectRef<Track>('ProgramTrack').implement({
  fields: (t) => ({
    name: t.exposeString('name', str),
    description: t.exposeString('description', str),
    sponsorId: t.exposeString('sponsorId', str),
  }),
})

const SlotType = builder.objectRef<Slot>('ProgramSlot').implement({
  fields: (t) => ({
    start: t.exposeString('start', str),
    end: t.exposeString('end', str),
    placeholder: t.exposeString('placeholder', str),
    room: t.exposeString('room', { ...str, description: 'The track title.' }),
    track: t.field({ type: TrackType, resolve: (x) => x.track }),
    talk: t.field({
      type: TalkType,
      nullable: true,
      description:
        'Null for a break. An unconfirmed talk has title, description, language and speakers null (TBA).',
      resolve: (x) => x.talk,
    }),
    hasTalkRef: t.exposeBoolean('hasTalkRef', {
      description: 'The slot references a talk, resolved or not.',
    }),
    talkStatus: t.field({
      type: TalkStatusType,
      nullable: true,
      resolve: (x) => x.talkStatus,
    }),
    trackIndex: t.exposeInt('trackIndex', {
      description: 'Index of the track within the day.',
    }),
    position: t.exposeInt('position', {
      description: 'Index of the slot within its track.',
    }),
  }),
})

const DayType = builder.objectRef<Day>('ProgramDay').implement({
  fields: (t) => ({
    id: t.exposeID('id', { nullable: true }),
    date: t.exposeString('date'),
    slots: t.field({
      type: [SlotType],
      directives: size(30),
      resolve: (x) => x.slots,
    }),
  }),
})

const ProgramType = builder.objectRef<{ days: Day[] }>('Program').implement({
  fields: (t) => ({
    days: t.field({
      type: [DayType],
      directives: size(3),
      description: 'Empty until the program is published.',
      resolve: (x) => x.days,
    }),
  }),
})

const GallerySpeaker = builder
  .objectRef<GalleryImage['speakers'][number]>('GallerySpeaker')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      name: t.exposeString('name', str),
      slug: t.exposeString('slug', str),
    }),
  })

const GalleryImageType = builder
  .objectRef<GalleryImage>('GalleryImage')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      url: t.exposeString('url', str),
      alt: t.exposeString('alt', str),
      photographer: t.exposeString('photographer', str),
      date: t.exposeString('date', str),
      location: t.exposeString('location', str),
      featured: t.exposeBoolean('featured'),
      image: t.exposeString('image', {
        ...str,
        description:
          'The Sanity image object (asset, hotspot, crop, alt) as JSON.',
      }),
      speakers: t.field({
        type: [GallerySpeaker],
        directives: size(2),
        resolve: (x) => x.speakers,
      }),
    }),
  })

const SpeakerType = builder.objectRef<Speaker>('Speaker').implement({
  description: 'The public profile of a speaker with a confirmed talk.',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name', str),
    slug: t.exposeString('slug', str),
    title: t.exposeString('title', str),
    bio: t.exposeString('bio', str),
    image: t.exposeString('image', { ...str, description: 'URL.' }),
    updatedAt: t.exposeString('updatedAt', str),
    links: t.exposeStringList('links', { directives: size(4) }),
    flags: t.exposeStringList('flags', {
      directives: size(1),
      description: 'Public flags only: local.',
    }),
    galleryImages: t.field({
      type: [GalleryImageType],
      directives: size(4),
      resolve: (x) => x.galleryImages,
    }),
    talks: t.field({
      type: [TalkType],
      directives: size(2),
      description: 'Confirmed talks in this conference.',
      resolve: (x) => x.talks,
    }),
  }),
})

// Operator conference stats (#2142): this subgraph's count on the entity
// tenant-directory's operator `conferences` list returns. Guard before fetch:
// only a PlatformContext resolves the reference.
const OperatorConferenceStats = builder
  .objectRef<{ conferenceId: string }>('OperatorConferenceStats')
  .implement({
    fields: (t) => ({
      conferenceId: t.exposeID('conferenceId'),
      confirmedSpeakers: t.int({
        tag: 'operator',
        description:
          'Distinct speakers with a confirmed talk, published or not.',
        resolve: async ({ conferenceId }, _, ctx) =>
          (await ctx.data.confirmedSpeakerCount(conferenceId)) ?? 0,
      }),
    }),
  })
builder.asEntity(OperatorConferenceStats, {
  key: builder.selection<{ conferenceId: string }>('conferenceId'),
  resolveReference: (ref, ctx) =>
    ctx.envelope?.typ === 'platform' ? ref : null,
})

builder.queryType({
  fields: (t) => ({
    program: t.field({
      type: ProgramType,
      resolve: async (_, __, ctx) => ({
        days: await ctx.data.program().program(),
      }),
    }),
    talk: t.field({
      type: TalkType,
      nullable: true,
      args: { id: t.arg.id({ required: true }) },
      resolve: (_, { id }, ctx) => ctx.data.program().talk(String(id)),
    }),
    speakers: t.field({
      type: [SpeakerType],
      resolve: (_, __, ctx) => ctx.data.program().speakers(),
    }),
    speakerBySlug: t.field({
      type: SpeakerType,
      nullable: true,
      args: { slug: t.arg.string({ required: true }) },
      resolve: (_, { slug }, ctx) => ctx.data.program().speakerBySlug(slug),
    }),
    speaker: t.field({
      type: SpeakerType,
      nullable: true,
      args: { id: t.arg.id({ required: true }) },
      resolve: (_, { id }, ctx) => ctx.data.program().speaker(String(id)),
    }),
  }),
})

// v2.9 is the first federation version with @listSize.
export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.9',
  federationDirectives: ['@listSize', '@key', '@tag'],
})
