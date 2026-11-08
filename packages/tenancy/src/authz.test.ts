// Authorization phase 1 (#2106, docs/AUTHORIZATION.md §3.3, §5).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COLUMNS,
  MATRIX,
  OPERATOR_SCOPE,
  SITE_SCOPE,
  can,
  parseOrgRoles,
  principalOf,
  principalOfRole,
  type Action,
  type Column,
  type Envelope,
} from './index'

afterEach(() => vi.restoreAllMocks())
const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {})

const ACTIONS = Object.keys(MATRIX) as Action[]

describe('the matrix fixture', () => {
  // The doc's §4 table is the owner-decided policy; the fixture must say the
  // same thing for every column it carries.
  const doc = readFileSync(
    join(import.meta.dirname, '../../../docs/AUTHORIZATION.md'),
    'utf8',
  )
  const header = [
    'Action',
    'Op',
    'Own',
    'Adm',
    'Mem',
    'Org',
    'Rev',
    'Vol',
    'Spk',
    'CoS',
    'Spn',
    'Site',
  ]
  const docRows = new Map(
    doc
      .split('\n')
      .filter((l) => /^\| [a-z_]+\.?[a-z_]* /.test(l))
      .map((l) =>
        l
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim()),
      )
      .filter((c) => c.length === header.length)
      .map((c) => [c[0].split(' ')[0], c] as const),
  )

  it.each(ACTIONS)('%s matches the doc row', (action) => {
    const cells = docRows.get(action)
    expect(cells, `no §4 row for ${action}`).toBeDefined()
    for (const col of COLUMNS)
      expect(MATRIX[action][col], `${action} × ${col}`).toBe(
        cells![header.indexOf(col)],
      )
  })
})

describe('can(): the table generated from the matrix', () => {
  const cases = ACTIONS.flatMap((action) =>
    COLUMNS.map((col) => [action, col, MATRIX[action][col] === 'Y'] as const),
  )
  it.each(cases)('%s × %s → %s', (action, col, allowed) => {
    expect(can(new Set<Column>([col]), action)).toBe(allowed)
  })

  it('denies everything to an empty principal and to an unknown action', () => {
    for (const a of ACTIONS) expect(can(new Set(), a)).toBe(false)
    expect(can(new Set(COLUMNS), 'org.delete' as Action)).toBe(false)
  })
})

describe('parseOrgRoles', () => {
  it.each([
    ['owner', ['owner']],
    ['Admin', ['admin']],
    [' owner ', ['owner']],
    ['member,admin', ['admin', 'member']],
    ['OWNER, Member', ['member', 'owner']],
    ['', []],
    [null, []],
    [undefined, []],
    [' , ', []],
  ])('%j → %j', (raw, roles) => {
    expect([...parseOrgRoles(raw)].sort()).toEqual(roles)
  })

  it.each([
    'guest',
    'superadmin',
    'ow ner',
    'admin;owner',
    'operator',
    'organizer',
    'site:server',
    'platform:operator',
  ])('ignores and logs the unknown role %j', (raw) => {
    const warn = quiet()
    expect(parseOrgRoles(raw).size).toBe(0)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('authz.unknown_role'),
    )
  })

  it('keeps the known roles next to an unknown one', () => {
    quiet()
    expect([...parseOrgRoles('guest,admin')]).toEqual(['admin'])
  })

  it('an unknown role string grants nothing', () => {
    quiet()
    for (const raw of ['guest', 'superadmin', 'operator', 'Owner!'])
      for (const a of ACTIONS) expect(can(principalOfRole(raw), a)).toBe(false)
  })
})

const tenant = (
  orgRole: string | null,
  scopes: string[] = [],
  userId: string | null = 'u1',
): Envelope => ({
  typ: 'tenant',
  orgId: 'org',
  conferenceId: 'conf',
  userId,
  orgRole,
  scopes,
})

