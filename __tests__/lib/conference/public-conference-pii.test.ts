/**
 * PUBLIC PAGES MUST NOT DISCLOSE PII — two layers, both pinned here.
 *
 * Layer 1 — the tenant query. `EXPANDED_ORGANIZERS` / `EXPANDED_FEATURED_SPEAKERS`
 * dereference SPEAKER documents, and those sections ride the RSC flight payload
 * of every anonymous homepage render. A `...` spread there published 18 real
 * email addresses (plus providers/consent/flags/gender) on a production
 * homepage. The queries are evaluated with groq-js against a dataset whose
 * speaker carries every sensitive field, and the result must contain none of
 * them. Re-widening a projection to `...` fails this suite.
 *
 * Layer 2 — the client-component boundary. `Header` and `ConferenceLogo` are
 * `'use client'`; their props serialize verbatim into the flight payload, and
 * structural typing accepts a whole `Conference` where a narrow pick is
 * declared — which shipped `agentConfig` (the sponsor-outreach AI prompt) and
 * `checkinCustomerId` to anonymous visitors on every public page. The element
 * trees of the real `Layout` and `Footer` are inspected WITHOUT rendering, so
 * the assertion is on exactly what would be serialized: the props handed to
 * the client components must carry only the declared picks.
 */

import { parse, evaluate } from 'groq-js'
import type { ReactElement } from 'react'
import {
  CONFERENCE_QUERY_CORE,
  CONFERENCE_QUERY_FULL,
} from '@/lib/conference/query'
import {
  pickConferenceLogoProps,
  pickHeaderConference,
} from '@/lib/conference/logo'
import { Layout } from '@/components/Layout'
import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import type { Conference } from '@/lib/conference/types'

const HOST = 'example.com'

/** Every sensitive string below must be absent from public output. */
const SPEAKER_PII = {
  email: 'pat@example.com',
  knownEmails: ['pat@example.com', 'pat@corp.example'],
  providers: ['github', 'linkedin'],
  consent: {
    dataProcessing: { granted: true, grantedAt: '2026-01-01T00:00:00Z' },
  },
  gender: 'prefer-not-to-say',
}

const SPEAKER = {
  _id: 'speaker-1',
  _type: 'speaker',
  name: 'Pat Speaker',
  title: 'Engineer at Acme',
  slug: { current: 'pat-speaker' },
  imageURL: 'https://img.example/pat.png',
  // 'local' and 'first-time' are the two presentational values public cards
  // render as badges; 'diverse' and 'requires-funding' are sensitive markers.
  flags: ['local', 'first-time', 'diverse', 'requires-funding'],
  ...SPEAKER_PII,
}

const TALK = {
  _id: 'talk-1',
  _type: 'talk',
  title: 'A Confirmed Talk',
  description: 'About things.',
  format: 'presentation_45',
  status: 'confirmed',
  conference: { _type: 'reference', _ref: 'conf-1' },
  speakers: [{ _type: 'reference', _ref: 'speaker-1' }],
}

const CONFERENCE_DOC = {
  _id: 'conf-1',
  _type: 'conference',
  title: 'Example Conf',
  domains: [HOST],
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-10-01',
  endDate: '2026-10-02',
  registrationEnabled: true,
  registrationLink: 'https://tickets.example.com',
  organizers: [{ _type: 'reference', _ref: 'speaker-1', _key: 'o1' }],
  featuredSpeakers: [{ _type: 'reference', _ref: 'speaker-1', _key: 'f1' }],
  // The document's own private fields — must never cross a client boundary.
  checkinCustomerId: 424242,
  agentConfig: { systemPrompt: 'SECRET-AGENT-PROMPT' },
  teams: [
    {
      _key: 't1',
      key: 'program',
      title: 'Program',
      slackChannel: '#secret-program',
      members: [{ _type: 'reference', _ref: 'speaker-1', _key: 'm1' }],
    },
  ],
}

const DATASET = [CONFERENCE_DOC, SPEAKER, TALK]

async function runQuery(query: string) {
  const tree = parse(query)
  const value = await evaluate(tree, {
    dataset: DATASET,
    params: { domain: HOST, wildcardSubdomain: HOST },
  })
  return value.get()
}

describe('tenant query: expanded speaker sections carry no PII', () => {
  it.each([
    ['core', CONFERENCE_QUERY_CORE],
    ['full', CONFERENCE_QUERY_FULL],
  ])('%s tier', async (_tier, query) => {
    const result = await runQuery(query)
    expect(result?._id).toBe('conf-1')

    const expanded = result.__expanded
    const serialized = JSON.stringify(expanded)

    // Guard against fixture rot: the dataset really does carry the PII.
    expect(JSON.stringify(DATASET)).toContain('pat@example.com')

    for (const needle of [
      'pat@example.com',
      'pat@corp.example',
      'knownEmails',
      'providers',
      'github',
      'consent',
      'grantedAt',
      'gender',
      'diverse',
      'requires-funding',
    ]) {
      expect(serialized).not.toContain(needle)
    }

    // The narrowing must not have taken the rendered fields with it.
    expect(expanded.organizers).toEqual([
      {
        _id: 'speaker-1',
        name: 'Pat Speaker',
        title: 'Engineer at Acme',
        slug: 'pat-speaker',
        image: 'https://img.example/pat.png',
      },
    ])
    const featured = expanded.featuredSpeakers[0]
    expect(featured.name).toBe('Pat Speaker')
    expect(featured.slug).toBe('pat-speaker')
    // Only the two presentational badge values survive.
    expect(featured.flags).toEqual(['local', 'first-time'])
    expect(featured.talks).toEqual([
      {
        _id: 'talk-1',
        title: 'A Confirmed Talk',
        description: 'About things.',
        format: 'presentation_45',
        status: 'confirmed',
      },
    ])
  })
})

