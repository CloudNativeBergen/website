import { describe, expect, it } from 'vitest'
import { BUILTIN_TEMPLATE } from '../template'
import {
  LIBRARY,
  applyEdits,
  attachEntry,
  editIssues,
  editsOf,
  entryCeilingNotes,
  libraryEntry,
  libraryEntryOfBeat,
  removeBeat,
} from '.'

const speakerCard = libraryEntry('speakerCard')
const countdown = libraryEntry('countdown')
const builtinSpeakers = BUILTIN_TEMPLATE.campaigns.find(
  (c) => c.key === 'speakers',
)!

describe('the Recipe Library', () => {
  it('offers the five platform Recipes', () => {
    expect(LIBRARY.map((e) => e.id)).toEqual([
      'speakerCard',
      'sponsorCard',
      'talkTeaser',
      'videoDrip',
      'countdown',
    ])
  })
  it('carries exactly the built-in wiring, so an attached Recipe generates as the built-in does', () => {
    expect(speakerCard.recipes).toEqual(
      builtinSpeakers.recipes.filter((r) => r.beat === 'speakerCard'),
    )
    expect(speakerCard.triggers).toEqual([
      { event: 'speakerConfirmed', taskRecipeKey: 'speakerCardRender' },
    ])
    expect(libraryEntry('sponsorCard').triggers).toEqual([
      { event: 'sponsorSigned', taskRecipeKey: 'sponsorCardRender' },
    ])
    expect(libraryEntry('videoDrip').triggers).toEqual([])
  })
  it('keeps the countdown beat prefix the ceilings recognise', () => {
    expect(countdown.recipes.every((r) => r.beat === 'countdown')).toBe(true)
    expect(countdown.recipes.map((r) => r.key)).toEqual(['countdown:bluesky'])
  })
  it('finds an entry by the beat of a stored Recipe', () => {
    expect(libraryEntryOfBeat('videoDrip')?.id).toBe('videoDrip')
    expect(libraryEntryOfBeat('cfpOpen')).toBeNull()
  })
})

describe('editing an entry', () => {
  it('round-trips: the unedited entry applies to itself', () => {
    for (const entry of LIBRARY)
      expect(applyEdits(entry, editsOf(entry, entry.recipes))).toEqual(
        entry.recipes,
      )
  })
  it('applies the title, copy, alt, window and rates, and nothing else', () => {
    const edits = editsOf(speakerCard, speakerCard.recipes)
    const edited = applyEdits(speakerCard, {
      ...edits,
      title: 'Meet the speaker',
      alt: 'Card for {name} at {event}.',
      instructions: 'Use the square template.',
      window: {
        from: { milestone: 'PROGRAM_PUBLISHED', offsetDays: 0 },
        to: { milestone: 'CONFERENCE_START', offsetDays: -3 },
      },
      channels: {
        linkedin: { skeleton: '{name} speaks at {event}. {url}', perWeek: 1 },
        bluesky: { skeleton: '🎙️ {name} — {url}', perWeek: 5 },
      },
    })
    expect(edited.map((r) => [r.key, r.kind, r.title])).toEqual([
      ['speakerCardRender', 'studioRender', 'Render: Meet the speaker'],
      ['speakerCard:linkedin', 'publishing', 'Meet the speaker'],
      ['speakerCard:bluesky', 'publishing', 'Meet the speaker'],
    ])
    expect(edited[1]).toMatchObject({
      skeleton: '{name} speaks at {event}. {url}',
      alt: 'Card for {name} at {event}.',
      instructions: 'Use the square template.',
      prerequisites: ['speakerCardRender'],
      targetPage: '/program',
      subjectSource: 'speaker',
      cadence: {
        from: { milestone: 'PROGRAM_PUBLISHED', offsetDays: 0 },
        to: { milestone: 'CONFERENCE_START', offsetDays: -3 },
        perWeek: { linkedin: 1, bluesky: 5 },
        subjects: 'confirmedSpeakers',
      },
    })
    expect(edited[0].cadence).toEqual(edited[1].cadence)
  })
  it('drops the sibling of a Channel that is switched off, and its rate', () => {
    const edits = editsOf(speakerCard, speakerCard.recipes)
    const edited = applyEdits(speakerCard, {
      ...edits,
      channels: { bluesky: edits.channels.bluesky },
    })
    expect(edited.map((r) => r.key)).toEqual([
      'speakerCardRender',
      'speakerCard:bluesky',
    ])
    expect(edited[1].cadence?.perWeek).toEqual({ bluesky: 3 })
  })
  it('reads the edits back from stored Recipes', () => {
    const edits = editsOf(speakerCard, speakerCard.recipes)
    const stored = applyEdits(speakerCard, {
      ...edits,
      title: 'Meet the speaker',
      channels: { bluesky: { skeleton: '{name} {url}', perWeek: 4 } },
    })
    expect(editsOf(speakerCard, stored)).toMatchObject({
      title: 'Meet the speaker',
      channels: { bluesky: { skeleton: '{name} {url}', perWeek: 4 } },
    })
    expect(editsOf(speakerCard, stored).channels.linkedin).toBeUndefined()
  })
})

