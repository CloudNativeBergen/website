/**
 * THE WORKSHOP-TICKET LIST AS AN ORGANIZER SEES IT (#1332).
 *
 * Every answer here is decided by `workshopAccessOf`, the rule the portal runs,
 * so the page cannot show one thing while the gate decides another. The
 * expected values are written out by hand from the spec's terms (§2), never
 * recomputed with the rule.
 */
import { describe, expect, it } from 'vitest'
import { buildWorkshopTicketList } from './ticket-list'

const TWO_DAY = 'Workshop + Conference (2 days)'
const SPEAKER = 'Speaker ticket'

describe('a conference that has marked nothing', () => {
  it('is not configured, and names what the built-in list grants', () => {
    const list = buildWorkshopTicketList(['Early Bird', SPEAKER, TWO_DAY], [])

    expect(list.configured).toBe(false)
    expect(list.builtInGranted).toEqual([SPEAKER, TWO_DAY])
    // Each type also carries the OTHER types that list grants: the ones that
    // stop granting when this type is the first one marked.
    expect(list.types).toEqual([
      {
        typeName: 'Early Bird',
        access: 'denied',
        lastGranting: false,
        builtInGrants: false,
        builtInGrantedOthers: [SPEAKER, TWO_DAY],
        builtInGrantedOthersSetToNo: [],
      },
      {
        typeName: SPEAKER,
        access: 'granted',
        lastGranting: false,
        builtInGrants: true,
        builtInGrantedOthers: [TWO_DAY],
        builtInGrantedOthersSetToNo: [],
      },
      {
        typeName: TWO_DAY,
        access: 'granted',
        lastGranting: false,
        builtInGrants: true,
        builtInGrantedOthers: [SPEAKER],
        builtInGrantedOthersSetToNo: [],
      },
    ])
    expect(list.orphaned).toEqual([])
  })

  /**
   * The carry-over is saved as one batch, and the save refuses a batch that
   * names one type twice (names fold case and surrounding space). So the
   * others are matched the way the save matches them: never this type under
   * another spelling, and never one type twice.
   */
  it('never offers the same type twice in the carry-over', () => {
    const list = buildWorkshopTicketList(
      [SPEAKER, 'speaker ticket ', TWO_DAY],
      [],
    )

    expect(list.types.map((t) => [t.typeName, t.builtInGrantedOthers])).toEqual(
      [
        [SPEAKER, [TWO_DAY]],
        ['speaker ticket ', [TWO_DAY]],
        [TWO_DAY, [SPEAKER]],
      ],
    )
  })

  it('stays not configured on a lone no, and keeps that stored answer', () => {
    const list = buildWorkshopTicketList(
      [SPEAKER],
      [{ typeName: SPEAKER, grantsWorkshop: false }],
    )

    expect(list.configured).toBe(false)
    // The built-in list still decides, whatever the stored no says.
    expect(list.types).toEqual([
      {
        typeName: SPEAKER,
        access: 'granted',
        stored: false,
        lastGranting: false,
        builtInGrants: true,
        builtInGrantedOthers: [],
        builtInGrantedOthersSetToNo: [],
      },
    ])
  })

  /**
   * A CARRY-OVER NEVER OVERWRITES A STORED NO. While nothing is set to grant,
   * the built-in list overrules a stored no, so a type can be both "granted
   * today" and "answered no". The carry-over writes `true` for the types it
   * names: it names the granted types with no stored no, and the ones with a
   * stored no are listed apart, so the question can say they are blocked.
   */
  it('keeps a type with a stored no out of the carry-over, and names it apart', () => {
    const list = buildWorkshopTicketList(
      ['Early Bird', SPEAKER, TWO_DAY, 'Sponsor discount (workshop upgrade)'],
      [
        { typeName: 'speaker ticket ', grantsWorkshop: false },
        { typeName: 'Early Bird', grantsWorkshop: false },
      ],
    )

    expect(list.configured).toBe(false)
    expect(
      list.types.map((t) => [
        t.typeName,
        t.access,
        t.builtInGrantedOthers,
        t.builtInGrantedOthersSetToNo,
      ]),
    ).toEqual([
      [
        'Early Bird',
        'denied',
        [TWO_DAY, 'Sponsor discount (workshop upgrade)'],
        [SPEAKER],
      ],
      // Its own stored no is not "another type's".
      [
        SPEAKER,
        'granted',
        [TWO_DAY, 'Sponsor discount (workshop upgrade)'],
        [],
      ],
      [TWO_DAY, 'granted', ['Sponsor discount (workshop upgrade)'], [SPEAKER]],
      ['Sponsor discount (workshop upgrade)', 'granted', [TWO_DAY], [SPEAKER]],
    ])
  })

  it('has no types to list when the provider returns none', () => {
    const list = buildWorkshopTicketList([], undefined)

    expect(list).toEqual({
      version: expect.any(String),
      configured: false,
      types: [],
      builtInGranted: [],
      orphaned: [],
    })
  })

  /**
   * A PROVIDER THAT LISTS NOTHING SAYS NOTHING ABOUT THE STORED ANSWERS. With
   * no types to compare against, every entry would look orphaned and be
   * offered for removal, the last granting one included.
   */
  it('calls no stored answer orphaned when the provider lists no types', () => {
    const list = buildWorkshopTicketList(
      [],
      [
        { typeName: 'Two-day pass', grantsWorkshop: true },
        { typeName: 'Day pass', grantsWorkshop: false },
      ],
    )

    expect(list).toEqual({
      version: expect.any(String),
      configured: true,
      types: [],
      builtInGranted: [],
      orphaned: [],
    })
  })
})

