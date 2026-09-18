/**
 * THE STUDIO HALF of `conference.ticketTypeRoles`.
 *
 * An entry here answers two independent questions: does this type seat a human
 * (`admits`, which moves the participant count) and does it grant workshop
 * access (`grantsWorkshop`, which is access control). Either may be left
 * unanswered — an entry exists to answer ONE of them — and
 * `@/lib/tickets/classification` reads an absent `admits` as "one seat,
 * undeclared", never as a human saying no.
 *
 * So Studio must neither invent an answer nor render an absent one as a
 * refusal. Both were true: `admits` carried `initialValue: true`, so opening
 * the array to declare workshop access alone wrote a seating declaration
 * nobody made, and the preview rendered every falsy `admits` — absent included
 * — as "Add-on — seats nobody".
 */
import { describe, expect, it } from 'vitest'
import conference from '../../sanity/schemaTypes/conference'

type Field = {
  name?: string
  initialValue?: unknown
  of?: { fields?: Field[]; preview?: PreviewDef }[]
}
type PreviewDef = {
  prepare: (v: {
    title?: string
    admits?: boolean
    grantsWorkshop?: boolean
  }) => { title: string; subtitle: string }
}

const roles = (conference.fields as Field[]).find(
  (f) => f.name === 'ticketTypeRoles',
)!
const entry = roles.of![0]
const field = (name: string) => entry.fields!.find((f) => f.name === name)!
const prepare = (entry.preview as PreviewDef).prepare

describe('the ticket type role entry', () => {
  it('does not pre-answer the seating question', () => {
    expect(field('admits').initialValue).toBeUndefined()
  })

  /** Unchanged, and for the same reason: only an explicit `true` declares. */
  it('does not pre-answer the workshop question either', () => {
    expect(field('grantsWorkshop').initialValue).toBeUndefined()
  })
})

describe('the ticket type role preview', () => {
  const subtitle = (admits?: boolean, grantsWorkshop?: boolean) =>
    prepare({ title: 'Speaker ticket', admits, grantsWorkshop }).subtitle

  it('tells the three seating states apart', () => {
    expect(subtitle(true)).toBe('Seats an attendee')
    expect(subtitle(false)).toBe('Add-on — seats nobody')
    // The one the old preview got wrong: absent is not a declared no.
    expect(subtitle(undefined)).toBe('Seating not declared')
  })

  it('names workshop access only where it was declared', () => {
    expect(subtitle(true, true)).toBe(
      'Seats an attendee · grants workshop access',
    )
    expect(subtitle(undefined, true)).toBe(
      'Seating not declared · grants workshop access',
    )
    expect(subtitle(true, false)).toBe('Seats an attendee')
  })
})
