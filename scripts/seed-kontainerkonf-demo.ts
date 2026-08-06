#!/usr/bin/env tsx

/**
 * Seed the KontainerKonf DEMO tenant (platform#47).
 *
 * WHAT THIS IS
 *   One long-lived, fictional demo organization in the SHARED PRODUCTION
 *   dataset that prospective customers are invited into. Everything it writes
 *   is synthetic: invented people, invented companies, `@kontainerkonf.example`
 *   addresses (RFC 2606 — permanently unresolvable, so nothing can ever be
 *   delivered to a real person) and `https://example.com/...` sponsor sites.
 *   No real person's name, bio, photo or employer appears anywhere, and no
 *   external asset is fetched or embedded.
 *
 * SAFETY MODEL (this writes to production — read this before running)
 *   1. CREATE-ONLY, NAMESPACED. Every document id starts with `kkdemo.`, with
 *      one allow-listed exception: the budget document, whose id the app itself
 *      derives as `conferenceBudget-<conferenceId>` (so it still contains
 *      `kkdemo` and is still greppable). `assertNamespacedIds` refuses to run
 *      if any other id sneaks in, so this script can never touch a document it
 *      did not author.
 *   2. IDEMPOTENT. All writes are `createOrReplace` on deterministic ids, so
 *      re-running converges instead of duplicating.
 *   3. TENANT-PINNED. The seeded organization slug must be `kontainerkonf`
 *      (`REQUIRED_ORG_SLUG`) and, if a document already exists at
 *      `kkdemo.org`, its slug must match before anything is written. A
 *      pre-flight also refuses to proceed if any `kkdemo.*` id is occupied by
 *      a document of an unexpected `_type`.
 *   4. PHASED + VERIFIED. Documents are written in dependency order in small
 *      labelled phases, and each phase is read back before the next one runs.
 *      A failure leaves a partial demo tenant, never a damaged dataset.
 *   5. CENSUS. Organization / conference / speaker / total counts are printed
 *      before and after, so the blast radius is visible in the transcript.
 *
 * USAGE
 *   Auth comes from the Sanity CLI session, so run it through `sanity exec`:
 *
 *     npx sanity exec scripts/seed-kontainerkonf-demo.ts --with-user-token
 *       -> DRY RUN (default). Prints the census, the full document plan and a
 *          per-phase summary. Writes nothing.
 *
 *     npx sanity exec scripts/seed-kontainerkonf-demo.ts --with-user-token -- --write
 *       -> Performs the seed.
 *
 *     ... -- --write --organizer <speakerId>
 *       -> Additionally appends an EXISTING speaker document to the demo
 *          conference's `organizers[]`. Organizer access is granted by
 *          membership of `conference.organizers[]` (src/lib/authz/organizer.ts),
 *          and the seeded organizers are fictional speakers nobody can sign in
 *          as — so without this flag the demo `/admin` (the actual sales asset)
 *          is unreachable. Only the demo conference document is modified; the
 *          referenced speaker document is not touched.
 *
 * KNOWN LIMITATION (by design, not a bug)
 *   `/tickets` will read "Tickets Coming Soon". Public ticket types come
 *   exclusively from an external provider binding (Checkin.no / Tito) — there
 *   is no ticket-type document in Sanity — and the demo tenant deliberately has
 *   no provider credentials, so ticketing fails closed. There is no data-only
 *   fix. See src/lib/tickets/provider/index.ts.
 */

import { getCliClient } from 'sanity/cli'
import { defaultBudgetSeed } from '../src/lib/budget/defaults'

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const ID_PREFIX = 'kkdemo.'
const REQUIRED_ORG_SLUG = 'kontainerkonf'

const ORG_ID = `${ID_PREFIX}org`
const CONFERENCE_ID = `${ID_PREFIX}conference`
/** The app derives this id itself (src/lib/budget/sanity.ts `budgetDocumentId`),
 *  so we must use it verbatim or an admin "Create budget" click would mint a
 *  SECOND budget document that an unordered `[0]` read could then pick. */
const BUDGET_ID = `conferenceBudget-${CONFERENCE_ID}`

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const organizerFlagIndex = args.indexOf('--organizer')
const EXTRA_ORGANIZER_ID =
  organizerFlagIndex >= 0 ? args[organizerFlagIndex + 1] : undefined

const client = getCliClient({ apiVersion: '2024-04-02' })

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

type Doc = Record<string, unknown> & { _id: string; _type: string }

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const keyedRef = (id: string, key: string) => ({
  _type: 'reference',
  _ref: id,
  _key: key,
})
const slug = (current: string) => ({ _type: 'slug', current })

/** Portable Text paragraph(s) from plain strings. */
const pt = (...paragraphs: string[]) =>
  paragraphs.map((text, i) => ({
    _type: 'block',
    _key: `b${i}`,
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: `s${i}`, text, marks: [] }],
  }))

/**
 * A self-authored inline SVG wordmark. Sponsor logos are `inlineSvg` strings
 * and `SponsorLogo` renders NOTHING when both logo fields are empty, which
 * would leave the sponsor band as tier headings over blank tiles. These are
 * generated locally from the sponsor name — no external asset is fetched.
 * `currentColor` makes one mark work in both light and dark themes.
 */
const wordmark = (name: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.max(120, name.length * 11)} 32" role="img" aria-label="${name}">` +
  `<text x="0" y="22" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="20" font-weight="600" letter-spacing="-0.5" fill="currentColor">${name}</text>` +
  `</svg>`

// ---------------------------------------------------------------------------
// CONTENT — all fictional
// ---------------------------------------------------------------------------

const CONF_DATE = '2026-11-12' // single-day edition, in the future
const PROGRAM_DATE = '2026-07-15' // in the PAST: Program Highlights only renders once passed

const organization: Doc = {
  _id: ORG_ID,
  _type: 'organization',
  name: 'KontainerKonf',
  slug: slug(REQUIRED_ORG_SLUG),
  contactEmail: 'hello@kontainerkonf.example',
  billingEmail: 'billing@kontainerkonf.example',
  // Community plan, ZERO feature overrides: the demo must show the real
  // entitlement gating a prospect would get (platform#47).
  plan: 'community',
}

