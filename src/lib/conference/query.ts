/**
 * THE CONFERENCE GROQ — two fixed query strings, and nothing else.
 *
 * Deliberately free of any `next/*` import so the queries can be read by tests,
 * scripts and one-off differential checks without dragging the Next request
 * runtime (`next/cache`, `next/headers`) into the graph. `./sanity.ts` owns the
 * fetching and the caching; this module owns only the text.
 */

import { EXPANDED_SECTIONS_KEY } from './sections'

/*
 * ---------------------------------------------------------------------------
 * THE TIERED CONFERENCE QUERY
 *
 * Two query strings, fixed at module load. Nothing a caller passes can change
 * them, which is the whole point: `fetchConferenceData`'s `'use cache'` key
 * includes the query text, so a query built per call fragments the cache. The
 * flags now choose only which SECTIONS of the one cached result are handed back
 * (see ./sections.ts) — they no longer choose what is fetched.
 *
 * WHY TWO TIERS AND NOT ONE. Measured against the production dataset (compact
 * JSON bytes of the real response, three live tenants):
 *
 *   tenant                     bare doc   + core sections   + schedules
 *   2026.cloudnativedays.no     593 KiB     644 KiB           744 KiB
 *   2025.cloudnativebergen.dev   32 KiB      73 KiB           185 KiB
 *   kontainerkonf.konf.run      2.7 KiB      21 KiB            36 KiB
 *
 * The schedule tree is the single heaviest section — on a conference with a
 * finished program it is larger than the rest of the document put together
 * (2025: 112 KiB of a 185 KiB total) — and only SIX of the ~153 call sites ask
 * for it (`/`, `/program`, `/info`, `/stream/[room]`, the admin schedule editor
 * and the composer preview). The read that serves the other ~96%, including
 * `resolveConferenceId()` on every tRPC call and the `(main)` layout on every
 * public page render, must not be made 2.5x heavier to carry it. So `core`
 * stops short of the schedule and `full` adds it.
 *
 * Going further — a third, bare tier — was measured and rejected: the core
 * sections add only 18-51 KiB over the bare document, which does not pay for
 * another cache entry per domain per region.
 *
 * NOTE ON `^` INSIDE `"__expanded": { ... }`. An object-literal projection adds
 * NO parent-scope level in GROQ, so every subquery below keeps the exact `^`
 * depth it had at the top level (verified against the production dataset:
 * `^._id` inside the object resolves the conference, `^.^._id` silently matches
 * nothing). Getting this wrong does not error — it returns empty arrays.
 * ---------------------------------------------------------------------------
 */

const EXPANDED_ORGANIZERS = `organizers[]->{
      ...,
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL)
      }`

// groq-global-scoped: the nested `*[_type == "talk"]` root below is bounded to
// this tenant by `conference._ref == ^.^._id`, where `^.^` is the conference
// document the enclosing `$domain`-filtered root already resolved. It can only
// ever return talks belonging to that one conference.
const EXPANDED_FEATURED_SPEAKERS = `featuredSpeakers[]->{
      ...,
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL),
      "talks": *[_type == "talk" && references(^._id) && conference._ref == ^.^._id && status == "confirmed"]{
      _id,
      title,
      description,
      format,
      status
      }
      }`

const EXPANDED_FEATURED_TALKS = `featuredTalks[]->{
      _id,
      title,
      description,
      format,
      level,
      status,
      audiences,
      topics[]-> {
        _id,
        title,
        color,
        slug,
        description
      },
      speakers[]->{
        _id,
        name,
        "slug": slug.current,
        title,
        "image": coalesce(image.asset->url, imageURL)
      }
      }`

// groq-global-scoped: bounded to this tenant by `conference._ref == ^._id` —
// `^` is the conference resolved by the `$domain`-filtered root this fragment is
// interpolated into. (Verified against the production dataset that an
// object-literal projection adds no `^` level, so this stays `^`, not `^.^`.)
const EXPANDED_SPONSOR_TIERS = `*[_type == "sponsorTier" && conference._ref == ^._id] | order(tierType asc, title asc, price[0].amount desc){
      _id,
      _createdAt,
      _updatedAt,
      title,
      tagline,
      tierType,
      price[]{
        _key,
        amount,
        currency
      },
      perks[]{
        _key,
        label,
        description
      },
      soldOut,
      mostPopular,
      maxQuantity,
      ticketEntitlement
      }`

const EXPANDED_TOPICS = `topics[]->{
      _id,
      title,
      description,
      color,
      "slug": slug.current
      }`

/**
 * EVERY slot, unfiltered. The `[!defined(talk) || talk->status == "confirmed"]`
 * filter that used to sit on `talks` moved to `withConfirmedTalksOnly` in
 * ./sections.ts, because it was the seventh thing forking the query text.
 *
 * Cost of dereferencing the unconfirmed slots too, measured on the production
 * dataset: 686 -> 693 KiB on the 2026 edition (+1%), and byte-identical on the
 * other two tenants, whose programs are fully confirmed.
 */
const EXPANDED_SCHEDULES = `schedules[]-> {
      ...,
      _rev,
      tracks[]{
        trackTitle,
        trackDescription,
        talks[]{
        startTime,
        endTime,
        placeholder,
        "hasTalkRef": defined(talk),
        talk->{
          _id,
          title,
          description,
          format,
          level,
          status,
          audiences,
          topics[]-> {
            _id,
            title,
            color,
            slug,
            description
          },
          speakers[]->{
          _id,
          name,
          "slug": slug.current,
          title,
          "image": coalesce(image.asset->url, imageURL)
          }
        }
        }
      }
      } | order(date asc)`

function buildConferenceQuery(withSchedules: boolean): string {
  // groq-global-scoped: THIS read is the tenant resolution itself. It is bounded
  // by `$domain`/`$wildcardSubdomain`, which come from the request Host header
  // and never from the session — see `getConferenceForCurrentDomain`. There is no
  // conference id to scope it to yet; resolving one is what it does.
  return `*[ _type == "conference" && ($domain in domains || $wildcardSubdomain in domains)][0]{
      ...,
      teams[]{
        _key,
        key,
        title,
        slackChannel,
        emailIdentity,
        "members": members[]._ref
      },
      "${EXPANDED_SECTIONS_KEY}": {
        "organizers": ${EXPANDED_ORGANIZERS},
        "featuredSpeakers": ${EXPANDED_FEATURED_SPEAKERS},
        "featuredTalks": ${EXPANDED_FEATURED_TALKS},
        "sponsorTiers": ${EXPANDED_SPONSOR_TIERS},
        "topics": ${EXPANDED_TOPICS}${
          withSchedules ? `,\n        "schedules": ${EXPANDED_SCHEDULES}` : ''
        }
      }
    }`
}

/** Everything except the schedule tree. Serves ~96% of call sites. */
export const CONFERENCE_QUERY_CORE = buildConferenceQuery(false)

/** Core plus the full schedule tree. Serves the six schedule-reading surfaces. */
export const CONFERENCE_QUERY_FULL = buildConferenceQuery(true)