/**
 * Collect every element of `type` from a JSX tree WITHOUT rendering it: nested
 * component functions are never invoked, so what this walker sees in `props`
 * is exactly what React would serialize into the flight payload at the
 * server/client boundary.
 */
function findElements(
  node: unknown,
  type: unknown,
  out: ReactElement<Record<string, unknown>>[] = [],
): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, type, out)
    return out
  }
  if (!node || typeof node !== 'object') return out
  const el = node as ReactElement<Record<string, unknown>>
  if (!('type' in el && 'props' in el)) return out
  if (el.type === type) out.push(el)
  if (el.props && typeof el.props === 'object') {
    for (const value of Object.values(el.props)) findElements(value, type, out)
  }
  return out
}

// A full conference as the layout receives it (unexpanded refs are irrelevant
// here — the point is the document's own private fields).
const FULL_CONFERENCE = CONFERENCE_DOC as unknown as Conference

const LOGO_KEYS = [
  'logoBright',
  'logoDark',
  'logomarkBright',
  'logomarkDark',
  'title',
]

const HEADER_KEYS = [
  ...LOGO_KEYS,
  'city',
  'country',
  'domains',
  'endDate',
  'registrationEnabled',
  'registrationLink',
  'startDate',
]

describe('client boundaries: whole conference objects never cross', () => {
  it('Layout hands Header exactly the header pick', async () => {
    const tree = await Layout({
      conference: FULL_CONFERENCE,
      children: null,
    })
    const [header] = findElements(tree, Header)
    expect(header).toBeDefined()

    const c = header.props.c as Record<string, unknown>
    expect(Object.keys(c).sort()).toEqual([...HEADER_KEYS].sort())
    const serialized = JSON.stringify(header.props)
    expect(serialized).not.toContain('agentConfig')
    expect(serialized).not.toContain('SECRET-AGENT-PROMPT')
    expect(serialized).not.toContain('checkinCustomerId')
    expect(serialized).not.toContain('slackChannel')
  })

  it('Footer hands ConferenceLogo exactly the logo pick', () => {
    const tree = Footer({ c: FULL_CONFERENCE })
    const [logo] = findElements(tree, ConferenceLogo)
    expect(logo).toBeDefined()

    const conference = logo.props.conference as Record<string, unknown>
    expect(Object.keys(conference).sort()).toEqual([...LOGO_KEYS].sort())
    expect(JSON.stringify(logo.props)).not.toContain('agentConfig')
  })

  // Hero and Sponsors call pickConferenceLogoProps themselves, and
  // ConferenceLogoData is all-optional — a reverted call site passing the full
  // conference would still typecheck structurally. These pins are the only
  // thing besides convention guarding those two trees.
  it('Hero hands ConferenceLogo exactly the logo pick', async () => {
    const { Hero } = await import('@/components/Hero')
    const dispatched = await Hero({
      conference: FULL_CONFERENCE,
      variant: 'emblem',
    } as never)
    // Hero dispatches to a variant component; invoke that one level so the
    // tree containing ConferenceLogo exists without rendering client code.
    const inner = dispatched as {
      type: (p: unknown) => unknown
      props: unknown
    }
    const tree =
      typeof inner.type === 'function' ? inner.type(inner.props) : dispatched
    const logos = findElements(tree, ConferenceLogo)
    expect(logos.length).toBeGreaterThan(0)
    for (const logo of logos) {
      const conference = logo.props.conference as Record<string, unknown>
      expect(Object.keys(conference).sort()).toEqual([...LOGO_KEYS].sort())
      expect(JSON.stringify(logo.props)).not.toContain('agentConfig')
    }
  })

  it('Sponsors hands ConferenceLogo exactly the logo pick', async () => {
    const { Sponsors } = await import('@/components/Sponsors')
    const tree = Sponsors({
      sponsors: [],
      conference: FULL_CONFERENCE,
      showCTA: true,
    } as never)
    const logos = findElements(tree, ConferenceLogo)
    for (const logo of logos) {
      const conference = logo.props.conference as Record<string, unknown>
      expect(Object.keys(conference).sort()).toEqual([...LOGO_KEYS].sort())
      expect(JSON.stringify(logo.props)).not.toContain('agentConfig')
    }
  })

  it('the picks are exact allowlists even against a PII-laden document', () => {
    expect(
      Object.keys(pickConferenceLogoProps(FULL_CONFERENCE) ?? {}).sort(),
    ).toEqual([...LOGO_KEYS].sort())
    expect(Object.keys(pickHeaderConference(FULL_CONFERENCE)).sort()).toEqual(
      [...HEADER_KEYS].sort(),
    )
  })
})
