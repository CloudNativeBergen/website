// program: the public program (#1772), read-only. Talks, the official
// schedule and public speaker profiles of the envelope's conference. Nothing
// picks a tenant by argument: it comes from the envelope only. The schema
// knows only the plain types in ./data, never the store behind them.
import { builder } from './builder'
import type { Day, Slot, Speaker, SpeakerRef, Talk } from './data'

// The gateway's demand control assumes 20 items per list (gateway.ts), which
// prices a full program query at ~9.7k against a 1000 ceiling. With a real
// edition's sizes it is ~480, and still fits batched with other roots.
const size = (assumedSize: number) => ({ listSize: { assumedSize } })

const TalkSpeaker = builder.objectRef<SpeakerRef>('TalkSpeaker').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name', { nullable: true }),
  }),
})

const TalkType = builder.objectRef<Talk>('Talk').implement({
  description: 'A confirmed talk.',
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title', { nullable: true }),
    format: t.exposeString('format', { nullable: true }),
    level: t.exposeString('level', { nullable: true }),
    speakers: t.field({
      type: [TalkSpeaker],
      directives: size(2),
      resolve: (x) => x.speakers,
    }),
  }),
})

const SlotType = builder.objectRef<Slot>('ProgramSlot').implement({
  fields: (t) => ({
    start: t.exposeString('start', { nullable: true }),
    end: t.exposeString('end', { nullable: true }),
    talk: t.field({
      type: TalkType,
      nullable: true,
      description: 'Null for a break or a talk not yet confirmed.',
      resolve: (x) => x.talk,
    }),
  }),
})

const DayType = builder.objectRef<Day>('ProgramDay').implement({
  fields: (t) => ({
    date: t.exposeString('date'),
    slots: t.field({
      type: [SlotType],
      directives: size(40),
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

const SpeakerType = builder.objectRef<Speaker>('Speaker').implement({
  description: 'The public profile of a speaker with a confirmed talk.',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name', { nullable: true }),
    title: t.exposeString('title', { nullable: true }),
    bio: t.exposeString('bio', { nullable: true }),
    image: t.exposeString('image', { nullable: true, description: 'URL.' }),
    links: t.exposeStringList('links'),
  }),
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
  federationDirectives: ['@listSize'],
})
