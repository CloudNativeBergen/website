// cfp: the public face of the conference's call for papers (#2077). The
// tenant comes from the envelope only. CFP dates and the conference's enabled
// formats are on Conference (conference subgraph); talk details are in
// program. No proposal state other than confirmed, no review and no speaker
// contact field exists in this schema.
import { builder } from './builder'
import type { CfpTalk, CfpTopic, Option, SpeakerRef } from './data'

const size = (assumedSize: number) => ({ listSize: { assumedSize } })
const str = { nullable: true } as const

// The site's option catalogues (src/lib/proposal/types.ts), copied because a
// Worker cannot import that module's `@/` graph;
// src/lib/proposal/cfp-options.parity.test.ts pins them
// equal.
const opts = (m: Record<string, string>): Option[] =>
  Object.entries(m).map(([value, label]) => ({ value, label }))
export const OPTIONS = {
  formats: opts({
    lightning_10: 'Lightning Talk (10 min)',
    presentation_20: 'Presentation (20 min)',
    presentation_25: 'Presentation (25 min)',
    presentation_40: 'Presentation (40 min)',
    presentation_45: 'Presentation (45 min)',
    workshop_120: 'Workshop (2 hours)',
    workshop_240: 'Workshop (4 hours)',
  }),
  levels: opts({
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  }),
  languages: opts({ norwegian: 'Norwegian', english: 'English' }),
  audiences: opts({
    developer: 'Developer',
    architect: 'Architect',
    operator: 'Operator',
    manager: 'Manager',
    dataEngineer: 'Data Engineer',
    securityEngineer: 'Security Engineer',
    qaEngineer: 'QA Engineer',
    devopsEngineer: 'DevOps Engineer',
  }),
}

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

builder.queryType({
  fields: (t) => ({
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
