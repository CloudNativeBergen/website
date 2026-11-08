// cfp: the public face of the conference's call for papers (#2077). The
// tenant comes from the envelope only. CFP dates and the conference's enabled
// formats are on Conference (conference subgraph); talk details are in
// program. The public reads carry no proposal state other than confirmed and
// no speaker contact; only MyProposal, behind the speaker-of-this-talk check,
// carries the talk's speakers' emails (as the site's portal does). No review
// field exists in this schema.
import { GraphQLScalarType, valueFromASTUntyped } from 'graphql'
import { builder } from './builder'
import type { ResolverContext } from './worker'
import {
  OPTIONS,
  type MyProposal,
  type MySpeaker,
  type Attachment,
  type Invitation,
  type ScheduleInfo,
  type ProposalFields,
  type CfpTalk,
  type CfpTopic,
  type Option,
  type ProposalCounts,
  type SpeakerRef,
} from './data'

const size = (assumedSize: number) => ({ listSize: { assumedSize } })
const str = { nullable: true } as const

// The generated builder declares no scalars; JSON is registered through a
// widened view of the same builder instance.
const JSON_ = (
  builder as unknown as PothosSchemaTypes.SchemaBuilder<
    PothosSchemaTypes.ExtendDefaultTypes<{
      Context: ResolverContext
      Scalars: { JSON: { Input: unknown; Output: unknown } }
    }>
  >
).addScalarType(
  'JSON',
  new GraphQLScalarType({
    name: 'JSON',
    description: 'Any JSON value. Fields using it document the shape.',
    serialize: (v) => v,
    parseValue: (v) => v,
    parseLiteral: (ast, vars) => valueFromASTUntyped(ast, vars),
  }),
) as never

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

const MySpeakerType = builder
  .objectRef<MySpeaker>('MyProposalSpeaker')
  .implement({
    description:
      "A speaker on one of your proposals, as the site's speaker portal shows them.",
    fields: (t) => ({
      id: t.exposeID('id'),
      name: t.exposeString('name', str),
      image: t.exposeString('image', {
        ...str,
        description:
          'Image URL (uploaded image with crop, else the login avatar).',
      }),
      slug: t.exposeString('slug', str),
      email: t.exposeString('email', {
        ...str,
        description:
          "Shown to the talk's speakers only, as on the site; null to anyone else.",
      }),
    }),
  })

const ScheduleInfoType = builder
  .objectRef<ScheduleInfo>('MyProposalSchedule')
  .implement({
    fields: (t) => ({
      date: t.exposeString('date', str),
      trackTitle: t.exposeString('trackTitle', str),
      startTime: t.exposeString('startTime', str),
      endTime: t.exposeString('endTime', str),
    }),
  })

const AttachmentType = builder
  .objectRef<Attachment>('MyProposalAttachment')
  .implement({
    fields: (t) => ({
      key: t.exposeID('key'),
      kind: t.exposeString('kind', { description: '`file` or `url`.' }),
      attachmentType: t.exposeString('attachmentType', str),
      title: t.exposeString('title', str),
      description: t.exposeString('description', str),
      filename: t.exposeString('filename', str),
      url: t.exposeString('url', str),
      uploadedAt: t.exposeString('uploadedAt', str),
    }),
  })

const InvitationType = builder
  .objectRef<Invitation>('CoSpeakerInvitation')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      invitedEmail: t.exposeString('invitedEmail', str),
      invitedName: t.exposeString('invitedName', str),
      status: t.exposeString('status', {
        description:
          'pending, accepted, declined, expired or canceled; a lapsed pending invite reads expired.',
      }),
      expiresAt: t.exposeString('expiresAt', str),
      createdAt: t.exposeString('createdAt', str),
      respondedAt: t.exposeString('respondedAt', str),
    }),
  })

// The conference subgraph owns Conference; this one only names it by id.
const ConferenceRef = builder
  .objectRef<{ id: string }>('Conference')
  .implement({ fields: (t) => ({ id: t.exposeID('id') }) })
builder.asEntity(ConferenceRef, {
  // resolvable: false; the stub resolver is never called by the router.
  key: builder.keyDirective(builder.selection<{ id: string }>('id'), false),
  resolveReference: () => null,
})

// Operator conference stats (#2142): cfp adds proposal counts to the entity
// tenant-directory's operator `conferences` list returns. Guard before fetch:
// only a PlatformContext resolves the reference, so nobody else reaches a
// count resolver.
const ProposalStatusCount = builder
  .objectRef<[string, number]>('ProposalStatusCount')
  .implement({
    fields: (t) => ({
      status: t.string({ resolve: ([s]) => s }),
      count: t.int({ resolve: ([, n]) => n }),
    }),
  })
const ProposalCountsType = builder
  .objectRef<ProposalCounts>('ProposalCounts')
  .implement({
    description:
      'Every proposal of the conference, draft and deleted included.',
    fields: (t) => ({
      total: t.exposeInt('total'),
      byStatus: t.field({
        type: [ProposalStatusCount],
        description: 'Sorted by status; a status with no proposals is absent.',
        resolve: (c) => [...c.byStatus].sort(([a], [b]) => a.localeCompare(b)),
      }),
    }),
  })
const OperatorConferenceStats = builder
  .objectRef<{ conferenceId: string }>('OperatorConferenceStats')
  .implement({
    fields: (t) => ({
      conferenceId: t.exposeID('conferenceId'),
      proposals: t.field({
        type: ProposalCountsType,
        tag: 'operator',
        resolve: async ({ conferenceId }, _, ctx) =>
          (await ctx.data.proposalCounts(conferenceId)) ?? {
            total: 0,
            byStatus: new Map(),
          },
      }),
    }),
  })
builder.asEntity(OperatorConferenceStats, {
  key: builder.selection<{ conferenceId: string }>('conferenceId'),
  resolveReference: (ref, ctx) =>
    ctx.envelope?.typ === 'platform' ? ref : null,
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
    description: t.field({
      type: JSON_,
      nullable: true,
      description:
        'Portable Text blocks: block with style normal, h1-h3, optional bullet or number list; spans with strong, em, underline and link marks.',
      resolve: (x) => x.description as never,
    }),
    tos: t.exposeBoolean('tos', {
      description: 'Whether the Terms of Service were accepted.',
    }),
    withdrawnReason: t.exposeString('withdrawnReason', str),
    conference: t.field({
      type: ConferenceRef,
      resolve: (x) => x.conference,
    }),
    scheduleInfo: t.field({
      type: ScheduleInfoType,
      nullable: true,
      description:
        'Where an accepted or confirmed talk is on the official schedule.',
      resolve: (x) => x.scheduleInfo,
    }),
    attachments: t.field({
      type: [AttachmentType],
      directives: size(5),
      resolve: (x) => x.attachments,
    }),
    coSpeakerInvitations: t.field({
      type: [InvitationType],
      directives: size(3),
      resolve: (x) => x.coSpeakerInvitations,
    }),
    speakers: t.field({
      type: [MySpeakerType],
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
    description:
      'Plain text; paragraphs separated by a blank line. Or send description.',
  }),
  description: t.field({
    type: JSON_,
    description:
      'Portable Text, instead of abstract. Only the block types and marks MyProposal.description lists; at most 200 blocks.',
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
      args: {
        id: t.arg.id({ required: true }),
        reason: t.arg.string({
          required: true,
          description: 'Why, as the site requires; shown to the organizers.',
        }),
      },
      resolve: (_, { id, reason }, ctx) =>
        ctx.data.mine().withdraw(String(id), reason),
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
  federationDirectives: ['@key', '@listSize', '@tag'],
})