describe('editIssues — the strict placeholder rule', () => {
  const edits = editsOf(speakerCard, speakerCard.recipes)
  it('accepts the entry as shipped', () => {
    for (const entry of LIBRARY)
      expect(editIssues(entry, editsOf(entry, entry.recipes))).toEqual([])
  })
  it('refuses a token that is not valid for the subject, naming it', () => {
    expect(
      editIssues(speakerCard, {
        ...edits,
        channels: { bluesky: { skeleton: 'Hi {recipient}, {tier}! {url}' } },
      }),
    ).toEqual([
      'Bluesky copy: {recipient}, {tier} cannot be filled in for this Recipe.',
    ])
  })
  it('refuses an unknown token in the alt text too', () => {
    expect(editIssues(speakerCard, { ...edits, alt: '{nmae}' })).toEqual([
      'Alt text: {nmae} cannot be filled in for this Recipe.',
    ])
  })
  it('lets the countdown count {days} and a sponsor name its {tier}', () => {
    expect(
      editIssues(libraryEntry('sponsorCard'), {
        ...editsOf(
          libraryEntry('sponsorCard'),
          libraryEntry('sponsorCard').recipes,
        ),
        alt: '{name}, {tier}',
      }),
    ).toEqual([])
    expect(
      editIssues(speakerCard, {
        ...edits,
        channels: { bluesky: { skeleton: '{days} to go' } },
      }),
    ).toEqual(['Bluesky copy: {days} cannot be filled in for this Recipe.'])
  })
  it('refuses no Channel at all, and a Channel the entry has no sibling for', () => {
    expect(editIssues(speakerCard, { ...edits, channels: {} })).toEqual([
      'Choose at least one Channel.',
    ])
    expect(
      editIssues(countdown, {
        ...editsOf(countdown, countdown.recipes),
        channels: { linkedin: { skeleton: '{days}', perWeek: 7 } },
      }),
    ).toEqual(['This Recipe does not post to LinkedIn.'])
  })
})

describe('entryCeilingNotes', () => {
  it('warns when a rate is over what the Channel carries in a week', () => {
    const edits = editsOf(speakerCard, speakerCard.recipes)
    expect(
      entryCeilingNotes({
        ...edits,
        channels: {
          linkedin: { skeleton: 'x', perWeek: 9 },
          bluesky: { skeleton: 'x', perWeek: 21 },
        },
      }),
    ).toEqual(['LinkedIn: 9 posts a week is over the ceiling of 1 a day.'])
  })
})

describe('attachEntry / removeBeat', () => {
  const custom = { recipes: [], triggers: [] }
  it('puts the Recipes and the Trigger on a Campaign', () => {
    const next = attachEntry(custom, speakerCard, speakerCard.recipes)
    expect(next.recipes).toEqual(speakerCard.recipes)
    expect(next.triggers).toEqual(speakerCard.triggers)
  })
  it('refuses the same entry twice: Recipe keys are unique in a Campaign', () => {
    const once = attachEntry(custom, speakerCard, speakerCard.recipes)
    expect(() => attachEntry(once, speakerCard, speakerCard.recipes)).toThrow(
      'This Campaign already has the Speaker card Recipe.',
    )
  })
  it('removes the beat and the Trigger that pointed into it, leaving the rest', () => {
    const both = attachEntry(
      attachEntry(custom, speakerCard, speakerCard.recipes),
      countdown,
      countdown.recipes,
    )
    const next = removeBeat(both, 'speakerCard')
    expect(next.recipes).toEqual(countdown.recipes)
    expect(next.triggers).toEqual([])
  })
})