describe('principalOf', () => {
  it('a PlatformContext is an operator; a UserContext holds nothing', () => {
    expect([
      ...principalOf({
        typ: 'platform',
        userId: 'u',
        platformRole: 'operator',
      }),
    ]).toEqual(['Op'])
    expect(principalOf({ typ: 'user', userId: 'u' }).size).toBe(0)
    expect(principalOf(null).size).toBe(0)
  })

  it('org roles and the operator scope count only with a user', () => {
    expect(principalOf(tenant('owner', [OPERATOR_SCOPE], null)).size).toBe(0)
    expect([...principalOf(tenant(null, [SITE_SCOPE], null))]).toEqual(['Site'])
  })
})

describe('site:server is a lane marker with two capabilities', () => {
  const site = principalOf(tenant(null, [SITE_SCOPE], null))
  const allowed: Action[] = ['reminder_lock', 'conference.read_ticket_setup']

  it.each(allowed)('allows %s', (a) => expect(can(site, a)).toBe(true))
  it.each(ACTIONS.filter((a) => !allowed.includes(a)))('refuses %s', (a) =>
    expect(can(site, a)).toBe(false),
  )
})

// The cross-reader test (§5): the predicates as they were on main before
// phase 1, copied verbatim, against can() over the same inputs. Any
// disagreement must be one of the INTENDED changes below, and every intended
// change must actually occur.
describe('cross-reader: old predicates vs can()', () => {
  type E = Extract<Envelope, { typ: 'tenant' }>
  const OP = 'platform:operator'
  const SITE = 'site:server'
  const WRITERS = new Set(['owner', 'admin'])
  const trimRoles = (e: E) => e.orgRole?.split(',').map((r) => r.trim()) ?? []
  const lowerRoles = (e: E) =>
    (e.orgRole ?? '').split(',').map((r) => r.trim().toLowerCase())

  const old = {
    // services/conference/src/data/index.ts update()
    C1: (e: E) =>
      !!e.userId &&
      (e.scopes.includes(OP) || trimRoles(e).some((r) => WRITERS.has(r))),
    // conference current()/editions(), content, the settings fields
    C2: (e: E) => !!e.orgRole,
    // the vendor binding arm
    C3: (e: E) => e.scopes.includes(OP) || e.scopes.includes(SITE),
    // reminderWhere()
    C4: (e: E) => e.scopes.includes(SITE) || e.scopes.includes(OP),
    // subgraph.ts isMemberOrSite
    C5: (e: E) =>
      !!e.orgRole?.trim() || e.scopes.includes(OP) || e.scopes.includes(SITE),
    // tenant-directory sessionOrgId
    D2_session: (e: E) => !!(e.orgRole || e.scopes.includes(OP)),
    // tenant-directory resolveReference / conferenceLifecycle (draft)
    D2_draft: (e: E) => !!e.orgRole,
    // tenant-directory setConferenceLifecycle
    D3: (e: E) =>
      !!e.userId &&
      (e.scopes.includes(OP) || trimRoles(e).some((r) => WRITERS.has(r))),
    // identity reader(): any role, and "manager"
    I1_read: (e: E) =>
      !!e.userId && (e.scopes.includes(OP) || lowerRoles(e).some((r) => r)),
    I1_manager: (e: E) =>
      !!e.userId &&
      (e.scopes.includes(OP) ||
        lowerRoles(e).some((r) => r === 'owner' || r === 'admin')),
    // identity isOrganizer (speakerDirectory), tenant lane
    I6: (e: E) =>
      !!e.userId &&
      (e.scopes.includes(OP) ||
        lowerRoles(e).some((r) => r === 'owner' || r === 'admin')),
  }
  const now: Record<keyof typeof old, (e: E) => boolean> = {
    C1: (e) => can(principalOf(e), 'conference.update_settings'),
    C2: (e) => can(principalOf(e), 'conference.read_draft'),
    C3: (e) =>
      can(principalOf(e), 'conference.bind_ticketing') ||
      e.scopes.includes(SITE_SCOPE),
    C4: (e) => can(principalOf(e), 'reminder_lock'),
    C5: (e) => can(principalOf(e), 'conference.read_ticket_setup'),
    D2_session: (e) => can(principalOf(e), 'org.read_settings'),
    D2_draft: (e) => can(principalOf(e), 'conference.read_draft'),
    D3: (e) => can(principalOf(e), 'conference.set_lifecycle'),
    I1_read: (e) => can(principalOf(e), 'org.read_settings'),
    I1_manager: (e) => can(principalOf(e), 'org.manage_members'),
    I6: (e) => can(principalOf(e), 'speaker_directory.read'),
  }

  const ROLES = [
    'owner',
    'admin',
    'member',
    'owner,admin',
    'member,admin',
    'Admin',
    'ADMIN,member',
    ' owner ',
    'Owner',
    '',
    null,
    ' ',
    'guest',
    'ow ner',
  ]
  const SCOPES = [[], [OP], [SITE]]
  const USERS = ['u1', null]
  const inputs: E[] = ROLES.flatMap((r) =>
    SCOPES.flatMap((s) => USERS.map((u) => tenant(r, s, u) as E)),
  )

  const known = (e: E) => parseOrgRoles(e.orgRole).size > 0
  /** The intended changes, each named. Order matters: first match wins. */
  const INTENDED: [string, (check: string, e: E, was: boolean) => boolean][] = [
    [
      // §1.2 #4: C1 and D3 were case-sensitive; "Admin" now writes.
      'case: an upper-case owner/admin now writes',
      (c, e, was) =>
        (c === 'C1' || c === 'D3') &&
        !was &&
        !!e.userId &&
        /[A-Z]/.test(e.orgRole ?? '') &&
        ['owner', 'admin'].some((r) =>
          parseOrgRoles(e.orgRole).has(r as never),
        ),
    ],
    [
      // §2.2 fail closed: an unknown or blank role string is no longer an
      // insider (C2, C5, D2 and I1 accepted any non-empty string).
      'unknown or blank role strings grant nothing',
      (_c, e, was) => was && !known(e) && !!e.orgRole,
    ],
    [
      // A role or the operator scope with no user: the gateway never mints
      // either; both now count only with a user.
      'a role or operator scope without a user grants nothing',
      (_c, e, was) =>
        was && !e.userId && (!!e.orgRole || e.scopes.includes(OP)),
    ],
    [
      // §4 matrix: operators read drafts (Op = Y on conference.read_draft).
      'operator scope reads drafts',
      (c, e, was) =>
        (c === 'C2' || c === 'D2_draft') &&
        !was &&
        !!e.userId &&
        e.scopes.includes(OP),
    ],
  ]

  it('agrees except the intended, listed changes', () => {
    const warn = quiet()
    const used = new Set<string>()
    const unexplained: string[] = []
    for (const check of Object.keys(old) as (keyof typeof old)[])
      for (const e of inputs) {
        const was = old[check](e)
        if (was === now[check](e)) continue
        const why = INTENDED.find(([, f]) => f(check, e, was))
        if (why) used.add(why[0])
        else
          unexplained.push(
            `${check} ${JSON.stringify([e.orgRole, e.scopes, e.userId])}: ${was} → ${!was}`,
          )
      }
    expect(unexplained).toEqual([])
    expect([...used].sort()).toEqual(INTENDED.map(([n]) => n).sort())
    warn.mockRestore()
  })

  it('I4 push recipients: only the parser fixes differ', () => {
    quiet()
    // services/identity/src/data/push.ts: SQL `role IN ('owner', 'admin')`.
    const oldI4 = (role: string) => role === 'owner' || role === 'admin'
    const diffs = ROLES.filter((r): r is string => r !== null).filter(
      (r) => oldI4(r) !== can(principalOfRole(r), 'org.manage_members'),
    )
    // Intended (§1.2 #4, §5 phase 1): "member,admin" and case/space variants
    // of owner/admin now receive org notifications. Nothing loses them.
    expect(diffs.sort()).toEqual(
      [
        'owner,admin',
        'member,admin',
        'Admin',
        'ADMIN,member',
        ' owner ',
        'Owner',
      ].sort(),
    )
    for (const r of diffs) expect(oldI4(r)).toBe(false)
  })
})
