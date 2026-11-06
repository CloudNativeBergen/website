/**
 * @vitest-environment node
 *
 * Parity with the site (#1772): one Sanity fixture, evaluated with the real
 * GROQ engine (groq-js) through the site's own queries and mappers and
 * through SanityProgramSource. The API shape must carry the same values.
 */
import { describe, expect, it } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { SanityProgramSource } from './data'
import { CONFERENCE_QUERY_FULL } from '../../../src/lib/conference/query'
import { EXPANDED_SECTIONS_KEY } from '../../../src/lib/conference/sections'
import { PUBLIC_TALK_FIELDS } from '../../../src/lib/proposal/public-groq'
import { toPublicTalk } from '../../../src/lib/proposal/public'

const ref = (_ref: string) => ({ _type: 'reference', _ref })
const DATASET = [
  { _id: 'org', _type: 'organization' },
  {
    _id: 'conf',
    _type: 'conference',
    organization: ref('org'),
    domains: ['a.example'],
    schedules: [ref('sched')],
  },
  { _id: 'tp', _type: 'topic', title: 'K8s', color: '#00f', slug: { current: 'k8s' } },
  {
    _id: 'sp',
    _type: 'speaker',
    name: 'Ada',
    title: 'Engineer',
    slug: { current: 'ada' },
    imageURL: 'https://avatars/ada.png',
    bio: 'Bio',
    links: ['https://ada.dev'],
    flags: ['local', 'requires-funding'],
    email: 'ada@private.example',
  },
  {
    _id: 'talk',
    _type: 'talk',
    status: 'confirmed',
    conference: ref('conf'),
    title: 'A talk',
    description: [{ _type: 'block', children: [{ text: 'About' }] }],
    language: 'english',
    level: 'beginner',
    format: 'presentation_25',
    audiences: ['developer'],
    topics: [ref('tp')],
    speakers: [ref('sp')],
    attachments: [
      {
        _type: 'urlAttachment',
        _key: 'k',
        url: 'https://youtu.be/x',
        attachmentType: 'recording',
        title: 'Video',
      },
    ],
  },
  {
    _id: 'sched',
    _type: 'schedule',
    conference: ref('conf'),
    date: '2026-05-02',
    tracks: [
      {
        trackTitle: 'Main',
        trackDescription: 'Big room',
        sponsor: ref('spons'),
        talks: [
          { startTime: '08:00', endTime: '08:30', placeholder: 'Coffee' },
          { startTime: '09:00', endTime: '09:45', talk: ref('talk') },
        ],
      },
    ],
  },
  {
    _id: 'gal',
    _type: 'imageGallery',
    conference: ref('conf'),
    speakers: [ref('sp')],
    image: { alt: 'On stage' },
    photographer: 'Pat',
    featured: true,
  },
]

const groq = async (q: string, params: Record<string, unknown>) =>
  (await evaluate(parse(q), { dataset: DATASET, params })).get()
const source = new SanityProgramSource({
  fetch: groq,
} as unknown as ConstructorParameters<typeof SanityProgramSource>[0])
const t = { orgId: 'org', conferenceId: 'conf' }

describe('parity with the site', () => {
  it('speaker profile talks match listPublicTalks + toPublicTalk', async () => {
    // The site's listPublicTalks query, verbatim.
    const rows = await groq(
      `*[_type == "talk" && status == "confirmed" && conference._ref == $conferenceId && references($speakerId)]{ ${PUBLIC_TALK_FIELDS} }`,
      { conferenceId: 'conf', speakerId: 'sp' },
    )
    const site = (rows as unknown[]).map(toPublicTalk)
    const api = (await source.speakerBySlug(t, 'ada'))!
    expect(site).toHaveLength(1)
    expect(api.talks).toEqual(
      site.map((s) => ({
        id: s._id,
        title: s.title,
        description: JSON.stringify(s.description),
        format: s.format,
        level: s.level,
        language: s.language,
        audiences: ['developer'], // the API's addition
        topics: s.topics!.map((x) => ({
          id: x._id,
          title: x.title,
          slug: x.slug,
          color: '#00f', // the API's addition
        })),
        attachments: s.attachments!.map((a) => ({
          kind: 'url',
          attachmentType: a.attachmentType,
          title: a.title ?? null,
          description: a.description ?? null,
          filename: null,
          url: a.url,
        })),
        speakers: s.speakers!.map((x) => ({
          id: x._id,
          name: x.name,
          slug: x.slug,
          title: x.title,
          image: x.image,
        })),
        scheduleInfo: {
          date: s.scheduleInfo!.date,
          trackTitle: s.scheduleInfo!.trackTitle,
          startTime: s.scheduleInfo!.timeSlot!.startTime,
          endTime: s.scheduleInfo!.timeSlot!.endTime,
        },
      })),
    )
    // Gallery and the site's one public badge.
    expect(api.flags).toEqual(['local'])
    expect(api.galleryImages).toEqual([
      expect.objectContaining({ id: 'gal', alt: 'On stage', featured: true }),
    ])
  })

  it('program slots match getConferenceForDomain(schedule: true)', async () => {
    const conf = (await groq(CONFERENCE_QUERY_FULL, {
      domain: 'a.example',
      wildcardSubdomain: '',
    })) as Record<string, Record<string, unknown>>
    type Raw = Record<string, unknown>
    const [day] = conf[EXPANDED_SECTIONS_KEY].schedules as Raw[]
    const [track] = day.tracks as Raw[]
    const api = await source.program(t)
    expect(api).toHaveLength(1)
    expect(api[0].date).toBe(day.date)
    expect(api[0].slots).toEqual(
      (track.talks as Raw[]).map((sl) => {
        const talk = sl.talk as Raw | null
        const sp = talk && (talk.speakers as Raw[])[0]
        return {
          start: sl.startTime,
          end: sl.endTime,
          placeholder: sl.placeholder ?? null,
          room: track.trackTitle,
          track: {
            name: track.trackTitle,
            description: track.trackDescription,
            sponsorId: (track.sponsor as Raw)._ref,
          },
          talk: talk && {
            id: talk._id,
            title: talk.title,
            description: JSON.stringify(talk.description),
            format: talk.format,
            level: talk.level,
            language: talk.language,
            audiences: talk.audiences,
            topics: (talk.topics as Raw[]).map((x) => ({
              id: x._id,
              title: x.title,
              slug: (x.slug as Raw).current,
              color: x.color,
            })),
            attachments: [],
            speakers: [
              {
                id: sp!._id,
                name: sp!.name,
                slug: sp!.slug,
                title: sp!.title,
                image: sp!.image,
              },
            ],
            scheduleInfo: null,
          },
        }
      }),
    )
  })
})
