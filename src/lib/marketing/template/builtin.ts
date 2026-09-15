/**
 * THE BUILT-IN PLAN TEMPLATE (spec §5, transcribed from
 * `docs/research/conference-marketing-playbook.md` §5 on branch
 * `research/conference-marketing-playbook`, which stays the source of record
 * for offsets, skeletons and benchmarks).
 *
 * Ten Campaigns in edition order. Offsets are whole days against a Milestone
 * (`−7 × weeks`). Every beat that goes out on both Channels is TWO sibling
 * recipes with their own copy (never one cross-posted Task); every image beat
 * is preceded by a `studioRender` recipe the publishing siblings list as a
 * Prerequisite. Triggers are persisted on the Campaign and run by
 * `../generation.ts`; cadences are expanded by `../expansion.ts` over the
 * subject list they name (the keynote card names none: there is no keynote
 * format to find keynote speakers by, so it is never expanded).
 *
 * Placeholders: see `../placeholders.ts`. Subject placeholders (`{name}`,
 * `{company}`, `{title}`, `{hook}`, `{tier}`) may only appear in recipes with
 * a subject source — `builtin.test.ts` enforces it.
 */

import type { Anchor, CampaignRecipe, PlanTemplate, TaskRecipe } from './types'

export const BUILTIN_TEMPLATE_VERSION = '2026.1'

const wk = (weeks: number) => weeks * 7

const at = (milestone: Anchor['milestone'], offsetDays = 0): Anchor => ({
  milestone,
  offsetDays,
})

interface BeatCopy {
  linkedin?: string
  bluesky?: string
  /** Alt skeleton; its presence means the beat carries an image and gets a render recipe. */
  alt?: string
}

/**
 * One beat: the optional studio render plus one publishing sibling per
 * Channel that has copy. Sibling keys are `<beat>:<channel>`; the render is
 * `<beat>Render` and is every sibling's Prerequisite.
 */
function beat(
  key: string,
  title: string,
  anchor: Anchor | undefined,
  targetPage: string,
  copy: BeatCopy,
  options: {
    subjectSource?: TaskRecipe['subjectSource']
    cadence?: TaskRecipe['cadence']
  } = {},
): TaskRecipe[] {
  const subjectSource = options.subjectSource ?? 'none'
  const recipes: TaskRecipe[] = []
  const prerequisites: string[] = []
  if (copy.alt) {
    const renderKey = `${key}Render`
    prerequisites.push(renderKey)
    recipes.push({
      key: renderKey,
      beat: key,
      title: `Render: ${title}`,
      kind: 'studioRender',
      anchor: anchor && at(anchor.milestone, anchor.offsetDays - 2),
      subjectSource,
      alt: copy.alt,
      cadence: options.cadence,
    })
  }
  for (const channel of ['linkedin', 'bluesky'] as const) {
    const skeleton = copy[channel]
    if (!skeleton) continue
    recipes.push({
      key: `${key}:${channel}`,
      beat: key,
      title,
      kind: 'publishing',
      channel,
      anchor,
      prerequisites,
      targetPage,
      subjectSource,
      skeleton,
      alt: copy.alt,
      cadence: options.cadence,
    })
  }
  return recipes
}

const HOME = '/'
const CFP = '/cfp'
const TICKETS = '/tickets'
const PROGRAM = '/program'
const SPONSOR = '/sponsor'
const INFO = '/info'

const EVENT_LINE = '🗓️ {date} · 📍 {city}'

