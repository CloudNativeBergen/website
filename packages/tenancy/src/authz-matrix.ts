// The §4 role × action matrix of docs/AUTHORIZATION.md, as data: the ONE
// source both `can()` and its test table read (authz.test.ts). Phase 1 holds
// only the actions an existing check needs, and only the principal columns
// the envelope can carry today. Conference roles (Org, Rev, Vol) and resource
// roles (Spk, CoS, Spn) arrive with phase 3 / 3b; until then they are N
// everywhere by construction. Keep each row identical to the doc's.

export const COLUMNS = ['Op', 'Own', 'Adm', 'Mem', 'Site'] as const
export type Column = (typeof COLUMNS)[number]

type Cell = 'Y' | 'N'
type Row = Record<Column, Cell>

const row = (cells: string): Row => {
  const c = cells.trim().split(/\s+/) as Cell[]
  if (c.length !== COLUMNS.length || c.some((x) => x !== 'Y' && x !== 'N'))
    throw new Error(`bad matrix row: ${cells}`)
  return Object.fromEntries(COLUMNS.map((k, i) => [k, c[i]])) as Row
}

/**
 * `satisfies` keeps the keys literal, so `Action` is the closed union and a
 * check naming an action the matrix lacks is a compile error.
 */
export const MATRIX = {
  //                              Op Own Adm Mem Site
  'org.read_settings': row('       Y  Y   Y   Y   N'),
  'org.manage_members': row('      Y  Y   Y   N   N'),
  'conference.read_draft': row('   Y  Y   Y   Y   N'),
  'conference.read_ticket_setup': row('Y Y Y Y Y'),
  'conference.update_settings': row('Y Y  Y   N   N'),
  'conference.set_lifecycle': row('Y  Y   Y   N   N'),
  'conference.bind_ticketing': row('Y N   N   N   N'),
  'speaker_directory.read': row('  Y  Y   Y   N   N'),
  'api_client.read': row('         Y  Y   Y   N   N'),
  'api_client.create': row('       N  Y   N   N   N'),
  'api_client.revoke': row('       Y  Y   N   N   N'),
  'pat.manage_own': row('          N  Y   Y   Y   N'),
  'user.revoke_all': row('         Y  N   N   N   N'),
  'ticketing.read': row('         Y  Y   Y   N   N'),
  'attendee.read_pii': row('      Y  Y   Y   N   N'),
  reminder_lock: row('             Y  N   N   N   Y'),
} satisfies Record<string, Row>

export type Action = keyof typeof MATRIX