const TOPICS: Array<{
  key: string
  title: string
  color: string
  desc: string
}> = [
  {
    key: 'kubernetes',
    title: 'Kubernetes & Orchestration',
    color: '#326CE5',
    desc: 'Cluster architecture, workload scheduling, operators and the control plane.',
  },
  {
    key: 'platform-engineering',
    title: 'Platform Engineering',
    color: '#7C3AED',
    desc: 'Internal developer platforms, golden paths and the teams that run them.',
  },
  {
    key: 'observability',
    title: 'Observability',
    color: '#0EA5E9',
    desc: 'Metrics, traces, logs, profiling and knowing what your system is doing.',
  },
  {
    key: 'security',
    title: 'Security & Supply Chain',
    color: '#DC2626',
    desc: 'Signing, provenance, policy, secrets and hardening what you ship.',
  },
  {
    key: 'devex',
    title: 'Developer Experience',
    color: '#16A34A',
    desc: 'Build times, feedback loops, local development and tooling that gets out of the way.',
  },
  {
    key: 'edge-wasm',
    title: 'Edge & WebAssembly',
    color: '#EA580C',
    desc: 'Running workloads outside the data centre, and the runtimes that make it possible.',
  },
]

const topicId = (key: string) => `${ID_PREFIX}topic.${key}`

const topics: Doc[] = TOPICS.map((t) => ({
  _id: topicId(t.key),
  _type: 'topic',
  title: t.title,
  description: t.desc,
  color: t.color,
  slug: slug(t.key),
  organization: ref(ORG_ID),
}))

type SpeakerSeed = {
  key: string
  name: string
  title: string
  bio: string
  flags?: string[]
  country?: string
}

/** Programme committee — also the reviewers. Fictional. */
const ORGANIZER_SPEAKERS: SpeakerSeed[] = [
  {
    key: 'chair',
    name: 'Ingrid Solvang',
    title: 'Programme Chair, KontainerKonf',
    bio: 'Chairs the KontainerKonf programme committee and has run the review process since the first edition. Spends her working hours on platform reliability.',
    country: 'Norway',
    flags: ['local'],
  },
  {
    key: 'review-1',
    name: 'Marek Oduya',
    title: 'Programme Committee',
    bio: 'Reviews for the runtime and security track. Long-time operator of clusters that were never meant to get this large.',
    country: 'Norway',
    flags: ['local'],
  },
  {
    key: 'review-2',
    name: 'Petra Lindqvist',
    title: 'Programme Committee',
    bio: 'Reviews for the developer experience track and looks after speaker support.',
    country: 'Sweden',
  },
]

/** Presenting speakers. Fictional people at fictional companies. */
const TALK_SPEAKERS: SpeakerSeed[] = [
  {
    key: '01',
    name: 'Aleksander Hovden',
    title: 'Staff Platform Engineer, Nordvind Systems',
    bio: 'Builds and unbuilds internal developer platforms. Believes most platform problems are org-chart problems wearing a YAML costume.',
    country: 'Norway',
    flags: ['local'],
  },
  {
    key: '02',
    name: 'Rin Takahashi',
    title: 'SRE Lead, Fjordline Data',
    bio: 'Works on kernel-level observability and on convincing colleagues that a flame graph is not a punishment.',
    country: 'Japan',
    flags: ['requires-funding'],
  },
  {
    key: '03',
    name: 'Odalys Mercado',
    title: 'Principal Engineer, Kestrel Cloud',
    bio: 'Spends her time on deployment safety for systems where rolling back is not an option.',
    country: 'Spain',
    flags: ['requires-funding'],
  },
  {
    key: '04',
    name: 'Tobias Wren',
    title: 'Security Engineer, Bramble Labs',
    bio: 'Works on artifact signing and supply-chain provenance. Maintains more policy code than he would like to admit.',
    country: 'United Kingdom',
  },
  {
    key: '05',
    name: 'Nadia Berhane',
    title: 'Developer Advocate, Kestrel Cloud',
    bio: 'Translates between security teams and the people shipping the software. Writes incident retrospectives for fun.',
    country: 'Germany',
    flags: ['first-time'],
  },
  {
    key: '06',
    name: 'Jonas Kvist',
    title: 'Infrastructure Architect, Havlyd AS',
    bio: 'Runs clusters across three regions and two decades of accumulated opinions about storage.',
    country: 'Norway',
    flags: ['local'],
  },
  {
    key: '07',
    name: 'Mei-Ling Farrow',
    title: 'Observability Engineer, Nordvind Systems',
    bio: 'Instruments things for a living and is still annoyed by how often the instrumentation is the bug.',
    country: 'Norway',
    flags: ['local'],
  },
  {
    key: '08',
    name: 'Samir Deyab',
    title: 'Independent Consultant',
    bio: 'Contributes to container runtimes and helps teams understand what their scheduler is actually doing.',
    country: 'Denmark',
  },
  {
    key: '09',
    name: 'Elin Rasmussen',
    title: 'Head of Platform, Tindra Retail',
    bio: 'Two years into building a platform team inside a retailer, and happy to talk about what went wrong first.',
    country: 'Norway',
    flags: ['local'],
  },
  {
    key: '10',
    name: 'Bruno Castellani',
    title: 'Staff Engineer, Ostrea Payments',
    bio: 'Works on cost visibility as a product surface rather than a monthly surprise.',
    country: 'Italy',
    flags: ['requires-funding'],
  },
  {
    key: '11',
    name: 'Hana Moravec',
    title: 'Runtime Researcher, Bramble Labs',
    bio: 'Researches WebAssembly runtimes at the edge and insists on publishing the benchmarks that did not flatter her.',
    country: 'Czechia',
    flags: ['first-time'],
  },
  {
    key: '12',
    name: 'Kwame Antwi',
    title: 'Developer Experience Lead, Fjordline Data',
    bio: 'Measures feedback loops and deletes tooling. Has removed more golden paths than he has added.',
    country: 'Ghana',
    flags: ['requires-funding', 'first-time'],
  },
]

const ALL_SPEAKERS = [...ORGANIZER_SPEAKERS, ...TALK_SPEAKERS]

const speakerId = (key: string) => `${ID_PREFIX}speaker.${key}`
const stripDiacritics = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
const emailFor = (name: string) =>
  `${stripDiacritics(name)
    .replace(/[^a-z ]/g, '')
    .trim()
    .replace(/\s+/g, '.')}@kontainerkonf.example`