const campaigns: CampaignRecipe[] = [
  // 1 ---------------------------------------------------------------------
  {
    key: 'saveTheDate',
    title: 'Save the date',
    start: at('CONFERENCE_START', -wk(26)),
    end: at('CONFERENCE_START', -wk(20)),
    primaryOutcome: 'attributedSessions',
    outcomeTargetPage: HOME,
    optional: false,
    triggers: [],
    recipes: [
      ...beat(
        'saveTheDate',
        'Save the date',
        at('CONFERENCE_START', -wk(26)),
        HOME,
        {
          linkedin:
            '{event} is back: {date} at {venue}, {city}.\n\nOne day of talks, hands-on workshops and the people who run cloud native in production. The call for papers and tickets open in the coming weeks.\n\nSave the date → {url}\n\n{eventTag} #CloudNativeCommunity #KubernetesCommunity',
          bluesky:
            '📌 Save the date: {event}.\n\n' +
            EVENT_LINE +
            '\n\nCFP and tickets open soon. {url}\n\n{eventTag}',
          alt: 'Save the date: {event}, {date}, {venue}, {city}.',
        },
      ),
      {
        key: 'blueskySetup',
        beat: 'blueskySetup',
        title: 'Set the Bluesky domain handle and pin the launch post',
        kind: 'checklist',
        channel: 'bluesky',
        anchor: at('CONFERENCE_START', -wk(26)),
        subjectSource: 'none',
        instructions:
          'Verify the conference domain as the Bluesky handle, then pin the save-the-date post to the profile.',
      },
    ],
  },
  // 2 ---------------------------------------------------------------------
  {
    key: 'sponsorAcquisition',
    title: 'Sponsor acquisition',
    start: at('SPONSOR_DEADLINE', -wk(24)),
    end: at('SPONSOR_DEADLINE'),
    primaryOutcome: 'sponsorContactClicks',
    outcomeTargetPage: SPONSOR,
    optional: true,
    triggers: [{ event: 'sponsorSigned', taskRecipeKey: 'sponsorCardRender' }],
    recipes: [
      ...beat(
        'prospectus',
        'Sponsor prospectus published',
        at('SPONSOR_DEADLINE', -wk(24)),
        SPONSOR,
        {
          linkedin:
            'Why sponsor {event}?\n\nYour support funds the venue, the food and the recordings, and puts your team in front of the engineers who choose the tools. The prospectus is out: tiers, what each includes, and what it costs.\n\nProspectus → {url}\n\n{eventTag} #CloudNativeCommunity',
          bluesky:
            '🤝 The {event} sponsor prospectus is out. Every tier funds something concrete.\n\n{url}\n\n{eventTag}',
        },
      ),
      ...beat(
        'sponsorCard',
        'Sponsor thank-you card',
        undefined,
        SPONSOR,
        {
          linkedin:
            'Thank you to {name} for sponsoring {event} as a {tier} sponsor.\n\n{hook}\n\nMeet them at {venue} on {date}.\n\nAll sponsors → {url}\n\n{eventTag}',
          bluesky:
            '🥇 {tier} sponsor: {name}\n\n{hook}\n\nThanks for making {event} happen 💙 {url}',
          alt: 'Sponsor card: {name}, {tier} sponsor of {event}, {date}.',
        },
        { subjectSource: 'sponsor' },
      ),
      {
        key: 'sponsorLastCall:linkedin',
        beat: 'sponsorLastCall',
        title: 'Sponsorship last call',
        kind: 'publishing',
        channel: 'linkedin',
        anchor: at('SPONSOR_DEADLINE', -wk(2)),
        prerequisites: [],
        targetPage: SPONSOR,
        subjectSource: 'none',
        skeleton:
          'Two weeks left to sponsor {event}.\n\nThe remaining tiers close on the sponsor deadline; after that the programme and printed material are locked.\n\nProspectus and contact → {url}\n\n{eventTag}',
      },
    ],
  },
  // 3 ---------------------------------------------------------------------
  {
    key: 'cfp',
    title: 'CFP',
    start: at('CFP_OPEN'),
    end: at('CFP_CLOSE', 1),
    primaryOutcome: 'cfpSubmissions',
    optional: false,
    triggers: [],
    recipes: [
      ...beat('cfpOpen', 'CFP open', at('CFP_OPEN'), CFP, {
        linkedin:
          'The {event} call for papers is open.\n\nWe want talks from people running cloud native in production: the migration that hurt, the incident that taught you something, the platform your team actually uses. First-time speakers are welcome, and we offer mentoring on your abstract.\n\nSubmit → {url}\n\n{eventTag} #CloudNativeCommunity #KubernetesCommunity',
        bluesky:
          '📣 The {event} CFP is open.\n\nProduction stories, incidents, platforms that work. First-timers welcome. {url}\n\n{eventTag}',
        alt: 'Call for papers open: {event}, {date}, {city}.',
      }),
      ...beat(
        'cfpEncourage',
        'You have a talk in you',
        at('CFP_OPEN', wk(1)),
        CFP,
        {
          linkedin:
            'You have a talk in you.\n\nThat migration you are still thinking about. The outage post-mortem your team learned the most from. The tool you replaced and why. Those are the talks {event} wants, and the committee helps first-time speakers shape the abstract.\n\nSubmit → {url}\n\n{eventTag}',
          bluesky:
            'That incident you keep thinking about? That is the talk.\n\nThe {event} CFP is open. {url}\n\n{eventTag}',
        },
      ),
      {
        key: 'cfpReminder4w:bluesky',
        beat: 'cfpReminder4w',
        title: 'CFP reminder (4 weeks)',
        kind: 'publishing',
        channel: 'bluesky',
        anchor: at('CFP_CLOSE', -wk(4)),
        prerequisites: [],
        targetPage: CFP,
        subjectSource: 'none',
        skeleton:
          '⏰ Four weeks left to submit to {event}.\n\nAbstracts, not slides — the committee reads every one. {url}\n\n{eventTag}',
      },
      ...beat(
        'cfpReminder2w',
        'CFP reminder (2 weeks)',
        at('CFP_CLOSE', -wk(2)),
        CFP,
        {
          linkedin:
            'Two weeks left in the {event} call for papers.\n\nIf you have been meaning to submit, this is the moment. Abstracts only; the committee reads every submission and answers every speaker.\n\nSubmit → {url}\n\n{eventTag}',
          bluesky:
            '⏰ Two weeks left: the {event} CFP closes soon.\n\nAbstract, not slides. {url}\n\n{eventTag}',
        },
      ),
      ...beat(
        'cfpReminder1w',
        'CFP reminder (1 week)',
        at('CFP_CLOSE', -wk(1)),
        CFP,
        {
          linkedin:
            'One week left in the {event} call for papers.\n\nSubmit → {url}\n\n{eventTag}',
          bluesky:
            '🚨 One week left in the {event} CFP.\n\n{url}\n\n{eventTag}',
        },
      ),
      ...beat('cfpLastDay', 'CFP last day', at('CFP_CLOSE'), CFP, {
        linkedin:
          'Last day: the {event} call for papers closes tonight.\n\nSubmit → {url}\n\n{eventTag}',
        bluesky:
          '🚨 The {event} CFP closes tonight.\n\nThat talk you have been drafting? Send it. {url}\n\n{eventTag}',
      }),
      {
        key: 'cfpThanks:bluesky',
        beat: 'cfpThanks',
        title: 'CFP closed, thank you',
        kind: 'publishing',
        channel: 'bluesky',
        anchor: at('CFP_CLOSE', 1),
        prerequisites: [],
        targetPage: CFP,
        subjectSource: 'none',
        skeleton:
          'The {event} CFP is closed. Thank you to everyone who submitted; every speaker hears back.\n\n{url}\n\n{eventTag}',
      },
    ],
  },
  // 4 ---------------------------------------------------------------------
  {
    key: 'earlyBird',
    title: 'Tickets open / early bird',
    start: at('TICKETS_OPEN'),
    end: at('EARLY_BIRD_END'),
    primaryOutcome: 'ticketsSoldInWindow',
    target: { shareOfCapacity: 0.15 },
    optional: false,
    triggers: [],
    recipes: [
      ...beat('ticketsOpen', 'Tickets open', at('TICKETS_OPEN'), TICKETS, {
        linkedin:
          'Tickets for {event} are on sale.\n\n{date} at {venue}, {city}: a full day of talks and workshops, lunch included, recordings afterwards. Early-bird pricing runs until the early-bird deadline.\n\nTickets → {url}\n\n{eventTag}',
        bluesky:
          '🎟️ Tickets for {event} are live, early-bird price while it lasts.\n\n{url}\n\n{eventTag}',
        alt: 'Tickets on sale: {event}, {date}, {venue}, {city}.',
      }),
      // Playbook §5 lists this under Save the date; §4 says create it at
      // TICKETS_OPEN so the Event carries the registration link. §4 wins.
      {
        key: 'linkedinEvent',
        beat: 'linkedinEvent',
        title: 'Create the LinkedIn Event',
        kind: 'eventPageUpdate',
        channel: 'linkedin',
        anchor: at('TICKETS_OPEN'),
        subjectSource: 'none',
        instructions:
          'Create a LinkedIn Event with the organization page as organizer and the ticket page as the external registration link. Paste the event URL back here.',
      },
      {
        key: 'earlyBirdReminder2w:bluesky',
        beat: 'earlyBirdReminder2w',
        title: 'Early-bird reminder (2 weeks)',
        kind: 'publishing',
        channel: 'bluesky',
        anchor: at('EARLY_BIRD_END', -wk(2)),
        prerequisites: [],
        targetPage: TICKETS,
        subjectSource: 'none',
        skeleton:
          '🎟️ Two weeks of early-bird pricing left for {event}.\n\n{url}\n\n{eventTag}',
      },
      ...beat(
        'earlyBirdReminder1w',
        'Early-bird reminder (1 week)',
        at('EARLY_BIRD_END', -wk(1)),
        TICKETS,
        {
          linkedin:
            'One week of early-bird pricing left for {event}.\n\nThe ticket includes the full programme, workshops, lunch and the recordings. The price goes up after the early-bird deadline.\n\nTickets → {url}\n\n{eventTag}',
          bluesky:
            '🎟️ One week left at the early-bird price for {event}.\n\n{url}\n\n{eventTag}',
        },
      ),
      ...beat(
        'earlyBirdLastDay',
        'Early-bird last day',
        at('EARLY_BIRD_END'),
        TICKETS,
        {
          linkedin:
            'Early bird for {event} ends today.\n\nSame ticket, lower price, until midnight.\n\nTickets → {url}\n\n{eventTag}',
          bluesky:
            '🐦 Last day for early-bird tickets.\n\n{event} · {date} · {city}\n\n🎟️ {url}',
        },
      ),
    ],
  },
  // 5 ---------------------------------------------------------------------
  {
    key: 'keynotes',
    title: 'Keynotes',
    start: at('SPEAKERS_ANNOUNCED', -wk(4)),
    end: at('SPEAKERS_ANNOUNCED'),
    primaryOutcome: 'attributedSessions',
    outcomeTargetPage: PROGRAM,
    optional: true,
    triggers: [],
    recipes: [
      ...beat(
        'keynoteAnnounce',
        'Keynotes announced',
        at('SPEAKERS_ANNOUNCED', -wk(4)),
        PROGRAM,
        {
          linkedin:
            'The {event} keynotes are confirmed.\n\nTwo talks that frame the day: where cloud native is going and what it costs to get there. Speaker cards follow this week.\n\nProgramme → {url}\n\n{eventTag}',
          bluesky:
            '🎙️ Keynotes for {event} are confirmed.\n\nCards coming this week. {url}\n\n{eventTag}',
          alt: 'Keynotes announced: {event}, {date}.',
        },
      ),
      ...beat(
        'keynoteCard',
        'Keynote speaker card',
        undefined,
        PROGRAM,
        {
          linkedin:
            '{name} is keynoting {event}.\n\n{hook}\n\n🎙️ "{title}"\n🗓️ {date} · 📍 {venue}\n\nFull programme → {url}\n\n{eventTag}',
          bluesky:
            '🎙️ Keynote: {name} ({company}) at {event}.\n\n"{title}" — {hook}\n\n' +
            EVENT_LINE +
            '\n{url}',
          alt: 'Keynote card: {name}, {company}. Talk: "{title}". {event}, {date}.',
        },
        {
          subjectSource: 'speaker',
          cadence: {
            from: at('SPEAKERS_ANNOUNCED', -wk(4)),
            to: at('SPEAKERS_ANNOUNCED'),
            perWeek: { linkedin: 1, bluesky: 1 },
          },
        },
      ),
    ],
  },
  // 6 ---------------------------------------------------------------------
  {
    key: 'speakers',
    title: 'Speakers',
    start: at('CFP_NOTIFY'),
    end: at('CONFERENCE_START', -wk(1)),
    primaryOutcome: 'attributedSessions',
    outcomeTargetPage: PROGRAM,
    optional: false,
    triggers: [
      { event: 'speakerConfirmed', taskRecipeKey: 'speakerCardRender' },
    ],
    recipes: [
      {
        key: 'speakerKit',
        beat: 'speakerKit',
        title: 'Acceptance-letter social kit',
        kind: 'checklist',
        anchor: at('CFP_NOTIFY'),
        subjectSource: 'none',
        instructions:
          'Put the "please share" copy and a link to each speaker card into the acceptance letter, so speakers can post on the day they accept.',
      },
      ...beat(
        'firstBatch',
        'First speaker batch',
        at('CFP_NOTIFY', wk(1)),
        PROGRAM,
        {
          linkedin:
            'The {event} lineup is taking shape.\n\nThe first confirmed speakers cover platform engineering, security, observability and the operational stories in between. More follow every week until the full programme is out.\n\nSpeakers so far → {url}\n\n{eventTag}',
          bluesky:
            '🎙️ First speakers confirmed for {event}.\n\nMore every week. {url}\n\n{eventTag}',
          alt: 'First confirmed speakers at {event}, {date}, {city}.',
        },
      ),
      ...beat(
        'speakerCard',
        'Speaker card',
        undefined,
        PROGRAM,
        {
          linkedin:
            '{name} is bringing {hook} to {event}.\n\n🎙️ "{title}"\n🗓️ {date} · 📍 {venue}\n\nFull programme → {url}\n\n{eventTag}',
          bluesky:
            '🎙️ {name} ({company}) is speaking at {event}.\n\n"{title}" — {hook}\n\n' +
            EVENT_LINE +
            '\n{url}\n\n{eventTag}',
          alt: 'Speaker card: {name}, {company}. Talk: "{title}". {event}, {date}.',
        },
        {
          subjectSource: 'speaker',
          cadence: {
            from: at('CFP_NOTIFY', wk(1)),
            to: at('CONFERENCE_START', -wk(1)),
            perWeek: { linkedin: 2, bluesky: 3 },
            subjects: 'confirmedSpeakers',
          },
        },
      ),
    ],
  },
  // 7 ---------------------------------------------------------------------
  {
    key: 'programme',
    title: 'Programme launch',
    start: at('PROGRAM_PUBLISHED'),
    end: at('PROGRAM_PUBLISHED', wk(2)),
    primaryOutcome: 'attributedSessions',
    outcomeTargetPage: PROGRAM,
    optional: false,
    triggers: [],
    recipes: [
      ...beat(
        'scheduleLive',
        'The schedule is live',
        at('PROGRAM_PUBLISHED'),
        PROGRAM,
        {
          linkedin:
            'The {event} programme is live.\n\nEvery talk and workshop, with times and rooms, on one page. Build your day and share it with the colleague who should come with you.\n\nProgramme → {url}\n\n{eventTag} #CloudNativeCommunity #KubernetesCommunity',
          bluesky:
            '📋 The {event} programme is live.\n\nEvery talk, every workshop, one page. {url}\n\n{eventTag}',
          alt: 'Programme published: {event}, {date}, {city}.',
        },
      ),
      ...beat(
        'cncfAmplify',
        'Vendor-neutral post for CNCF amplification',
        at('PROGRAM_PUBLISHED', 1),
        PROGRAM,
        {
          linkedin:
            '{event}, {date}, {city}: a community-run day of cloud native talks and workshops.\n\nThe programme is out; tickets are open. If you work with Kubernetes or the projects around it, this is the local room to be in.\n\nProgramme → {url}\n\n#CloudNativeCommunity #KubernetesCommunity {eventTag}',
          bluesky:
            '{event}, {city}: community-run, one day, cloud native talks and workshops.\n\n{url}\n\n#CloudNativeCommunity',
        },
      ),
      {
        key: 'starterPack',
        beat: 'starterPack',
        title: 'Publish a Bluesky starter pack of speakers and organizers',
        kind: 'checklist',
        channel: 'bluesky',
        anchor: at('PROGRAM_PUBLISHED', 2),
        subjectSource: 'none',
        instructions:
          'Create a starter pack with every speaker and organizer who is on Bluesky (150 people max), then post it with the programme link.',
      },
      ...beat(
        'talkTeaser',
        'Talk teaser',
        undefined,
        PROGRAM,
        {
          linkedin:
            '{hook}\n\n{name} ({company}) answers it at {event}.\n\n🎙️ "{title}"\n\nSchedule → {url}\n\n{eventTag}',
          bluesky:
            '{hook}\n\n{name} has the answer — and the graphs. "{title}" at {event}.\n\n{url}',
        },
        {
          subjectSource: 'talk',
          cadence: {
            from: at('PROGRAM_PUBLISHED', wk(1)),
            to: at('CONFERENCE_START', -wk(1)),
            perWeek: { linkedin: 1, bluesky: 2 },
            subjects: 'scheduledTalks',
          },
        },
      ),
    ],
  },
  // 8 ---------------------------------------------------------------------
  {
    key: 'finalPush',
    title: 'Final push',
    start: at('CONFERENCE_START', -wk(4)),
    end: at('CONFERENCE_START', -1),
    primaryOutcome: 'checkoutClickThrough',
    optional: false,
    triggers: [],
    recipes: [
      ...beat(
        'lateBird',
        'Tickets are moving',
        at('CONFERENCE_START', -wk(4)),
        TICKETS,
        {
          linkedin:
            'Four weeks to {event}.\n\nThe programme is out, the workshops are filling, and the venue has a fixed number of seats. If you are coming, this is the week to sort the ticket.\n\nTickets → {url}\n\n{eventTag}',
          bluesky:
            '🎟️ Four weeks to {event}. Seats are finite.\n\n{url}\n\n{eventTag}',
        },
      ),
      {
        key: 'countdown3w:linkedin',
        beat: 'countdown3w',
        title: 'Countdown: 3 weeks',
        kind: 'publishing',
        channel: 'linkedin',
        anchor: at('CONFERENCE_START', -wk(3)),
        prerequisites: [],
        targetPage: TICKETS,
        subjectSource: 'none',
        skeleton:
          'Three weeks until {event}.\n\nOne programme fact to share: pick the talk you would not want a colleague to miss.\n\nTickets → {url}\n\n{eventTag}',
      },
      {
        key: 'countdown1w:linkedin',
        beat: 'countdown1w',
        title: 'Countdown: 1 week',
        kind: 'publishing',
        channel: 'linkedin',
        anchor: at('CONFERENCE_START', -wk(1)),
        prerequisites: [],
        targetPage: TICKETS,
        subjectSource: 'none',
        skeleton: 'One week until {event}.\n\nTickets → {url}\n\n{eventTag}',
      },
      {
        key: 'countdown1d:linkedin',
        beat: 'countdown1d',
        title: 'Countdown: tomorrow',
        kind: 'publishing',
        channel: 'linkedin',
        anchor: at('CONFERENCE_START', -1),
        prerequisites: [],
        targetPage: INFO,
        subjectSource: 'none',
        skeleton:
          'Tomorrow: {event} at {venue}, {city}.\n\nDoors, coffee and the first talk — practical information → {url}\n\n{eventTag}',
      },
      ...beat(
        'countdown',
        'Countdown',
        undefined,
        TICKETS,
        {
          // `{days}` is filled in per day by the expansion at plan creation.
          bluesky: '⏳ {days} to {event}, {date}.\n\n🎟️ {url}\n\n{eventTag}',
        },
        {
          subjectSource: 'none',
          cadence: {
            from: at('CONFERENCE_START', -30),
            to: at('CONFERENCE_START', -1),
            perWeek: { bluesky: 7 },
          },
        },
      ),
      ...beat(
        'travelDeadline',
        'Hotel and travel deadline',
        at('CONFERENCE_START', -wk(2)),
        INFO,
        {
          linkedin:
            'Travelling to {event}?\n\nThe hotel block and the practical details (venue, transport, accessibility) are on the info page. Book before the deadline.\n\nInfo → {url}\n\n{eventTag}',
          bluesky:
            '🏨 Travelling to {event}? Hotel and venue details are on the info page. {url}\n\n{eventTag}',
        },
      ),
      ...beat(
        'registrationCloses',
        'Registration closes',
        at('REGISTRATION_CLOSE'),
        TICKETS,
        {
          linkedin:
            "Don't miss out: registration for {event} closes today.\n\nTickets → {url}\n\n{eventTag}",
          bluesky:
            '🚪 Registration for {event} closes today.\n\n🎟️ {url}\n\n{eventTag}',
        },
      ),
      ...beat(
        'lastChance',
        'Last chance to attend',
        at('CONFERENCE_START', -2),
        TICKETS,
        {
          linkedin:
            'See you at {venue} on {date}.\n\nLast tickets → {url}\n\n{eventTag}',
          bluesky:
            'See you at {event} on {date} 💙\n\nLast tickets: {url}\n\n{eventTag}',
        },
      ),
    ],
  },
  // 9 ---------------------------------------------------------------------
  {
    key: 'eventWeek',
    title: 'Event week',
    start: at('CONFERENCE_START', -1),
    end: at('CONFERENCE_END'),
    primaryOutcome: 'blueskyInteractions',
    optional: false,
    triggers: [],
    recipes: [
      ...beat(
        'doorsOpen',
        'Doors open tomorrow',
        at('CONFERENCE_START', -1),
        INFO,
        {
          linkedin:
            '{event} is tomorrow.\n\nDoors, registration, coffee, the first talk, and where to find the workshops: everything practical → {url}\n\n{eventTag}',
          bluesky:
            '☕ {event} is tomorrow. Doors, coffee, first talk: {url}\n\n{eventTag}',
        },
      ),
      {
        key: 'livePosts',
        beat: 'livePosts',
        title: 'Live posts during the event',
        kind: 'checklist',
        channel: 'bluesky',
        anchor: at('CONFERENCE_START'),
        subjectSource: 'none',
        instructions:
          'Post on-stage-now photos and quotes through the day with the event tag. Bluesky freely; LinkedIn at most two posts per day.',
      },
      ...beat(
        'nextEdition',
        'Announce the next edition',
        at('CONFERENCE_END'),
        HOME,
        {
          linkedin:
            "That's a wrap on {event}. The next edition is announced: same city, next year. Save the date and thank you for coming.\n\n{url}\n\n{eventTag}",
          bluesky:
            "That's a wrap on {event} 💙\n\nNext edition announced from the stage. {url}\n\n{eventTag}",
        },
      ),
    ],
  },
  // 10 --------------------------------------------------------------------
  {
    key: 'postEvent',
    title: 'Post-event',
    start: at('CONFERENCE_END'),
    end: at('CONFERENCE_END', wk(6)),
    primaryOutcome: 'attributedSessions',
    outcomeTargetPage: PROGRAM,
    optional: false,
    triggers: [],
    recipes: [
      ...beat(
        'thankYou',
        'Thank you and photo album',
        at('CONFERENCE_END', 2),
        HOME,
        {
          linkedin:
            'Thank you, {event}.\n\nTo every speaker, sponsor, volunteer and attendee: this was a good day. The photo album is up. Sponsor roll-call in the first comment.\n\nPhotos → {url}\n\n{eventTag}',
          bluesky:
            'Thank you {event} 💙\n\nSpeakers, sponsors, volunteers, everyone who came. Photos: {url}\n\n{eventTag}',
          alt: 'Photo collage from {event}, {date}, {city}.',
        },
      ),
      ...beat(
        'recapSurvey',
        'Recap and survey',
        at('CONFERENCE_END', wk(1)),
        HOME,
        {
          linkedin:
            'A week after {event}: the numbers, one human detail, and a question.\n\nThe recap is up, and the attendee survey takes three minutes. It decides what next year looks like.\n\nRecap and survey → {url}\n\n{eventTag}',
          bluesky:
            '📈 The {event} recap is up, and the attendee survey takes three minutes. {url}\n\n{eventTag}',
        },
      ),
      ...beat(
        'recordingsLive',
        'Recordings are live',
        at('RECORDINGS_LIVE'),
        PROGRAM,
        {
          linkedin:
            'The {event} recordings are live.\n\nEvery talk, from the programme page, free. Start with the one you missed while you were in a workshop.\n\nWatch → {url}\n\n{eventTag}',
          bluesky: '🎬 Every {event} talk is online. {url}\n\n{eventTag}',
        },
      ),
      ...beat(
        'videoDrip',
        'Talk video',
        undefined,
        PROGRAM,
        {
          linkedin:
            '{hook}\n\n{name} ({company}) at {event}: "{title}". Recording online.\n\nWatch → {url}\n\n{eventTag}',
          bluesky:
            '🎬 "{title}" — {name} ({company}) at {event}.\n\n{hook}\n\n{url}',
        },
        {
          subjectSource: 'talk',
          cadence: {
            from: at('RECORDINGS_LIVE', 1),
            to: at('RECORDINGS_LIVE', wk(3)),
            perWeek: { linkedin: 2, bluesky: 7 },
            subjects: 'recordedTalks',
          },
        },
      ),
      ...beat(
        'transparencyReport',
        'Transparency report and next-year save the date',
        at('CONFERENCE_END', wk(6)),
        HOME,
        {
          linkedin:
            'The {event} transparency report.\n\n📈 What it cost and who paid for it\n♿ What we did for accessibility\n🎓 Who spoke, and how many for the first time\n\nAnd the date for next year. Report → {url}\n\n{eventTag}',
          bluesky:
            "📈 The {event} transparency report is out: money, accessibility, speakers, and next year's date. {url}\n\n{eventTag}",
        },
      ),
    ],
  },
]

export const BUILTIN_TEMPLATE: PlanTemplate = {
  name: 'Community conference playbook',
  version: BUILTIN_TEMPLATE_VERSION,
  campaigns,
}

/** The Campaigns seeding asks about, in edition order. */
export function optionalCampaigns(
  template: PlanTemplate = BUILTIN_TEMPLATE,
): { key: string; title: string }[] {
  return template.campaigns
    .filter((c) => c.optional)
    .map(({ key, title }) => ({ key, title }))
}