describe('a conference that has marked a type', () => {
  const roles = [
    { typeName: 'Workshop dag', grantsWorkshop: true },
    { typeName: 'Conference only', admits: true, grantsWorkshop: false },
    { typeName: 'Seating only', admits: true },
    { typeName: 'Workshop 2025', admits: true, grantsWorkshop: true },
    { typeName: 'Gone add-on', admits: false },
  ]

  it('gives each provider type the answer the rule gives its holders', () => {
    const list = buildWorkshopTicketList(
      [
        '  WORKSHOP DAG',
        'Conference only',
        'Seating only',
        'New type',
        SPEAKER,
      ],
      roles,
    )

    expect(list.configured).toBe(true)
    expect(list.types).toEqual([
      // Matched ignoring case and surrounding space, shown as the provider
      // spells it.
      {
        typeName: '  WORKSHOP DAG',
        access: 'granted',
        stored: true,
        lastGranting: false,
        builtInGrants: false,
        builtInGrantedOthers: [],
        builtInGrantedOthersSetToNo: [],
      },
      {
        typeName: 'Conference only',
        access: 'denied',
        stored: false,
        lastGranting: false,
        builtInGrants: false,
        builtInGrantedOthers: [],
        builtInGrantedOthersSetToNo: [],
      },
      // An entry with only a seating answer, and a type with no entry at all:
      // both not set.
      {
        typeName: 'Seating only',
        access: 'unclassified',
        lastGranting: false,
        builtInGrants: false,
        builtInGrantedOthers: [],
        builtInGrantedOthersSetToNo: [],
      },
      {
        typeName: 'New type',
        access: 'unclassified',
        lastGranting: false,
        builtInGrants: false,
        builtInGrantedOthers: [],
        builtInGrantedOthersSetToNo: [],
      },
      // The built-in list is off: its name no longer grants, and there is
      // nothing left to carry over.
      {
        typeName: SPEAKER,
        access: 'unclassified',
        lastGranting: false,
        builtInGrants: true,
        builtInGrantedOthers: [],
        builtInGrantedOthersSetToNo: [],
      },
    ])
    // ...but it is still what comes back if the last marked type goes.
    expect(list.builtInGranted).toEqual([SPEAKER])
  })

  it('lists an entry no provider type matches, only when it answers the workshop question', () => {
    const list = buildWorkshopTicketList(['Workshop dag'], roles)

    expect(list.orphaned).toEqual([
      {
        typeName: 'Conference only',
        grantsWorkshop: false,
        lastGranting: false,
      },
      { typeName: 'Workshop 2025', grantsWorkshop: true, lastGranting: false },
    ])
  })

  it('flags the one type whose answer keeps the conference configured', () => {
    const list = buildWorkshopTicketList(
      ['Workshop dag', 'Conference only'],
      [
        { typeName: 'workshop dag ', grantsWorkshop: true },
        { typeName: 'Conference only', grantsWorkshop: false },
      ],
    )

    expect(list.types.map((t) => [t.typeName, t.lastGranting])).toEqual([
      ['Workshop dag', true],
      ['Conference only', false],
    ])
  })

  it('flags an orphaned entry that is the last one granting', () => {
    const list = buildWorkshopTicketList(
      ['Workshop 2026'],
      [
        { typeName: 'Workshop 2025', grantsWorkshop: true },
        { typeName: 'Workshop 2026', grantsWorkshop: false },
      ],
    )

    expect(list.orphaned).toEqual([
      { typeName: 'Workshop 2025', grantsWorkshop: true, lastGranting: true },
    ])
    expect(list.types[0].lastGranting).toBe(false)
  })

  /**
   * AN ORPHANED GRANT BEHIND ANOTHER SPELLING. A renamed type stored under two
   * spellings, the first answering only the seating question: read by first
   * entry it looks like "no workshop answer", yet the second spelling keeps
   * the conference off the built-in list. With no row and no orphan the
   * organizer would have nothing to remove the cause with. So an orphan is
   * looked for across EVERY spelling of a name the provider does not list.
   */
  it('finds an orphaned workshop answer in a later spelling of an unlisted name', () => {
    const list = buildWorkshopTicketList(
      ['Workshop 2026'],
      [
        { typeName: 'Workshop 2025', admits: true },
        { typeName: 'workshop 2025 ', grantsWorkshop: true },
      ],
    )

    expect(list.configured).toBe(true)
    // Named by its first spelling, which is the one a removal keeps the
    // seating answer under.
    expect(list.orphaned).toEqual([
      { typeName: 'Workshop 2025', grantsWorkshop: true, lastGranting: true },
    ])
    expect(list.types[0].access).toBe('unclassified')
  })

  it('reads a LISTED type by its first entry only, as the rule does', () => {
    const list = buildWorkshopTicketList(
      ['Workshop 2025'],
      [
        { typeName: 'Workshop 2025', admits: true },
        { typeName: 'workshop 2025 ', grantsWorkshop: true },
      ],
    )

    expect(list.orphaned).toEqual([])
    expect(list.types).toEqual([
      {
        typeName: 'Workshop 2025',
        access: 'unclassified',
        lastGranting: true,
        builtInGrants: false,
        builtInGrantedOthers: [],
        builtInGrantedOthersSetToNo: [],
      },
    ])
  })

  it('lists a twice-stored unlisted name once', () => {
    const list = buildWorkshopTicketList(
      ['Workshop dag'],
      [
        { typeName: 'Workshop dag', grantsWorkshop: true },
        { typeName: 'Old', grantsWorkshop: false },
        { typeName: ' old ', grantsWorkshop: true },
      ],
    )

    // One orphan for the name. It grants if ANY spelling does: for a name no
    // ticket carries, that is all its entries still decide (whether the
    // conference is off the built-in list).
    expect(list.orphaned).toEqual([
      { typeName: 'Old', grantsWorkshop: true, lastGranting: false },
    ])
  })
})
