/**
 * THE 2026.1 BUILT-IN TEMPLATE, FROZEN — a verbatim snapshot of
 * `src/lib/marketing/template/builtin.ts` at the release this migration was
 * written for, taken when the built-in was bumped to 2026.2 (#1134).
 *
 * 053 backfills the Recipes a plan seeded BEFORE it was resolved against, and
 * those plans were seeded from 2026.1. Reading the live built-in would write
 * whatever the copy says today onto frozen plans as if that were what they
 * were seeded with, so the migration reads this file and nothing else.
 *
 * DO NOT EDIT. `index.test.ts` pins its SHA-256 (the same digest the test
 * pinned against the live built-in before the freeze), so an edit fails there.
 * Once 053 has run on every dataset, this file and the migration go together.
 */
import type { PlanTemplate } from '../../src/lib/marketing/template/types'

export const TEMPLATE_2026_1: PlanTemplate = {
  name: 'Community conference playbook',
  version: '2026.1',
  campaigns: [
    {
      key: 'saveTheDate',
      title: 'Save the date',
      start: {
        milestone: 'CONFERENCE_START',
        offsetDays: -182,
      },
      end: {
        milestone: 'CONFERENCE_START',
        offsetDays: -140,
      },
      primaryOutcome: 'attributedSessions',
      outcomeTargetPage: '/',
      optional: false,
      triggers: [],
      recipes: [
        {
          key: 'saveTheDateRender',
          beat: 'saveTheDate',
          title: 'Render: Save the date',
          kind: 'studioRender',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -184,
          },
          subjectSource: 'none',
          alt: 'Save the date: {event}, {date}, {venue}, {city}.',
        },
        {
          key: 'saveTheDate:linkedin',
          beat: 'saveTheDate',
          title: 'Save the date',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -182,
          },
          prerequisites: ['saveTheDateRender'],
          targetPage: '/',
          subjectSource: 'none',
          skeleton:
            '{event} is back: {date} at {venue}, {city}.\n\nOne day of talks, hands-on workshops and the people who run cloud native in production. The call for papers and tickets open in the coming weeks.\n\nSave the date → {url}\n\n{eventTag} #CloudNativeCommunity #KubernetesCommunity',
          alt: 'Save the date: {event}, {date}, {venue}, {city}.',
        },
        {
          key: 'saveTheDate:bluesky',
          beat: 'saveTheDate',
          title: 'Save the date',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -182,
          },
          prerequisites: ['saveTheDateRender'],
          targetPage: '/',
          subjectSource: 'none',
          skeleton:
            '📌 Save the date: {event}.\n\n🗓️ {date} · 📍 {city}\n\nCFP and tickets open soon. {url}\n\n{eventTag}',
          alt: 'Save the date: {event}, {date}, {venue}, {city}.',
        },
        {
          key: 'blueskySetup',
          beat: 'blueskySetup',
          title: 'Set the Bluesky domain handle and pin the launch post',
          kind: 'checklist',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -182,
          },
          subjectSource: 'none',
          instructions:
            'Verify the conference domain as the Bluesky handle, then pin the save-the-date post to the profile.',
        },
      ],
    },
    {
      key: 'sponsorAcquisition',
      title: 'Sponsor acquisition',
      start: {
        milestone: 'SPONSOR_DEADLINE',
        offsetDays: -168,
      },
      end: {
        milestone: 'SPONSOR_DEADLINE',
        offsetDays: 0,
      },
      primaryOutcome: 'sponsorContactClicks',
      outcomeTargetPage: '/sponsor',
      optional: true,
      triggers: [
        {
          event: 'sponsorSigned',
          taskRecipeKey: 'sponsorCardRender',
        },
      ],
      recipes: [
        {
          key: 'prospectus:linkedin',
          beat: 'prospectus',
          title: 'Sponsor prospectus published',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'SPONSOR_DEADLINE',
            offsetDays: -168,
          },
          prerequisites: [],
          targetPage: '/sponsor',
          subjectSource: 'none',
          skeleton:
            'Why sponsor {event}?\n\nYour support funds the venue, the food and the recordings, and puts your team in front of the engineers who choose the tools. The prospectus is out: tiers, what each includes, and what it costs.\n\nProspectus → {url}\n\n{eventTag} #CloudNativeCommunity',
        },
        {
          key: 'prospectus:bluesky',
          beat: 'prospectus',
          title: 'Sponsor prospectus published',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'SPONSOR_DEADLINE',
            offsetDays: -168,
          },
          prerequisites: [],
          targetPage: '/sponsor',
          subjectSource: 'none',
          skeleton:
            '🤝 The {event} sponsor prospectus is out. Every tier funds something concrete.\n\n{url}\n\n{eventTag}',
        },
        {
          key: 'sponsorCardRender',
          beat: 'sponsorCard',
          title: 'Render: Sponsor thank-you card',
          kind: 'studioRender',
          subjectSource: 'sponsor',
          alt: 'Sponsor card: {name}, {tier} sponsor of {event}, {date}.',
        },
        {
          key: 'sponsorCard:linkedin',
          beat: 'sponsorCard',
          title: 'Sponsor thank-you card',
          kind: 'publishing',
          channel: 'linkedin',
          prerequisites: ['sponsorCardRender'],
          targetPage: '/sponsor',
          subjectSource: 'sponsor',
          skeleton:
            'Thank you to {name} for sponsoring {event} as a {tier} sponsor.\n\n{hook}\n\nMeet them at {venue} on {date}.\n\nAll sponsors → {url}\n\n{eventTag}',
          alt: 'Sponsor card: {name}, {tier} sponsor of {event}, {date}.',
        },
        {
          key: 'sponsorCard:bluesky',
          beat: 'sponsorCard',
          title: 'Sponsor thank-you card',
          kind: 'publishing',
          channel: 'bluesky',
          prerequisites: ['sponsorCardRender'],
          targetPage: '/sponsor',
          subjectSource: 'sponsor',
          skeleton:
            '🥇 {tier} sponsor: {name}\n\n{hook}\n\nThanks for making {event} happen 💙 {url}',
          alt: 'Sponsor card: {name}, {tier} sponsor of {event}, {date}.',
        },
        {
          key: 'sponsorLastCall:linkedin',
          beat: 'sponsorLastCall',
          title: 'Sponsorship last call',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'SPONSOR_DEADLINE',
            offsetDays: -14,
          },
          prerequisites: [],
          targetPage: '/sponsor',
          subjectSource: 'none',
          skeleton:
            'Two weeks left to sponsor {event}.\n\nThe remaining tiers close on the sponsor deadline; after that the programme and printed material are locked.\n\nProspectus and contact → {url}\n\n{eventTag}',
        },
      ],
    },
    {
      key: 'cfp',
      title: 'CFP',
      start: {
        milestone: 'CFP_OPEN',
        offsetDays: 0,
      },
      end: {
        milestone: 'CFP_CLOSE',
        offsetDays: 1,
      },
      primaryOutcome: 'cfpSubmissions',
      optional: false,
      triggers: [],
      recipes: [
        {
          key: 'cfpOpenRender',
          beat: 'cfpOpen',
          title: 'Render: CFP open',
          kind: 'studioRender',
          anchor: {
            milestone: 'CFP_OPEN',
            offsetDays: -2,
          },
          subjectSource: 'none',
          alt: 'Call for papers open: {event}, {date}, {city}.',
        },
        {
          key: 'cfpOpen:linkedin',
          beat: 'cfpOpen',
          title: 'CFP open',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CFP_OPEN',
            offsetDays: 0,
          },
          prerequisites: ['cfpOpenRender'],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            'The {event} call for papers is open.\n\nWe want talks from people running cloud native in production: the migration that hurt, the incident that taught you something, the platform your team actually uses. First-time speakers are welcome, and we offer mentoring on your abstract.\n\nSubmit → {url}\n\n{eventTag} #CloudNativeCommunity #KubernetesCommunity',
          alt: 'Call for papers open: {event}, {date}, {city}.',
        },
        {
          key: 'cfpOpen:bluesky',
          beat: 'cfpOpen',
          title: 'CFP open',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CFP_OPEN',
            offsetDays: 0,
          },
          prerequisites: ['cfpOpenRender'],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            '📣 The {event} CFP is open.\n\nProduction stories, incidents, platforms that work. First-timers welcome. {url}\n\n{eventTag}',
          alt: 'Call for papers open: {event}, {date}, {city}.',
        },
        {
          key: 'cfpEncourage:linkedin',
          beat: 'cfpEncourage',
          title: 'You have a talk in you',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CFP_OPEN',
            offsetDays: 7,
          },
          prerequisites: [],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            'You have a talk in you.\n\nThat migration you are still thinking about. The outage post-mortem your team learned the most from. The tool you replaced and why. Those are the talks {event} wants, and the committee helps first-time speakers shape the abstract.\n\nSubmit → {url}\n\n{eventTag}',
        },
        {
          key: 'cfpEncourage:bluesky',
          beat: 'cfpEncourage',
          title: 'You have a talk in you',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CFP_OPEN',
            offsetDays: 7,
          },
          prerequisites: [],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            'That incident you keep thinking about? That is the talk.\n\nThe {event} CFP is open. {url}\n\n{eventTag}',
        },
        {
          key: 'cfpReminder4w:bluesky',
          beat: 'cfpReminder4w',
          title: 'CFP reminder (4 weeks)',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CFP_CLOSE',
            offsetDays: -28,
          },
          prerequisites: [],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            '⏰ Four weeks left to submit to {event}.\n\nAbstracts, not slides — the committee reads every one. {url}\n\n{eventTag}',
        },
        {
          key: 'cfpReminder2w:linkedin',
          beat: 'cfpReminder2w',
          title: 'CFP reminder (2 weeks)',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CFP_CLOSE',
            offsetDays: -14,
          },
          prerequisites: [],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            'Two weeks left in the {event} call for papers.\n\nIf you have been meaning to submit, this is the moment. Abstracts only; the committee reads every submission and answers every speaker.\n\nSubmit → {url}\n\n{eventTag}',
        },
        {
          key: 'cfpReminder2w:bluesky',
          beat: 'cfpReminder2w',
          title: 'CFP reminder (2 weeks)',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CFP_CLOSE',
            offsetDays: -14,
          },
          prerequisites: [],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            '⏰ Two weeks left: the {event} CFP closes soon.\n\nAbstract, not slides. {url}\n\n{eventTag}',
        },
        {
          key: 'cfpReminder1w:linkedin',
          beat: 'cfpReminder1w',
          title: 'CFP reminder (1 week)',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CFP_CLOSE',
            offsetDays: -7,
          },
          prerequisites: [],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            'One week left in the {event} call for papers.\n\nSubmit → {url}\n\n{eventTag}',
        },
        {
          key: 'cfpReminder1w:bluesky',
          beat: 'cfpReminder1w',
          title: 'CFP reminder (1 week)',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CFP_CLOSE',
            offsetDays: -7,
          },
          prerequisites: [],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            '🚨 One week left in the {event} CFP.\n\n{url}\n\n{eventTag}',
        },
        {
          key: 'cfpLastDay:linkedin',
          beat: 'cfpLastDay',
          title: 'CFP last day',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CFP_CLOSE',
            offsetDays: 0,
          },
          prerequisites: [],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            'Last day: the {event} call for papers closes tonight.\n\nSubmit → {url}\n\n{eventTag}',
        },
        {
          key: 'cfpLastDay:bluesky',
          beat: 'cfpLastDay',
          title: 'CFP last day',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CFP_CLOSE',
            offsetDays: 0,
          },
          prerequisites: [],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            '🚨 The {event} CFP closes tonight.\n\nThat talk you have been drafting? Send it. {url}\n\n{eventTag}',
        },
        {
          key: 'cfpThanks:bluesky',
          beat: 'cfpThanks',
          title: 'CFP closed, thank you',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CFP_CLOSE',
            offsetDays: 1,
          },
          prerequisites: [],
          targetPage: '/cfp',
          subjectSource: 'none',
          skeleton:
            'The {event} CFP is closed. Thank you to everyone who submitted; every speaker hears back.\n\n{url}\n\n{eventTag}',
        },
      ],
    },
    {
      key: 'earlyBird',
      title: 'Tickets open / early bird',
      start: {
        milestone: 'TICKETS_OPEN',
        offsetDays: 0,
      },
      end: {
        milestone: 'EARLY_BIRD_END',
        offsetDays: 0,
      },
      primaryOutcome: 'ticketsSoldInWindow',
      target: {
        shareOfCapacity: 0.15,
      },
      optional: false,
      triggers: [],
      recipes: [
        {
          key: 'ticketsOpenRender',
          beat: 'ticketsOpen',
          title: 'Render: Tickets open',
          kind: 'studioRender',
          anchor: {
            milestone: 'TICKETS_OPEN',
            offsetDays: -2,
          },
          subjectSource: 'none',
          alt: 'Tickets on sale: {event}, {date}, {venue}, {city}.',
        },
        {
          key: 'ticketsOpen:linkedin',
          beat: 'ticketsOpen',
          title: 'Tickets open',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'TICKETS_OPEN',
            offsetDays: 0,
          },
          prerequisites: ['ticketsOpenRender'],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            'Tickets for {event} are on sale.\n\n{date} at {venue}, {city}: a full day of talks and workshops, lunch included, recordings afterwards. Early-bird pricing runs until the early-bird deadline.\n\nTickets → {url}\n\n{eventTag}',
          alt: 'Tickets on sale: {event}, {date}, {venue}, {city}.',
        },
        {
          key: 'ticketsOpen:bluesky',
          beat: 'ticketsOpen',
          title: 'Tickets open',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'TICKETS_OPEN',
            offsetDays: 0,
          },
          prerequisites: ['ticketsOpenRender'],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            '🎟️ Tickets for {event} are live, early-bird price while it lasts.\n\n{url}\n\n{eventTag}',
          alt: 'Tickets on sale: {event}, {date}, {venue}, {city}.',
        },
        {
          key: 'linkedinEvent',
          beat: 'linkedinEvent',
          title: 'Create the LinkedIn Event',
          kind: 'eventPageUpdate',
          channel: 'linkedin',
          anchor: {
            milestone: 'TICKETS_OPEN',
            offsetDays: 0,
          },
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
          anchor: {
            milestone: 'EARLY_BIRD_END',
            offsetDays: -14,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            '🎟️ Two weeks of early-bird pricing left for {event}.\n\n{url}\n\n{eventTag}',
        },
        {
          key: 'earlyBirdReminder1w:linkedin',
          beat: 'earlyBirdReminder1w',
          title: 'Early-bird reminder (1 week)',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'EARLY_BIRD_END',
            offsetDays: -7,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            'One week of early-bird pricing left for {event}.\n\nThe ticket includes the full programme, workshops, lunch and the recordings. The price goes up after the early-bird deadline.\n\nTickets → {url}\n\n{eventTag}',
        },
        {
          key: 'earlyBirdReminder1w:bluesky',
          beat: 'earlyBirdReminder1w',
          title: 'Early-bird reminder (1 week)',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'EARLY_BIRD_END',
            offsetDays: -7,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            '🎟️ One week left at the early-bird price for {event}.\n\n{url}\n\n{eventTag}',
        },
        {
          key: 'earlyBirdLastDay:linkedin',
          beat: 'earlyBirdLastDay',
          title: 'Early-bird last day',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'EARLY_BIRD_END',
            offsetDays: 0,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            'Early bird for {event} ends today.\n\nSame ticket, lower price, until midnight.\n\nTickets → {url}\n\n{eventTag}',
        },
        {
          key: 'earlyBirdLastDay:bluesky',
          beat: 'earlyBirdLastDay',
          title: 'Early-bird last day',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'EARLY_BIRD_END',
            offsetDays: 0,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            '🐦 Last day for early-bird tickets.\n\n{event} · {date} · {city}\n\n🎟️ {url}',
        },
      ],
    },
    {
      key: 'keynotes',
      title: 'Keynotes',
      start: {
        milestone: 'SPEAKERS_ANNOUNCED',
        offsetDays: -28,
      },
      end: {
        milestone: 'SPEAKERS_ANNOUNCED',
        offsetDays: 0,
      },
      primaryOutcome: 'attributedSessions',
      outcomeTargetPage: '/program',
      optional: true,
      triggers: [],
      recipes: [
        {
          key: 'keynoteAnnounceRender',
          beat: 'keynoteAnnounce',
          title: 'Render: Keynotes announced',
          kind: 'studioRender',
          anchor: {
            milestone: 'SPEAKERS_ANNOUNCED',
            offsetDays: -30,
          },
          subjectSource: 'none',
          alt: 'Keynotes announced: {event}, {date}.',
        },
        {
          key: 'keynoteAnnounce:linkedin',
          beat: 'keynoteAnnounce',
          title: 'Keynotes announced',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'SPEAKERS_ANNOUNCED',
            offsetDays: -28,
          },
          prerequisites: ['keynoteAnnounceRender'],
          targetPage: '/program',
          subjectSource: 'none',
          skeleton:
            'The {event} keynotes are confirmed.\n\nTwo talks that frame the day: where cloud native is going and what it costs to get there. Speaker cards follow this week.\n\nProgramme → {url}\n\n{eventTag}',
          alt: 'Keynotes announced: {event}, {date}.',
        },
        {
          key: 'keynoteAnnounce:bluesky',
          beat: 'keynoteAnnounce',
          title: 'Keynotes announced',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'SPEAKERS_ANNOUNCED',
            offsetDays: -28,
          },
          prerequisites: ['keynoteAnnounceRender'],
          targetPage: '/program',
          subjectSource: 'none',
          skeleton:
            '🎙️ Keynotes for {event} are confirmed.\n\nCards coming this week. {url}\n\n{eventTag}',
          alt: 'Keynotes announced: {event}, {date}.',
        },
        {
          key: 'keynoteCardRender',
          beat: 'keynoteCard',
          title: 'Render: Keynote speaker card',
          kind: 'studioRender',
          subjectSource: 'speaker',
          alt: 'Keynote card: {name}, {company}. Talk: "{title}". {event}, {date}.',
          cadence: {
            from: {
              milestone: 'SPEAKERS_ANNOUNCED',
              offsetDays: -28,
            },
            to: {
              milestone: 'SPEAKERS_ANNOUNCED',
              offsetDays: 0,
            },
            perWeek: {
              linkedin: 1,
              bluesky: 1,
            },
          },
        },
        {
          key: 'keynoteCard:linkedin',
          beat: 'keynoteCard',
          title: 'Keynote speaker card',
          kind: 'publishing',
          channel: 'linkedin',
          prerequisites: ['keynoteCardRender'],
          targetPage: '/program',
          subjectSource: 'speaker',
          skeleton:
            '{name} is keynoting {event}.\n\n{hook}\n\n🎙️ "{title}"\n🗓️ {date} · 📍 {venue}\n\nFull programme → {url}\n\n{eventTag}',
          alt: 'Keynote card: {name}, {company}. Talk: "{title}". {event}, {date}.',
          cadence: {
            from: {
              milestone: 'SPEAKERS_ANNOUNCED',
              offsetDays: -28,
            },
            to: {
              milestone: 'SPEAKERS_ANNOUNCED',
              offsetDays: 0,
            },
            perWeek: {
              linkedin: 1,
              bluesky: 1,
            },
          },
        },
        {
          key: 'keynoteCard:bluesky',
          beat: 'keynoteCard',
          title: 'Keynote speaker card',
          kind: 'publishing',
          channel: 'bluesky',
          prerequisites: ['keynoteCardRender'],
          targetPage: '/program',
          subjectSource: 'speaker',
          skeleton:
            '🎙️ Keynote: {name} ({company}) at {event}.\n\n"{title}" — {hook}\n\n🗓️ {date} · 📍 {city}\n{url}',
          alt: 'Keynote card: {name}, {company}. Talk: "{title}". {event}, {date}.',
          cadence: {
            from: {
              milestone: 'SPEAKERS_ANNOUNCED',
              offsetDays: -28,
            },
            to: {
              milestone: 'SPEAKERS_ANNOUNCED',
              offsetDays: 0,
            },
            perWeek: {
              linkedin: 1,
              bluesky: 1,
            },
          },
        },
      ],
    },
    {
      key: 'speakers',
      title: 'Speakers',
      start: {
        milestone: 'CFP_NOTIFY',
        offsetDays: 0,
      },
      end: {
        milestone: 'CONFERENCE_START',
        offsetDays: -7,
      },
      primaryOutcome: 'attributedSessions',
      outcomeTargetPage: '/program',
      optional: false,
      triggers: [
        {
          event: 'speakerConfirmed',
          taskRecipeKey: 'speakerCardRender',
        },
      ],
      recipes: [
        {
          key: 'speakerKit',
          beat: 'speakerKit',
          title: 'Acceptance-letter social kit',
          kind: 'checklist',
          anchor: {
            milestone: 'CFP_NOTIFY',
            offsetDays: 0,
          },
          subjectSource: 'none',
          instructions:
            'Put the "please share" copy and a link to each speaker card into the acceptance letter, so speakers can post on the day they accept.',
        },
        {
          key: 'firstBatchRender',
          beat: 'firstBatch',
          title: 'Render: First speaker batch',
          kind: 'studioRender',
          anchor: {
            milestone: 'CFP_NOTIFY',
            offsetDays: 5,
          },
          subjectSource: 'none',
          alt: 'First confirmed speakers at {event}, {date}, {city}.',
        },
        {
          key: 'firstBatch:linkedin',
          beat: 'firstBatch',
          title: 'First speaker batch',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CFP_NOTIFY',
            offsetDays: 7,
          },
          prerequisites: ['firstBatchRender'],
          targetPage: '/program',
          subjectSource: 'none',
          skeleton:
            'The {event} lineup is taking shape.\n\nThe first confirmed speakers cover platform engineering, security, observability and the operational stories in between. More follow every week until the full programme is out.\n\nSpeakers so far → {url}\n\n{eventTag}',
          alt: 'First confirmed speakers at {event}, {date}, {city}.',
        },
        {
          key: 'firstBatch:bluesky',
          beat: 'firstBatch',
          title: 'First speaker batch',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CFP_NOTIFY',
            offsetDays: 7,
          },
          prerequisites: ['firstBatchRender'],
          targetPage: '/program',
          subjectSource: 'none',
          skeleton:
            '🎙️ First speakers confirmed for {event}.\n\nMore every week. {url}\n\n{eventTag}',
          alt: 'First confirmed speakers at {event}, {date}, {city}.',
        },
        {
          key: 'speakerCardRender',
          beat: 'speakerCard',
          title: 'Render: Speaker card',
          kind: 'studioRender',
          subjectSource: 'speaker',
          alt: 'Speaker card: {name}, {company}. Talk: "{title}". {event}, {date}.',
          cadence: {
            from: {
              milestone: 'CFP_NOTIFY',
              offsetDays: 7,
            },
            to: {
              milestone: 'CONFERENCE_START',
              offsetDays: -7,
            },
            perWeek: {
              linkedin: 2,
              bluesky: 3,
            },
            subjects: 'confirmedSpeakers',
          },
        },
        {
          key: 'speakerCard:linkedin',
          beat: 'speakerCard',
          title: 'Speaker card',
          kind: 'publishing',
          channel: 'linkedin',
          prerequisites: ['speakerCardRender'],
          targetPage: '/program',
          subjectSource: 'speaker',
          skeleton:
            '{name} is bringing {hook} to {event}.\n\n🎙️ "{title}"\n🗓️ {date} · 📍 {venue}\n\nFull programme → {url}\n\n{eventTag}',
          alt: 'Speaker card: {name}, {company}. Talk: "{title}". {event}, {date}.',
          cadence: {
            from: {
              milestone: 'CFP_NOTIFY',
              offsetDays: 7,
            },
            to: {
              milestone: 'CONFERENCE_START',
              offsetDays: -7,
            },
            perWeek: {
              linkedin: 2,
              bluesky: 3,
            },
            subjects: 'confirmedSpeakers',
          },
        },
        {
          key: 'speakerCard:bluesky',
          beat: 'speakerCard',
          title: 'Speaker card',
          kind: 'publishing',
          channel: 'bluesky',
          prerequisites: ['speakerCardRender'],
          targetPage: '/program',
          subjectSource: 'speaker',
          skeleton:
            '🎙️ {name} ({company}) is speaking at {event}.\n\n"{title}" — {hook}\n\n🗓️ {date} · 📍 {city}\n{url}\n\n{eventTag}',
          alt: 'Speaker card: {name}, {company}. Talk: "{title}". {event}, {date}.',
          cadence: {
            from: {
              milestone: 'CFP_NOTIFY',
              offsetDays: 7,
            },
            to: {
              milestone: 'CONFERENCE_START',
              offsetDays: -7,
            },
            perWeek: {
              linkedin: 2,
              bluesky: 3,
            },
            subjects: 'confirmedSpeakers',
          },
        },
      ],
    },
    {
      key: 'programme',
      title: 'Programme launch',
      start: {
        milestone: 'PROGRAM_PUBLISHED',
        offsetDays: 0,
      },
      end: {
        milestone: 'PROGRAM_PUBLISHED',
        offsetDays: 14,
      },
      primaryOutcome: 'attributedSessions',
      outcomeTargetPage: '/program',
      optional: false,
      triggers: [],
      recipes: [
        {
          key: 'scheduleLiveRender',
          beat: 'scheduleLive',
          title: 'Render: The schedule is live',
          kind: 'studioRender',
          anchor: {
            milestone: 'PROGRAM_PUBLISHED',
            offsetDays: -2,
          },
          subjectSource: 'none',
          alt: 'Programme published: {event}, {date}, {city}.',
        },
        {
          key: 'scheduleLive:linkedin',
          beat: 'scheduleLive',
          title: 'The schedule is live',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'PROGRAM_PUBLISHED',
            offsetDays: 0,
          },
          prerequisites: ['scheduleLiveRender'],
          targetPage: '/program',
          subjectSource: 'none',
          skeleton:
            'The {event} programme is live.\n\nEvery talk and workshop, with times and rooms, on one page. Build your day and share it with the colleague who should come with you.\n\nProgramme → {url}\n\n{eventTag} #CloudNativeCommunity #KubernetesCommunity',
          alt: 'Programme published: {event}, {date}, {city}.',
        },
        {
          key: 'scheduleLive:bluesky',
          beat: 'scheduleLive',
          title: 'The schedule is live',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'PROGRAM_PUBLISHED',
            offsetDays: 0,
          },
          prerequisites: ['scheduleLiveRender'],
          targetPage: '/program',
          subjectSource: 'none',
          skeleton:
            '📋 The {event} programme is live.\n\nEvery talk, every workshop, one page. {url}\n\n{eventTag}',
          alt: 'Programme published: {event}, {date}, {city}.',
        },
        {
          key: 'cncfAmplify:linkedin',
          beat: 'cncfAmplify',
          title: 'Vendor-neutral post for CNCF amplification',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'PROGRAM_PUBLISHED',
            offsetDays: 1,
          },
          prerequisites: [],
          targetPage: '/program',
          subjectSource: 'none',
          skeleton:
            '{event}, {date}, {city}: a community-run day of cloud native talks and workshops.\n\nThe programme is out; tickets are open. If you work with Kubernetes or the projects around it, this is the local room to be in.\n\nProgramme → {url}\n\n#CloudNativeCommunity #KubernetesCommunity {eventTag}',
        },
        {
          key: 'cncfAmplify:bluesky',
          beat: 'cncfAmplify',
          title: 'Vendor-neutral post for CNCF amplification',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'PROGRAM_PUBLISHED',
            offsetDays: 1,
          },
          prerequisites: [],
          targetPage: '/program',
          subjectSource: 'none',
          skeleton:
            '{event}, {city}: community-run, one day, cloud native talks and workshops.\n\n{url}\n\n#CloudNativeCommunity',
        },
        {
          key: 'starterPack',
          beat: 'starterPack',
          title: 'Publish a Bluesky starter pack of speakers and organizers',
          kind: 'checklist',
          channel: 'bluesky',
          anchor: {
            milestone: 'PROGRAM_PUBLISHED',
            offsetDays: 2,
          },
          subjectSource: 'none',
          instructions:
            'Create a starter pack with every speaker and organizer who is on Bluesky (150 people max), then post it with the programme link.',
        },
        {
          key: 'talkTeaser:linkedin',
          beat: 'talkTeaser',
          title: 'Talk teaser',
          kind: 'publishing',
          channel: 'linkedin',
          prerequisites: [],
          targetPage: '/program',
          subjectSource: 'talk',
          skeleton:
            '{hook}\n\n{name} ({company}) answers it at {event}.\n\n🎙️ "{title}"\n\nSchedule → {url}\n\n{eventTag}',
          cadence: {
            from: {
              milestone: 'PROGRAM_PUBLISHED',
              offsetDays: 7,
            },
            to: {
              milestone: 'CONFERENCE_START',
              offsetDays: -7,
            },
            perWeek: {
              linkedin: 1,
              bluesky: 2,
            },
            subjects: 'scheduledTalks',
          },
        },
        {
          key: 'talkTeaser:bluesky',
          beat: 'talkTeaser',
          title: 'Talk teaser',
          kind: 'publishing',
          channel: 'bluesky',
          prerequisites: [],
          targetPage: '/program',
          subjectSource: 'talk',
          skeleton:
            '{hook}\n\n{name} has the answer — and the graphs. "{title}" at {event}.\n\n{url}',
          cadence: {
            from: {
              milestone: 'PROGRAM_PUBLISHED',
              offsetDays: 7,
            },
            to: {
              milestone: 'CONFERENCE_START',
              offsetDays: -7,
            },
            perWeek: {
              linkedin: 1,
              bluesky: 2,
            },
            subjects: 'scheduledTalks',
          },
        },
      ],
    },
    {
      key: 'finalPush',
      title: 'Final push',
      start: {
        milestone: 'CONFERENCE_START',
        offsetDays: -28,
      },
      end: {
        milestone: 'CONFERENCE_START',
        offsetDays: -1,
      },
      primaryOutcome: 'checkoutClickThrough',
      optional: false,
      triggers: [],
      recipes: [
        {
          key: 'lateBird:linkedin',
          beat: 'lateBird',
          title: 'Tickets are moving',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -28,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            'Four weeks to {event}.\n\nThe programme is out, the workshops are filling, and the venue has a fixed number of seats. If you are coming, this is the week to sort the ticket.\n\nTickets → {url}\n\n{eventTag}',
        },
        {
          key: 'lateBird:bluesky',
          beat: 'lateBird',
          title: 'Tickets are moving',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -28,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            '🎟️ Four weeks to {event}. Seats are finite.\n\n{url}\n\n{eventTag}',
        },
        {
          key: 'countdown3w:linkedin',
          beat: 'countdown3w',
          title: 'Countdown: 3 weeks',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -21,
          },
          prerequisites: [],
          targetPage: '/tickets',
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
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -7,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton: 'One week until {event}.\n\nTickets → {url}\n\n{eventTag}',
        },
        {
          key: 'countdown1d:linkedin',
          beat: 'countdown1d',
          title: 'Countdown: tomorrow',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -1,
          },
          prerequisites: [],
          targetPage: '/info',
          subjectSource: 'none',
          skeleton:
            'Tomorrow: {event} at {venue}, {city}.\n\nDoors, coffee and the first talk — practical information → {url}\n\n{eventTag}',
        },
        {
          key: 'countdown:bluesky',
          beat: 'countdown',
          title: 'Countdown',
          kind: 'publishing',
          channel: 'bluesky',
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton: '⏳ {days} to {event}, {date}.\n\n🎟️ {url}\n\n{eventTag}',
          cadence: {
            from: {
              milestone: 'CONFERENCE_START',
              offsetDays: -30,
            },
            to: {
              milestone: 'CONFERENCE_START',
              offsetDays: -1,
            },
            perWeek: {
              bluesky: 7,
            },
          },
        },
        {
          key: 'travelDeadline:linkedin',
          beat: 'travelDeadline',
          title: 'Hotel and travel deadline',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -14,
          },
          prerequisites: [],
          targetPage: '/info',
          subjectSource: 'none',
          skeleton:
            'Travelling to {event}?\n\nThe hotel block and the practical details (venue, transport, accessibility) are on the info page. Book before the deadline.\n\nInfo → {url}\n\n{eventTag}',
        },
        {
          key: 'travelDeadline:bluesky',
          beat: 'travelDeadline',
          title: 'Hotel and travel deadline',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -14,
          },
          prerequisites: [],
          targetPage: '/info',
          subjectSource: 'none',
          skeleton:
            '🏨 Travelling to {event}? Hotel and venue details are on the info page. {url}\n\n{eventTag}',
        },
        {
          key: 'registrationCloses:linkedin',
          beat: 'registrationCloses',
          title: 'Registration closes',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'REGISTRATION_CLOSE',
            offsetDays: 0,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            "Don't miss out: registration for {event} closes today.\n\nTickets → {url}\n\n{eventTag}",
        },
        {
          key: 'registrationCloses:bluesky',
          beat: 'registrationCloses',
          title: 'Registration closes',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'REGISTRATION_CLOSE',
            offsetDays: 0,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            '🚪 Registration for {event} closes today.\n\n🎟️ {url}\n\n{eventTag}',
        },
        {
          key: 'lastChance:linkedin',
          beat: 'lastChance',
          title: 'Last chance to attend',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -2,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            'See you at {venue} on {date}.\n\nLast tickets → {url}\n\n{eventTag}',
        },
        {
          key: 'lastChance:bluesky',
          beat: 'lastChance',
          title: 'Last chance to attend',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -2,
          },
          prerequisites: [],
          targetPage: '/tickets',
          subjectSource: 'none',
          skeleton:
            'See you at {event} on {date} 💙\n\nLast tickets: {url}\n\n{eventTag}',
        },
      ],
    },
    {
      key: 'eventWeek',
      title: 'Event week',
      start: {
        milestone: 'CONFERENCE_START',
        offsetDays: -1,
      },
      end: {
        milestone: 'CONFERENCE_END',
        offsetDays: 0,
      },
      primaryOutcome: 'blueskyInteractions',
      optional: false,
      triggers: [],
      recipes: [
        {
          key: 'doorsOpen:linkedin',
          beat: 'doorsOpen',
          title: 'Doors open tomorrow',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -1,
          },
          prerequisites: [],
          targetPage: '/info',
          subjectSource: 'none',
          skeleton:
            '{event} is tomorrow.\n\nDoors, registration, coffee, the first talk, and where to find the workshops: everything practical → {url}\n\n{eventTag}',
        },
        {
          key: 'doorsOpen:bluesky',
          beat: 'doorsOpen',
          title: 'Doors open tomorrow',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: -1,
          },
          prerequisites: [],
          targetPage: '/info',
          subjectSource: 'none',
          skeleton:
            '☕ {event} is tomorrow. Doors, coffee, first talk: {url}\n\n{eventTag}',
        },
        {
          key: 'livePosts',
          beat: 'livePosts',
          title: 'Live posts during the event',
          kind: 'checklist',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_START',
            offsetDays: 0,
          },
          subjectSource: 'none',
          instructions:
            'Post on-stage-now photos and quotes through the day with the event tag. Bluesky freely; LinkedIn at most two posts per day.',
        },
        {
          key: 'nextEdition:linkedin',
          beat: 'nextEdition',
          title: 'Announce the next edition',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_END',
            offsetDays: 0,
          },
          prerequisites: [],
          targetPage: '/',
          subjectSource: 'none',
          skeleton:
            "That's a wrap on {event}. The next edition is announced: same city, next year. Save the date and thank you for coming.\n\n{url}\n\n{eventTag}",
        },
        {
          key: 'nextEdition:bluesky',
          beat: 'nextEdition',
          title: 'Announce the next edition',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_END',
            offsetDays: 0,
          },
          prerequisites: [],
          targetPage: '/',
          subjectSource: 'none',
          skeleton:
            "That's a wrap on {event} 💙\n\nNext edition announced from the stage. {url}\n\n{eventTag}",
        },
      ],
    },
    {
      key: 'postEvent',
      title: 'Post-event',
      start: {
        milestone: 'CONFERENCE_END',
        offsetDays: 0,
      },
      end: {
        milestone: 'CONFERENCE_END',
        offsetDays: 42,
      },
      primaryOutcome: 'attributedSessions',
      outcomeTargetPage: '/program',
      optional: false,
      triggers: [],
      recipes: [
        {
          key: 'thankYouRender',
          beat: 'thankYou',
          title: 'Render: Thank you and photo album',
          kind: 'studioRender',
          anchor: {
            milestone: 'CONFERENCE_END',
            offsetDays: 0,
          },
          subjectSource: 'none',
          alt: 'Photo collage from {event}, {date}, {city}.',
        },
        {
          key: 'thankYou:linkedin',
          beat: 'thankYou',
          title: 'Thank you and photo album',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_END',
            offsetDays: 2,
          },
          prerequisites: ['thankYouRender'],
          targetPage: '/',
          subjectSource: 'none',
          skeleton:
            'Thank you, {event}.\n\nTo every speaker, sponsor, volunteer and attendee: this was a good day. The photo album is up. Sponsor roll-call in the first comment.\n\nPhotos → {url}\n\n{eventTag}',
          alt: 'Photo collage from {event}, {date}, {city}.',
        },
        {
          key: 'thankYou:bluesky',
          beat: 'thankYou',
          title: 'Thank you and photo album',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_END',
            offsetDays: 2,
          },
          prerequisites: ['thankYouRender'],
          targetPage: '/',
          subjectSource: 'none',
          skeleton:
            'Thank you {event} 💙\n\nSpeakers, sponsors, volunteers, everyone who came. Photos: {url}\n\n{eventTag}',
          alt: 'Photo collage from {event}, {date}, {city}.',
        },
        {
          key: 'recapSurvey:linkedin',
          beat: 'recapSurvey',
          title: 'Recap and survey',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_END',
            offsetDays: 7,
          },
          prerequisites: [],
          targetPage: '/',
          subjectSource: 'none',
          skeleton:
            'A week after {event}: the numbers, one human detail, and a question.\n\nThe recap is up, and the attendee survey takes three minutes. It decides what next year looks like.\n\nRecap and survey → {url}\n\n{eventTag}',
        },
        {
          key: 'recapSurvey:bluesky',
          beat: 'recapSurvey',
          title: 'Recap and survey',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_END',
            offsetDays: 7,
          },
          prerequisites: [],
          targetPage: '/',
          subjectSource: 'none',
          skeleton:
            '📈 The {event} recap is up, and the attendee survey takes three minutes. {url}\n\n{eventTag}',
        },
        {
          key: 'recordingsLive:linkedin',
          beat: 'recordingsLive',
          title: 'Recordings are live',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'RECORDINGS_LIVE',
            offsetDays: 0,
          },
          prerequisites: [],
          targetPage: '/program',
          subjectSource: 'none',
          skeleton:
            'The {event} recordings are live.\n\nEvery talk, from the programme page, free. Start with the one you missed while you were in a workshop.\n\nWatch → {url}\n\n{eventTag}',
        },
        {
          key: 'recordingsLive:bluesky',
          beat: 'recordingsLive',
          title: 'Recordings are live',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'RECORDINGS_LIVE',
            offsetDays: 0,
          },
          prerequisites: [],
          targetPage: '/program',
          subjectSource: 'none',
          skeleton: '🎬 Every {event} talk is online. {url}\n\n{eventTag}',
        },
        {
          key: 'videoDrip:linkedin',
          beat: 'videoDrip',
          title: 'Talk video',
          kind: 'publishing',
          channel: 'linkedin',
          prerequisites: [],
          targetPage: '/program',
          subjectSource: 'talk',
          skeleton:
            '{hook}\n\n{name} ({company}) at {event}: "{title}". Recording online.\n\nWatch → {url}\n\n{eventTag}',
          cadence: {
            from: {
              milestone: 'RECORDINGS_LIVE',
              offsetDays: 1,
            },
            to: {
              milestone: 'RECORDINGS_LIVE',
              offsetDays: 21,
            },
            perWeek: {
              linkedin: 2,
              bluesky: 7,
            },
            subjects: 'recordedTalks',
          },
        },
        {
          key: 'videoDrip:bluesky',
          beat: 'videoDrip',
          title: 'Talk video',
          kind: 'publishing',
          channel: 'bluesky',
          prerequisites: [],
          targetPage: '/program',
          subjectSource: 'talk',
          skeleton:
            '🎬 "{title}" — {name} ({company}) at {event}.\n\n{hook}\n\n{url}',
          cadence: {
            from: {
              milestone: 'RECORDINGS_LIVE',
              offsetDays: 1,
            },
            to: {
              milestone: 'RECORDINGS_LIVE',
              offsetDays: 21,
            },
            perWeek: {
              linkedin: 2,
              bluesky: 7,
            },
            subjects: 'recordedTalks',
          },
        },
        {
          key: 'transparencyReport:linkedin',
          beat: 'transparencyReport',
          title: 'Transparency report and next-year save the date',
          kind: 'publishing',
          channel: 'linkedin',
          anchor: {
            milestone: 'CONFERENCE_END',
            offsetDays: 42,
          },
          prerequisites: [],
          targetPage: '/',
          subjectSource: 'none',
          skeleton:
            'The {event} transparency report.\n\n📈 What it cost and who paid for it\n♿ What we did for accessibility\n🎓 Who spoke, and how many for the first time\n\nAnd the date for next year. Report → {url}\n\n{eventTag}',
        },
        {
          key: 'transparencyReport:bluesky',
          beat: 'transparencyReport',
          title: 'Transparency report and next-year save the date',
          kind: 'publishing',
          channel: 'bluesky',
          anchor: {
            milestone: 'CONFERENCE_END',
            offsetDays: 42,
          },
          prerequisites: [],
          targetPage: '/',
          subjectSource: 'none',
          skeleton:
            "📈 The {event} transparency report is out: money, accessibility, speakers, and next year's date. {url}\n\n{eventTag}",
        },
      ],
    },
  ],
}