const slugFor = (name: string) =>
  stripDiacritics(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const speakers: Doc[] = ALL_SPEAKERS.map((s) => ({
  _id: speakerId(s.key),
  _type: 'speaker',
  name: s.name,
  title: s.title,
  slug: slug(slugFor(s.name)),
  email: emailFor(s.name),
  bio: s.bio,
  organizations: [keyedRef(ORG_ID, 'org')],
  ...(s.flags ? { flags: s.flags } : {}),
  ...(s.country ? { country: s.country } : {}),
  // No `image` / `imageURL`: avatars degrade gracefully to initials, and the
  // demo deliberately embeds no external content.
}))

type TalkSeed = {
  key: string
  title: string
  abstract: string[]
  outline: string
  speakers: string[]
  topics: string[]
  format: string
  level: string
  status: 'confirmed' | 'submitted'
  audiences: string[]
  capacity?: number
  prerequisites?: string
}

const CONFIRMED_TALKS: TalkSeed[] = [
  {
    key: 'a1',
    title: "Paved Roads Without Potholes: A Platform Team's Second Year",
    abstract: [
      'The first year of a platform team is easy to talk about: you pick a problem, you build the thing, everyone is grateful. The second year is where it gets interesting, because now you own it.',
      'A field report on what we kept, what we deleted, and the three metrics that turned out to actually predict whether a team would adopt the paved road.',
    ],
    outline:
      'Year one recap (5m) - the adoption cliff (10m) - three metrics that predicted adoption (15m) - what we deleted (7m) - Q&A (3m)',
    speakers: ['09'],
    topics: ['platform-engineering', 'devex'],
    format: 'presentation_40',
    level: 'intermediate',
    status: 'confirmed',
    audiences: ['architect', 'manager', 'devopsEngineer'],
  },
  {
    key: 'a2',
    title: 'Ten Golden Paths We Deleted',
    abstract: [
      'Every golden path we added had a champion. Every one we deleted had a maintenance bill. A short, blunt tour of ten abstractions we removed and what happened to the teams that depended on them.',
    ],
    outline:
      'Why we counted our abstractions (4m) - the ten (12m) - what broke (4m)',
    speakers: ['12'],
    topics: ['devex', 'platform-engineering'],
    format: 'presentation_20',
    level: 'beginner',
    status: 'confirmed',
    audiences: ['developer', 'devopsEngineer'],
  },
  {
    key: 'a3',
    title: 'Multi-Cluster Without the Mythology',
    abstract: [
      'Multi-cluster is usually sold as a resilience story and bought as a compliance one. We run three regions, and almost none of the reasons we expected turned out to be the reasons that mattered.',
      'What actually forced the topology, which failure modes it genuinely removed, and the operational tax nobody puts on the slide.',
    ],
    outline:
      'Why we ended up multi-cluster (8m) - the topology (10m) - failure modes removed and added (15m) - what we would do differently (7m)',
    speakers: ['06'],
    topics: ['kubernetes'],
    format: 'presentation_40',
    level: 'advanced',
    status: 'confirmed',
    audiences: ['architect', 'operator', 'devopsEngineer'],
  },
  {
    key: 'a4',
    title: 'Cost Signals as a Platform Feature',
    abstract: [
      'Cloud cost usually arrives as a monthly spreadsheet aimed at the wrong people. We put it in the pull request instead.',
      'How we attributed spend to workloads, what we got wrong about unit economics, and why the first version made engineers ignore it entirely.',
    ],
    outline:
      'The monthly-spreadsheet failure mode (6m) - attribution model (12m) - putting it in the PR (12m) - what changed in behaviour (10m)',
    speakers: ['10'],
    topics: ['platform-engineering'],
    format: 'presentation_40',
    level: 'intermediate',
    status: 'confirmed',
    audiences: ['manager', 'architect', 'devopsEngineer'],
  },
  {
    key: 'a5',
    title: 'The Portal Was Not the Answer (For Us)',
    abstract: [
      'We built a developer portal, and adoption stalled at eleven percent. This is the honest post-mortem: what the portal solved, what it did not, and what we replaced it with.',
    ],
    outline:
      'What we built (5m) - the eleven percent (6m) - what people actually wanted (6m) - the replacement (3m)',
    speakers: ['01'],
    topics: ['devex', 'platform-engineering'],
    format: 'presentation_20',
    level: 'intermediate',
    status: 'confirmed',
    audiences: ['developer', 'manager'],
  },
  {
    key: 'a6',
    title: 'Progressive Delivery for Teams That Cannot Roll Back',
    abstract: [
      'Rollback is the assumption underneath most deployment advice. Once you have a schema migration, a stateful upgrade, or a partner integration, that assumption is gone.',
      'Patterns for shipping safely when reverting is not on the table, and how to tell which of your changes are genuinely irreversible.',
    ],
    outline:
      'Where rollback stops working (8m) - classifying irreversibility (10m) - four patterns (15m) - failure stories (7m)',
    speakers: ['03'],
    topics: ['platform-engineering', 'kubernetes'],
    format: 'presentation_40',
    level: 'advanced',
    status: 'confirmed',
    audiences: ['architect', 'operator', 'devopsEngineer'],
  },
  {
    key: 'b1',
    title: 'Sigstore in Anger: Signing Every Artifact We Ship',
    abstract: [
      'Signing one container image is a demo. Signing everything you ship, on every branch, without stopping the build, is a project.',
      'What it took to get to full coverage, where the developer experience got worse before it got better, and how we handled the artifacts we could not sign.',
    ],
    outline:
      'The starting point (6m) - rollout order (10m) - verification at admission (12m) - the unsignable long tail (8m) - Q&A (4m)',
    speakers: ['04'],
    topics: ['security'],
    format: 'presentation_40',
    level: 'intermediate',
    status: 'confirmed',
    audiences: ['securityEngineer', 'devopsEngineer', 'developer'],
  },
  {
    key: 'b2',
    title: 'Your Traces Are Lying to You',
    abstract: [
      'Sampling, clock skew, missing context propagation and instrumentation that quietly drops spans. A short tour of the four ways a trace can be confidently wrong, and how to notice.',
    ],
    outline: 'Four lies (12m) - how to detect each (6m) - what we changed (2m)',
    speakers: ['07'],
    topics: ['observability'],
    format: 'presentation_20',
    level: 'intermediate',
    status: 'confirmed',
    audiences: ['developer', 'operator', 'devopsEngineer'],
  },
  {
    key: 'b3',
    title: 'eBPF for People Who Are Not Kernel Developers',
    abstract: [
      'eBPF talks tend to start at the verifier and lose most of the room by minute four. This one starts from the questions you actually have about your production system.',
      'What you can see without touching application code, what it costs, and where the sharp edges are on a shared cluster.',
    ],
    outline:
      'What problem it solves (8m) - a mental model without kernel internals (12m) - three practical uses (12m) - overhead and sharp edges (8m)',
    speakers: ['02'],
    topics: ['observability', 'kubernetes'],
    format: 'presentation_40',
    level: 'beginner',
    status: 'confirmed',
    audiences: ['operator', 'developer', 'devopsEngineer'],
  },
  {
    key: 'b4',
    title: 'What the Kubelet Actually Does With Your Pod',
    abstract: [
      'Between "scheduled" and "running" there is a surprising amount of machinery, and most of the confusing failures in a cluster live in that gap.',
      'A walk through the lifecycle at the node level, using the failure modes that actually page people.',
    ],
    outline:
      'Admission to running, step by step (14m) - the four failure modes that page you (14m) - reading the evidence (10m) - Q&A (2m)',
    speakers: ['08'],
    topics: ['kubernetes'],
    format: 'presentation_40',
    level: 'advanced',
    status: 'confirmed',
    audiences: ['operator', 'devopsEngineer', 'architect'],
  },
  {
    key: 'b5',
    title: 'Wasm at the Edge: Three Honest Benchmarks',
    abstract: [
      'Cold start, throughput and memory, measured on real edge hardware, including the workload where WebAssembly was clearly the wrong choice.',
    ],
    outline:
      'Method and hardware (5m) - three benchmarks (11m) - the one that lost (4m)',
    speakers: ['11'],
    topics: ['edge-wasm'],
    format: 'presentation_20',
    level: 'intermediate',
    status: 'confirmed',
    audiences: ['developer', 'architect'],
  },
  {
    key: 'b6',
    title: 'Supply Chain Attacks We Actually Survived',
    abstract: [
      'Two incidents, one dependency and one build system, told from the inside: what we saw first, what the timeline really looked like, and which of our controls did nothing.',
      'Includes the uncomfortable part where the control that saved us was one we had almost removed the previous quarter.',
    ],
    outline:
      'Incident one (12m) - incident two (12m) - which controls mattered (12m) - what we changed (4m)',
    speakers: ['05', '04'],
    topics: ['security'],
    format: 'presentation_40',
    level: 'intermediate',
    status: 'confirmed',
    audiences: ['securityEngineer', 'devopsEngineer', 'manager'],
  },
]

const SUBMITTED_TALKS: TalkSeed[] = [
  {
    key: 's1',
    title: 'Operators Are Just Control Loops With Opinions',
    abstract: [
      'A practical look at when an operator is the right answer and when it is an expensive way to write a cron job, based on four we built and two we deleted.',
    ],
    outline:
      'The control loop (8m) - four operators we built (14m) - two we deleted (10m) - decision checklist (8m)',
    speakers: ['08'],
    topics: ['kubernetes'],
    format: 'presentation_40',
    level: 'intermediate',
    status: 'submitted',
    audiences: ['operator', 'developer', 'architect'],
  },
  {
    key: 's2',
    title: 'Cutting Our Build Times by 70% Without Buying Anything',
    abstract: [
      'No new vendor, no new cluster. Caching we already had, a dependency graph we had never looked at, and one very embarrassing Dockerfile.',
    ],
    outline:
      'Where the time went (7m) - three fixes (10m) - the embarrassing one (3m)',
    speakers: ['12'],
    topics: ['devex'],
    format: 'presentation_20',
    level: 'beginner',
    status: 'submitted',
    audiences: ['developer', 'devopsEngineer'],
  },
  {
    key: 's3',
    title: 'Zero-Downtime Postgres on Kubernetes: A Field Report',
    abstract: [
      'Running a primary database on Kubernetes still makes people wince. Two years, four major version upgrades and one genuinely bad afternoon later, here is what held.',
    ],
    outline:
      'Why we did it (7m) - the operator and the storage layer (13m) - four upgrades (12m) - the bad afternoon (8m)',
    speakers: ['06'],
    topics: ['kubernetes'],
    format: 'presentation_40',
    level: 'advanced',
    status: 'submitted',
    audiences: ['operator', 'architect', 'dataEngineer'],
  },
  {
    key: 's4',
    title: 'Hands-On: Policy as Code From Scratch',
    abstract: [
      'Write your first admission policy, break a deployment with it on purpose, then make it good enough to run in production. Bring a laptop; a cluster is provided.',
    ],
    outline:
      'Setup (15m) - your first policy (30m) - breaking things deliberately (30m) - testing policies (30m) - rollout strategy (15m)',
    speakers: ['04'],
    topics: ['security', 'kubernetes'],
    format: 'workshop_120',
    level: 'beginner',
    status: 'submitted',
    audiences: ['securityEngineer', 'devopsEngineer', 'operator'],
    capacity: 30,
    prerequisites:
      'A laptop with kubectl installed. No prior policy-language experience needed; a scratch cluster is provided.',
  },
  {
    key: 's5',
    title: 'Five Ways Our SLOs Misled Us',
    abstract: [
      'A lightning tour of five service level objectives that were technically green while our users were having a bad time.',
    ],
    outline: 'Five short stories, two minutes each.',
    speakers: ['07'],
    topics: ['observability'],
    format: 'lightning_10',
    level: 'intermediate',
    status: 'submitted',
    audiences: ['operator', 'manager', 'devopsEngineer'],
  },
]

const ALL_TALKS = [...CONFIRMED_TALKS, ...SUBMITTED_TALKS]
const talkId = (key: string) => `${ID_PREFIX}talk.${key}`

const talks: Doc[] = ALL_TALKS.map((t) => ({
  _id: talkId(t.key),
  _type: 'talk',
  title: t.title,
  description: pt(...t.abstract),
  outline: t.outline,
  language: 'english',
  format: t.format,
  level: t.level,
  audiences: t.audiences,
  status: t.status,
  tos: true,
  conference: ref(CONFERENCE_ID),
  speakers: t.speakers.map((k, i) => keyedRef(speakerId(k), `sp${i}`)),
  topics: t.topics.map((k, i) => keyedRef(topicId(k), `tp${i}`)),
  ...(t.capacity ? { capacity: t.capacity } : {}),
  ...(t.prerequisites ? { prerequisites: t.prerequisites } : {}),
}))

/**
 * Reviews sit on the five OPEN submissions — that is the surface a prospect is
 * being shown (a live CFP with a committee working through it), and it keeps
 * the demo's review data away from the already-decided programme.
 */
const REVIEWS: Array<{
  talk: string
  reviewer: string
  content: number
  relevance: number
  speaker: number
  comment: string
}> = [
  {
    talk: 's1',
    reviewer: 'chair',
    content: 8,
    relevance: 9,
    speaker: 8,
    comment:
      'Strong fit for the Kubernetes track. The "two we deleted" section is what makes this more than a tutorial — I would ask the speaker to give it more room.',
  },
  {
    talk: 's1',
    reviewer: 'review-1',
    content: 7,
    relevance: 9,
    speaker: 9,
    comment:
      'Experienced speaker, clear outline. Slight overlap with the confirmed kubelet talk; worth checking with both before scheduling them adjacently.',
  },
  {
    talk: 's2',
    reviewer: 'review-2',
    content: 7,
    relevance: 7,
    speaker: 7,
    comment:
      'Useful and concrete, if a well-trodden topic. The no-new-vendor framing is the differentiator and should be in the title, not just the abstract.',
  },
  {
    talk: 's2',
    reviewer: 'chair',
    content: 6,
    relevance: 8,
    speaker: 8,
    comment:
      'Good lightning-adjacent content at 20 minutes. Would accept if we need another beginner slot in the DevEx track.',
  },
  {
    talk: 's3',
    reviewer: 'review-1',
    content: 9,
    relevance: 8,
    speaker: 8,
    comment:
      'The best submission in this batch. Two years of operational evidence and a named failure rather than a vendor pitch. Strong accept.',
  },
  {
    talk: 's3',
    reviewer: 'chair',
    content: 9,
    relevance: 7,
    speaker: 8,
    comment:
      'Agreed, strong accept. Only reservation is that stateful workloads are a narrow slice of our audience — but the narrow slice cares a great deal.',
  },
  {
    talk: 's4',
    reviewer: 'review-2',
    content: 8,
    relevance: 8,
    speaker: 7,
    comment:
      'Well-structured workshop with a realistic time budget. Capacity of 30 looks right for the room we have. Needs the cluster provisioning confirmed before we accept.',
  },
  {
    talk: 's4',
    reviewer: 'review-1',
    content: 7,
    relevance: 9,
    speaker: 8,
    comment:
      'Policy as code is the most requested topic in last year’s feedback. Deliberately breaking a deployment is a good instinct for a hands-on session.',
  },
  {
    talk: 's5',
    reviewer: 'chair',
    content: 6,
    relevance: 8,
    speaker: 7,
    comment:
      'Fine lightning talk. Five stories in ten minutes is ambitious — suggest cutting to three if accepted.',
  },
  {
    talk: 's5',
    reviewer: 'review-2',
    content: 7,
    relevance: 7,
    speaker: 8,
    comment:
      'Same speaker as a confirmed 20-minute talk. Accepting both is fine by our rules but worth a conscious decision rather than a default.',
  },
]

const reviews: Doc[] = REVIEWS.map((r) => ({
  _id: `${ID_PREFIX}review.${r.talk}.${r.reviewer}`,
  _type: 'review',
  reviewer: ref(speakerId(r.reviewer)),
  proposal: ref(talkId(r.talk)),
  conference: ref(CONFERENCE_ID),
  comment: r.comment,
  score: { content: r.content, relevance: r.relevance, speaker: r.speaker },
}))

const TIERS = [
  {
    key: 'platinum',
    title: 'Platinum',
    tagline:
      'For organisations that want their name on the day itself. Two available, and both come with a seat at the programme table.',
    amount: 120000,
    maxQuantity: 2,
    mostPopular: false,
    perks: [
      ['Tickets', '8 conference tickets'],
      ['Exhibition', 'Large stand in the main hall'],
      ['Marketing', 'Logo on stage backdrop and all printed materials'],
      ['Speaking', 'A five-minute welcome from the main stage'],
    ],
  },
  {
    key: 'gold',
    title: 'Gold',
    tagline:
      'The standard package. A stand, a good number of tickets, and your logo everywhere it matters.',
    amount: 60000,
    maxQuantity: 6,
    mostPopular: true,
    perks: [
      ['Tickets', '4 conference tickets'],
      ['Exhibition', 'Standard stand in the exhibition area'],
      ['Marketing', 'Logo on the website and printed programme'],
    ],
  },
  {
    key: 'community',
    title: 'Community',
    tagline:
      'For user groups, non-profits and small companies who want to support the event without a stand.',
    amount: 20000,
    maxQuantity: 10,
    mostPopular: false,
    perks: [
      ['Tickets', '2 conference tickets'],
      ['Marketing', 'Logo on the website'],
    ],
  },
]

const tierId = (key: string) => `${ID_PREFIX}tier.${key}`

const sponsorTiers: Doc[] = TIERS.map((t) => ({
  _id: tierId(t.key),
  _type: 'sponsorTier',
  title: t.title,
  tagline: t.tagline,
  tierType: 'standard',
  price: [{ _key: 'price-nok', amount: t.amount, currency: 'NOK' }],
  perks: t.perks.map(([label, description], i) => ({
    _key: `perk-${i}`,
    label,
    description,
  })),
  maxQuantity: t.maxQuantity,
  mostPopular: t.mostPopular,
  soldOut: false,
  conference: ref(CONFERENCE_ID),
}))

const SPONSORS = [
  { key: 'nordvind', name: 'Nordvind Systems', tier: 'platinum' },
  { key: 'kestrel', name: 'Kestrel Cloud', tier: 'platinum' },
  { key: 'fjordline', name: 'Fjordline Data', tier: 'gold' },
  { key: 'bramble', name: 'Bramble Labs', tier: 'gold' },
  { key: 'ostrea', name: 'Ostrea Payments', tier: 'gold' },
  { key: 'tindra', name: 'Tindra Retail', tier: 'community' },
]

const sponsorId = (key: string) => `${ID_PREFIX}sponsor.${key}`

const sponsors: Doc[] = SPONSORS.map((s) => ({
  _id: sponsorId(s.key),
  _type: 'sponsor',
  name: s.name,
  website: `https://example.com/${s.key}`,
  logo: wordmark(s.name),
  organization: ref(ORG_ID),
}))

/**
 * Contracts are seeded as SIGNED on purpose: `contract-reminders` is a GLOBAL
 * unscoped cron sweep that sends real email for unsigned contracts, so an
 * unsigned demo contract would generate outbound mail (platform#47).
 */
const sponsorLinks: Doc[] = SPONSORS.map((s) => {
  const tier = TIERS.find((t) => t.key === s.tier)!
  return {
    _id: `${ID_PREFIX}sponsorForConference.${s.key}`,
    _type: 'sponsorForConference',
    sponsor: ref(sponsorId(s.key)),
    conference: ref(CONFERENCE_ID),
    tier: ref(tierId(s.tier)),
    status: 'closed-won',
    contractStatus: 'contract-signed',
    signatureStatus: 'signed',
    contractValue: tier.amount,
    contractCurrency: 'NOK',
    contractSignedAt: '2026-06-18T09:00:00.000Z',
    invoiceStatus: 'paid',
    tags: ['returning-sponsor'],
  }
})

/** Single-day, two-track schedule. Breaks use `placeholder` slots. */
const schedule: Doc = {
  _id: `${ID_PREFIX}schedule.day1`,
  _type: 'schedule',
  conference: ref(CONFERENCE_ID),
  status: 'official',
  version: 1,
  date: CONF_DATE,
  tracks: [
    {
      _key: 'track-a',
      trackTitle: 'Nordlys Hall',
      trackDescription:
        'Platform engineering, delivery and developer experience.',
      talks: [
        {
          _key: 'a-open',
          placeholder: 'Registration & coffee',
          startTime: '08:30',
          endTime: '09:30',
        },
        {
          _key: 'a-1',
          talk: ref(talkId('a1')),
          startTime: '09:30',
          endTime: '10:10',
        },
        {
          _key: 'a-2',
          talk: ref(talkId('a2')),
          startTime: '10:20',
          endTime: '10:40',
        },
        {
          _key: 'a-3',
          talk: ref(talkId('a3')),
          startTime: '10:50',
          endTime: '11:30',
        },
        {
          _key: 'a-lunch',
          placeholder: 'Lunch',
          startTime: '11:30',
          endTime: '12:30',
        },
        {
          _key: 'a-4',
          talk: ref(talkId('a4')),
          startTime: '12:30',
          endTime: '13:10',
        },
        {
          _key: 'a-5',
          talk: ref(talkId('a5')),
          startTime: '13:20',
          endTime: '13:40',
        },
        {
          _key: 'a-6',
          talk: ref(talkId('a6')),
          startTime: '13:50',
          endTime: '14:30',
        },
        {
          _key: 'a-close',
          placeholder: 'Closing remarks & mingle',
          startTime: '14:40',
          endTime: '16:00',
        },
      ],
    },
    {
      _key: 'track-b',
      trackTitle: 'Fjordsalen',
      trackDescription: 'Runtime, observability and security.',
      talks: [
        {
          _key: 'b-open',
          placeholder: 'Registration & coffee',
          startTime: '08:30',
          endTime: '09:30',
        },
        {
          _key: 'b-1',
          talk: ref(talkId('b1')),
          startTime: '09:30',
          endTime: '10:10',
        },
        {
          _key: 'b-2',
          talk: ref(talkId('b2')),
          startTime: '10:20',
          endTime: '10:40',
        },
        {
          _key: 'b-3',
          talk: ref(talkId('b3')),
          startTime: '10:50',
          endTime: '11:30',
        },
        {
          _key: 'b-lunch',
          placeholder: 'Lunch',
          startTime: '11:30',
          endTime: '12:30',
        },
        {
          _key: 'b-4',
          talk: ref(talkId('b4')),
          startTime: '12:30',
          endTime: '13:10',
        },
        {
          _key: 'b-5',
          talk: ref(talkId('b5')),
          startTime: '13:20',
          endTime: '13:40',
        },
        {
          _key: 'b-6',
          talk: ref(talkId('b6')),
          startTime: '13:50',
          endTime: '14:30',
        },
        {
          _key: 'b-close',
          placeholder: 'Closing remarks & mingle',
          startTime: '14:40',
          endTime: '16:00',
        },
      ],
    },
  ],
}

/**
 * The platform mints a PAIR of hosts per tenant (`derivePlatformHosts`):
 * the bare org host and a dated one. `domains[0]` is treated as canonical.
 */
const DEMO_DOMAINS = ['kontainerkonf.konf.run', 'kontainerkonf-2026.konf.run']

const FEATURED_SPEAKER_KEYS = ['09', '04', '02', '08', '10', '11']
const FEATURED_TALK_KEYS = ['a1', 'b1', 'b3', 'a4']

/** Fields shared by both conference passes (see the two-pass note in `run`). */
const conferenceBase = {
  _id: CONFERENCE_ID,
  _type: 'conference',
  title: 'KontainerKonf 2026',
  organization: ref(ORG_ID),
  organizer: 'KontainerKonf Collective',
  city: 'Oslo',
  country: 'Norway',
  venueName: 'Nordlys Konferansesenter',
  venueAddress: 'Kaigata 12, 0150 Oslo',
  tagline: 'Containers, close to the metal.',
  description:
    'A one-day, community-run conference for the people who operate cloud native systems rather than sell them. Two tracks, no keynote sponsorships, and a programme chosen by a committee that publishes its reasoning.',
  // UNLISTED: excluded fail-closed from sitemap, robots and search indexing,
  // while remaining reachable by direct link. Do not flip this to 'live'.
  visibility: 'unlisted',
  startDate: CONF_DATE,
  endDate: CONF_DATE,
  cfpStartDate: '2026-02-02',
  cfpEndDate: '2026-09-25',
  cfpNotifyDate: '2026-07-01',
  programDate: PROGRAM_DATE,
  contactEmail: 'hello@kontainerkonf.example',
  cfpEmail: 'cfp@kontainerkonf.example',
  sponsorEmail: 'sponsors@kontainerkonf.example',
  formats: [
    'lightning_10',
    'presentation_20',
    'presentation_40',
    'workshop_120',
  ],
  topics: TOPICS.map((t, i) => keyedRef(topicId(t.key), `tp${i}`)),
  organizers: ORGANIZER_SPEAKERS.map((s, i) =>
    keyedRef(speakerId(s.key), `og${i}`),
  ),
  domains: DEMO_DOMAINS,
  theme: { primaryColor: '#0F766E', accentColor: '#F97316' },
  cfpSubmissionGoal: 60,
  cfpLightningGoal: 10,
  cfpPresentationGoal: 45,
  cfpWorkshopGoal: 5,
  sponsorRevenueGoal: 400000,
  registrationEnabled: false,
  // Deliberately UNSET, so every outbound side-effect fails closed:
  // ticketingProvider / checkin* / tito*, salesNotificationChannel,
  // cfpNotificationChannel, analyticsPirschCode.
} satisfies Doc

const conferenceFull: Doc = {
  ...conferenceBase,
  featuredSpeakers: FEATURED_SPEAKER_KEYS.map((k, i) =>
    keyedRef(speakerId(k), `fs${i}`),
  ),
  featuredTalks: FEATURED_TALK_KEYS.map((k, i) =>
    keyedRef(talkId(k), `ft${i}`),
  ),
  schedules: [keyedRef(schedule._id, 'sc0')],
}

/** Platform default budget seed, with the sponsor tiers swapped for this demo's. */
const budget: Doc = {
  _id: BUDGET_ID,
  ...defaultBudgetSeed(),
  conference: ref(CONFERENCE_ID),
  sponsorTierAssumptions: TIERS.map((t) => ({
    _key: t.key,
    name: t.title,
    priceExVat: Math.round(t.amount / 1.25),
    includedTickets: t.key === 'platinum' ? 8 : t.key === 'gold' ? 4 : 2,
  })),
  scenarios: defaultBudgetSeed().scenarios?.map((s) => ({
    ...s,
    tierCounts: [
      { _key: 'tier-platinum', tier: 'platinum', count: 2 },
      {
        _key: 'tier-gold',
        tier: 'gold',
        count: s._key === 'conservative' ? 3 : 5,
      },
      {
        _key: 'tier-community',
        tier: 'community',
        count: s._key === 'optimistic' ? 8 : 5,
      },
    ],
  })),
} as Doc

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

type Phase = { name: string; docs: Doc[]; verify: string }

const phases: Phase[] = [
  {
    name: '1. organization',
    docs: [organization],
    verify: `count(*[_id == "${ORG_ID}"])`,
  },
  {
    name: '2. topics',
    docs: topics,
    verify: `count(*[_type == "topic" && organization._ref == "${ORG_ID}"])`,
  },
  {
    name: '3. speakers',
    docs: speakers,
    verify: `count(*[_type == "speaker" && "${ORG_ID}" in organizations[]._ref])`,
  },
  {
    name: '4. conference (base, no back-references)',
    docs: [conferenceBase as Doc],
    verify: `count(*[_id == "${CONFERENCE_ID}"])`,
  },
  {
    name: '5. talks',
    docs: talks,
    verify: `count(*[_type == "talk" && conference._ref == "${CONFERENCE_ID}"])`,
  },
  {
    name: '6. reviews',
    docs: reviews,
    verify: `count(*[_type == "review" && conference._ref == "${CONFERENCE_ID}"])`,
  },
  {
    name: '7. sponsor tiers',
    docs: sponsorTiers,
    verify: `count(*[_type == "sponsorTier" && conference._ref == "${CONFERENCE_ID}"])`,
  },
  {
    name: '8. sponsors',
    docs: sponsors,
    verify: `count(*[_type == "sponsor" && organization._ref == "${ORG_ID}"])`,
  },
  {
    name: '9. sponsor/conference links',
    docs: sponsorLinks,
    verify: `count(*[_type == "sponsorForConference" && conference._ref == "${CONFERENCE_ID}"])`,
  },
  {
    name: '10. schedule',
    docs: [schedule],
    verify: `count(*[_type == "schedule" && conference._ref == "${CONFERENCE_ID}"])`,
  },
  {
    name: '11. conference (full: featured + schedule refs)',
    docs: [conferenceFull],
    verify: `count(*[_id == "${CONFERENCE_ID}" && count(schedules) > 0 && count(featuredSpeakers) > 0])`,
  },
  {
    name: '12. budget',
    docs: [budget],
    verify: `count(*[_type == "conferenceBudget" && conference._ref == "${CONFERENCE_ID}"])`,
  },
]

const ALL_DOCS = phases.flatMap((p) => p.docs)
/** Distinct documents this seed owns (the conference is written twice — see `run`). */
const UNIQUE_IDS = [...new Set(ALL_DOCS.map((d) => d._id))]

// ---------------------------------------------------------------------------
// Safety checks
// ---------------------------------------------------------------------------

function assertNamespacedIds(): void {
  const bad = ALL_DOCS.map((d) => d._id).filter(
    (id) => !id.startsWith(ID_PREFIX) && id !== BUDGET_ID,
  )
  if (bad.length > 0) {
    throw new Error(
      `REFUSING TO RUN: ${bad.length} document id(s) outside the "${ID_PREFIX}" namespace: ${bad.join(', ')}`,
    )
  }
  // The conference is deliberately written twice (base, then full once the
  // documents it back-references exist). Every OTHER id must appear once.
  const counts = new Map<string, number>()
  for (const d of ALL_DOCS) counts.set(d._id, (counts.get(d._id) ?? 0) + 1)
  const dupes = [...counts.entries()].filter(
    ([id, n]) => n > 1 && !(id === CONFERENCE_ID && n === 2),
  )
  if (dupes.length > 0) {
    throw new Error(
      `REFUSING TO RUN: duplicate document id(s): ${dupes.map(([id, n]) => `${id} x${n}`).join(', ')}`,
    )
  }
  if (
    organization.slug &&
    (organization.slug as { current: string }).current !== REQUIRED_ORG_SLUG
  ) {
    throw new Error(
      `REFUSING TO RUN: organization slug must be "${REQUIRED_ORG_SLUG}"`,
    )
  }
}

const CENSUS = `{
  "organizations": count(*[_type == "organization"]),
  "conferences": count(*[_type == "conference"]),
  "speakers": count(*[_type == "speaker"]),
  "total": count(*),
  "demoDocs": count(*[_id in path("${ID_PREFIX}**")]) + count(*[_id == "${BUDGET_ID}"]),
  "conferenceIds": *[_type == "conference"]._id,
  "organizationIds": *[_type == "organization"]._id
}`

type Census = {
  organizations: number
  conferences: number
  speakers: number
  total: number
  demoDocs: number
  conferenceIds: string[]
  organizationIds: string[]
}

/**
 * Refuse to run if any id we are about to write is already occupied by a
 * document of a DIFFERENT `_type` — i.e. something we did not author.
 */
async function assertTargetsAreOursOrAbsent(): Promise<void> {
  const ids = UNIQUE_IDS
  const existing = await client.fetch<Array<{ _id: string; _type: string }>>(
    '*[_id in $ids]{_id, _type}',
    { ids },
  )
  const expected = new Map(ALL_DOCS.map((d) => [d._id, d._type]))
  const conflicts = existing.filter((e) => expected.get(e._id) !== e._type)
  if (conflicts.length > 0) {
    throw new Error(
      `REFUSING TO RUN: ${conflicts.length} target id(s) already hold a document of an unexpected type: ` +
        conflicts.map((c) => `${c._id} (${c._type})`).join(', '),
    )
  }

  const org = await client.fetch<{ slug?: { current?: string } } | null>(
    '*[_id == $id][0]{slug}',
    { id: ORG_ID },
  )
  if (org && org.slug?.current !== REQUIRED_ORG_SLUG) {
    throw new Error(
      `REFUSING TO RUN: ${ORG_ID} exists with slug "${org.slug?.current}", expected "${REQUIRED_ORG_SLUG}"`,
    )
  }
  console.log(
    existing.length === 0
      ? '  pre-flight: no demo documents exist yet (first run)'
      : `  pre-flight: ${existing.length}/${ids.length} demo documents already exist and match on _type (re-run)`,
  )
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const { projectId, dataset } = client.config()
  console.log('='.repeat(78))
  console.log('KontainerKonf demo seed')
  console.log(`  project : ${projectId}`)
  console.log(`  dataset : ${dataset}`)
  console.log(
    `  mode    : ${WRITE ? 'WRITE (production mutation)' : 'DRY RUN (no writes)'}`,
  )
  console.log(`  documents planned: ${UNIQUE_IDS.length}`)
  console.log('='.repeat(78))

  assertNamespacedIds()

  if (!client.config().token) {
    throw new Error(
      'No Sanity token. Run through: npx sanity exec scripts/seed-kontainerkonf-demo.ts --with-user-token [-- --write]',
    )
  }

  const before = await client.fetch<Census>(CENSUS)
  console.log('\nCENSUS BEFORE')
  console.log(
    `  organizations=${before.organizations} conferences=${before.conferences} speakers=${before.speakers} total=${before.total} demoDocs=${before.demoDocs}`,
  )

  await assertTargetsAreOursOrAbsent()

  console.log('\nPLAN')
  for (const phase of phases) {
    console.log(`  ${phase.name}: ${phase.docs.length} document(s)`)
    for (const d of phase.docs) {
      console.log(`      ${d._id} (${d._type})`)
    }
  }

  if (!WRITE) {
    console.log(
      '\nDRY RUN — nothing written. Re-run with `-- --write` to apply.',
    )
    if (args.includes('--json')) {
      console.log('\nFULL DOCUMENT PLAN (JSON):')
      console.log(JSON.stringify(ALL_DOCS, null, 2))
    } else {
      console.log('Pass `--json` as well to dump every document body.')
    }
    return
  }

  console.log('\nWRITING')
  for (const phase of phases) {
    const tx = client.transaction()
    for (const d of phase.docs) tx.createOrReplace(d)
    await tx.commit({ visibility: 'sync' })
    const observed = await client.fetch<number>(phase.verify)
    console.log(
      `  ${phase.name}: wrote ${phase.docs.length}, verified -> ${observed}`,
    )
    if (observed < phase.docs.length) {
      throw new Error(
        `STOPPING: phase "${phase.name}" verification returned ${observed}, expected at least ${phase.docs.length}`,
      )
    }
  }

  if (EXTRA_ORGANIZER_ID) {
    const target = await client.fetch<{ _id: string; name?: string } | null>(
      '*[_id == $id && _type == "speaker"][0]{_id, name}',
      { id: EXTRA_ORGANIZER_ID },
    )
    if (!target) {
      throw new Error(
        `--organizer: no speaker document with id ${EXTRA_ORGANIZER_ID}`,
      )
    }
    await client
      .patch(CONFERENCE_ID)
      .setIfMissing({ organizers: [] })
      .insert('after', 'organizers[-1]', [
        keyedRef(target._id, `og-real-${target._id.slice(0, 8)}`),
      ])
      .commit({ visibility: 'sync' })
    console.log(
      `  added organizer ${target.name ?? target._id} to the demo conference`,
    )
  }

  const after = await client.fetch<Census>(CENSUS)
  console.log('\nCENSUS AFTER')
  console.log(
    `  organizations=${after.organizations} (+${after.organizations - before.organizations})` +
      ` conferences=${after.conferences} (+${after.conferences - before.conferences})` +
      ` speakers=${after.speakers} (+${after.speakers - before.speakers})` +
      ` total=${after.total} (+${after.total - before.total})` +
      ` demoDocs=${after.demoDocs}`,
  )

  const lostConferences = before.conferenceIds.filter(
    (id) => !after.conferenceIds.includes(id),
  )
  const lostOrganizations = before.organizationIds.filter(
    (id) => !after.organizationIds.includes(id),
  )
  if (lostConferences.length > 0 || lostOrganizations.length > 0) {
    throw new Error(
      `INTEGRITY FAILURE: pre-existing documents disappeared. conferences=${lostConferences.join(',')} organizations=${lostOrganizations.join(',')}`,
    )
  }
  console.log(
    `  integrity: all ${before.conferenceIds.length} pre-existing conference ids and ${before.organizationIds.length} organization id(s) still present`,
  )

  console.log(`\nDone. Demo site: https://${DEMO_DOMAINS[0]}/`)
}

run().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
})
