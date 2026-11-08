// cfp: the public face of the conference's call for papers (#2077). The
// tenant comes from the envelope only. CFP dates and the conference's enabled
// formats are on Conference (conference subgraph); talk details are in
// program. No proposal state other than confirmed, no review and no speaker
// contact field exists in this schema.
import { builder } from './builder'
import {
  OPTIONS,
  type MyProposal,
  type ProposalFields,
  type CfpTalk,
  type CfpTopic,
  type Option,
  type SpeakerRef,
} from './data'

const size = (assumedSize: number) => ({ listSize: { assumedSize } })
const str = { nullable: true } as const

const OptionType = builder.objectRef<Option>('CfpOption').implement({
  fields: (t) => ({
    value: t.exposeString('value'),
    label: t.exposeString('label'),
  }),
})

const TopicType = builder.objectRef<CfpTopic>('CfpTopic').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title', str),
    description: t.exposeString('description', str),
    color: t.exposeString('color', str),
  }),
})

const SpeakerRefType = builder
  .objectRef<SpeakerRef>('CfpSpeakerRef')
  .implement({
    description:
      'Who presents a talk: id and display name only. The speaker model may change (#2022).',
    fields: (t) => ({
      id: t.exposeID('id'),
      name: t.exposeString('name', str),
    }),
  })

const TalkType = builder.objectRef<CfpTalk>('CfpTalk').implement({
  description:
    'A confirmed talk. The id is the one program `talk(id:)` takes for details.',
  fields: (t) => ({
    id: t.exposeID('id'),
    title: t.exposeString('title', str),
    format: t.exposeString('format', str),
    level: t.exposeString('level', str),
    language: t.exposeString('language', str),
    audiences: t.exposeStringList('audiences'),
    topicIds: t.exposeIDList('topicIds'),
    speakers: t.field({
      type: [SpeakerRefType],
      directives: size(3),
      resolve: (x) => x.speakers,
    }),
  }),
})

const CfpType = builder
  .objectRef<{ topics: CfpTopic[]; talks: CfpTalk[] }>('CallForPapers')
  .implement({
    description:
      'Dates, email and enabled formats are on Conference. Public data only.',
    fields: (t) => ({
      topics: t.field({
        type: [TopicType],
        directives: size(20),
        resolve: (x) => x.topics,
      }),
      talks: t.field({
        type: [TalkType],
        directives: size(60),
        description: 'Confirmed talks, by title.',
        resolve: (x) => x.talks,
      }),
      formats: t.field({
        type: [OptionType],
        directives: size(8),
        description:
          'Every format with its label; Conference.formats says which are enabled.',
        resolve: () => OPTIONS.formats,
      }),
      levels: t.field({
        type: [OptionType],
        directives: size(3),
        resolve: () => OPTIONS.levels,
      }),
      languages: t.field({
        type: [OptionType],
        directives: size(2),
        resolve: () => OPTIONS.languages,
      }),
      audiences: t.field({
        type: [OptionType],
        directives: size(8),
        resolve: () => OPTIONS.audiences,
      }),
    }),
  })

const MyProposalType = builder.objectRef<MyProposal>('MyProposal').implement({
  description:
    "One of the session user's own proposals (they are a speaker on it, #2078): their text and its status. Never reviews, scores or organizer notes.",
  fields: (t) => ({
    id: t.exposeID('id'),
    status: t.exposeString('status', {
      description:
        'draft, submitted, accepted, waitlisted, confirmed, rejected, withdrawn or canceled.',
    }),
    title: t.exposeString('title', str),
    abstract: t.exposeString('abstract', {
      ...str,
      description: 'Plain text; paragraphs separated by a blank line.',
    }),
    format: t.exposeString('format', str),
    level: t.exposeString('level', str),
    language: t.exposeString('language', str),
    audiences: t.exposeStringList('audiences'),
    topicIds: t.exposeIDList('topicIds'),
    outline: t.exposeString('outline', str),
    prerequisites: t.exposeString('prerequisites', str),
    capacity: t.exposeInt('capacity', str),
    speakers: t.field({
      type: [SpeakerRefType],
      directives: size(3),
      resolve: (x) => x.speakers,
    }),
  }),
})

type InputT = Parameters<
  Extract<
    Parameters<typeof builder.inputType>[1]['fields'],
    (...a: never[]) => unknown
  >
>[0]
const fields = (required: boolean) => (t: InputT) => ({
  title: t.string({ required }),
  abstract: t.string({
    required,
    description: 'Plain text; paragraphs separated by a blank line.',
  }),
  format: t.string({ required }),
  level: t.string({ required }),
  language: t.string({ required }),
  audiences: t.stringList({ required }),
  topicIds: t.idList({ required }),
  outline: t.string(),
  prerequisites: t.string(),
  capacity: t.int(),
})
const SubmitInput = builder.inputType('SubmitProposalInput', {
  fields: (t) => ({
    ...fields(true)(t),
    tos: t.boolean({ required: true, description: 'Must be true.' }),
  }),
})
const UpdateInput = builder.inputType('UpdateMyProposalInput', {
  description:
    'Only the fields to change. After acceptance only title and abstract, until the program is published.',
  fields: (t) => fields(false)(t),
})

builder.mutationType({
  fields: (t) => ({
    submitProposal: t.field({
      type: MyProposalType,
      description:
        "Submit a proposal to the request's conference while its CFP is open. Snapshots the speaker profile into it.",
      args: { input: t.arg({ type: SubmitInput, required: true }) },
      resolve: (_, { input }, ctx) =>
        ctx.data.mine().submit(input as ProposalFields),
    }),
    updateMyProposal: t.field({
      type: MyProposalType,
      args: {
        id: t.arg.id({ required: true }),
        input: t.arg({ type: UpdateInput, required: true }),
      },
      resolve: (_, { id, input }, ctx) =>
        ctx.data.mine().update(String(id), input as ProposalFields),
    }),
    withdrawMyProposal: t.field({
      type: MyProposalType,
      description:
        'Withdraw a submitted, waitlisted, accepted or confirmed proposal, up to 14 days before the event.',
      args: { id: t.arg.id({ required: true }) },
      resolve: (_, { id }, ctx) => ctx.data.mine().withdraw(String(id)),
    }),
  }),
})

builder.queryType({
  fields: (t) => ({
    myProposals: t.field({
      type: [MyProposalType],
      directives: size(10),
      description:
        "The session user's proposals in the request's conference, including those they are a co-speaker on.",
      resolve: (_, __, ctx) => ctx.data.mine().list(),
    }),
    myProposal: t.field({
      type: MyProposalType,
      description:
        'One of your proposals. NOT_FOUND for anything else, existing or not.',
      args: { id: t.arg.id({ required: true }) },
      resolve: (_, { id }, ctx) => ctx.data.mine().get(String(id)),
    }),
    cfp: t.field({
      type: CfpType,
      nullable: true,
      description:
        "The request's conference CFP. Null when the request has no conference.",
      resolve: (_, __, ctx) => ctx.data.cfp().cfp(),
    }),
  }),
})

// v2.9 is the first federation version with @listSize.
export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.9',
  federationDirectives: ['@listSize'],
})
